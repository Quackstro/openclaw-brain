# Brain Payment Action: Proof of Concept Spec

**Date:** 2026-02-08
**Status:** Draft
**Depends on:** brain-automation-pipeline-design.md

---

## Scope

This PoC implements only the **payment action type** with the following constraints:

- **Only** the `payment` action type (no messages, API calls, or issue creation)
- **Only** DOGE wallet plugin integration
- **Only** Telegram approval UX (inline buttons)
- **Only** direct/immediate triggers (no conditional or event-based triggers)
- **Only** known recipients (must exist in Brain people bucket with a DOGE address resolvable from Brain data or wallet transaction history)

Everything else described in the full design doc is out of scope for this PoC.

---

## What to Build

### 1. Extend Classifier to Detect Payment Intent

Add `"payment"` to the `DetectedIntent` type and extend the classifier prompt to detect payment intent and extract parameters.

**Changes to `classifier.ts`:**

- Add `"payment"` to `VALID_INTENTS` set
- Add `"payment"` to the `DetectedIntent` type in `schemas.ts`
- Extend `CLASSIFICATION_SYSTEM_PROMPT` with payment intent detection:

```
INTENT DETECTION (updated):
- "payment" — wants to send money, pay someone, tip someone. Extract from text:
  recipient (person name), amount (numeric), currency (default DOGE), reason (why).
```

- Add `proposedActions` to the classifier JSON output schema:

```json
"proposedActions": [
  {
    "type": "payment",
    "confidence": 0.95,
    "params": {
      "recipient": "Susie",
      "amount": "5",
      "currency": "DOGE",
      "reason": "lunch"
    }
  }
]
```

### 2. Entity Resolver for Payment

New module: `payment-resolver.ts`

**Resolves:**
- **Recipient name to DOGE address:** Search people bucket by name similarity, then search wallet transaction history for DOGE addresses used with this person.
- **Amount:** Parse from text. If missing, look up historical median for this recipient.
- **Raw address:** If the input contains a raw DOGE address (starts with `D`, 25-34 chars), use it directly and skip person lookup.

**Interface:**

```typescript
interface PaymentResolution {
  recipientName: string | null;
  dogeAddress: string | null;
  amount: number | null;
  currency: string;
  reason: string;
  resolutionScore: number;     // 0.0-1.0
  suggestedAmount: number | null;  // From history, if amount not explicit
  brainPersonId: string | null;
  isFirstTimeRecipient: boolean;
  errors: string[];
}
```

**Resolution logic:**

```
1. If raw DOGE address in params:
   - Set dogeAddress directly
   - Skip person lookup
   - resolutionScore += 0.33 (address known)

2. If recipient name in params:
   - brain_search("people", recipientName)
   - If match (similarity >= 0.85):
     - Check contactInfo for DOGE address
     - Search wallet_history for transactions mentioning this person's name
     - If address found: resolutionScore += 0.33
   - If no match: errors.push("Recipient not found in Brain")

3. If amount in params:
   - Parse numeric value
   - resolutionScore += 0.33

4. If reason in params:
   - resolutionScore += 0.34

5. Check wallet_history for prior sends to this address:
   - If none: isFirstTimeRecipient = true
   - If found: compute suggestedAmount as median of past amounts
```

### 3. Action Proposal Creation

New module: `payment-action.ts`

After entity resolution, create the Action object and attach it to the bucket record.

```typescript
function createPaymentAction(
  classification: ClassificationResult,
  resolution: PaymentResolution,
): Action {
  const classifierConfidence = classification.proposedActions?.[0]?.confidence ?? 0.8;
  const executionScore = Math.min(1.0, classifierConfidence * resolution.resolutionScore);

  return {
    id: generateUUID(),
    type: "payment",
    confidence: classifierConfidence,
    params: classification.proposedActions[0].params,
    resolvedParams: {
      to: resolution.dogeAddress,
      amount: resolution.amount,
      currency: resolution.currency,
      reason: resolution.reason,
      recipientName: resolution.recipientName,
    },
    status: "proposed",
    gating: "manual",  // Default; policy engine may upgrade to "auto"
    executionScore,
    pluginId: "doge-wallet",
    trigger: null,
    createdAt: new Date().toISOString(),
    executedAt: null,
    auditId: null,
    result: null,
    error: null,
  };
}
```

### 4. Policy Check Against Wallet Spending Tiers

Reuse the wallet's `PolicyEngine.evaluate()` for the wallet-side gate. The Brain-side gate is simpler for the PoC:

**Brain policy (PoC, hardcoded defaults):**

| Execution Score | Brain Decision |
|----------------|----------------|
| >= 0.95 AND amount <= 1 DOGE AND not first-time | auto |
| >= 0.70 | prompt (Telegram approval) |
| >= 0.50 | prompt with warning |
| < 0.50 | store as pending, no prompt |

**Wallet policy (existing, no changes):**

| Tier | Amount | Action |
|------|--------|--------|
| Micro | <= 1 DOGE | auto |
| Small | <= 10 DOGE | auto-logged |
| Medium | <= 100 DOGE | notify-delay (5 min) |
| Large | <= 1000 DOGE | owner-required |
| Sweep | > 1000 DOGE | owner-confirm-code |

Both gates must pass for auto-execution. If either requires manual approval, the user is prompted.

### 5. Telegram Inline Button Approval

When the policy requires manual approval, send a Telegram message with inline buttons.

**Message format:**

```
🧠💸 Brain Payment Proposal
━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 To: Susie (D7xAbc...def)
💰 Amount: 5.00 DOGE (~$0.55)
📝 Reason: lunch
🎯 Score: 95%

[✅ Approve] [💰 Edit Amount] [❌ Dismiss]
```

**Callback handlers (add to AGENTS.md callbacks section):**

```
brain:pay:approve:<actionId>    -> Execute payment
brain:pay:edit:<actionId>       -> Ask for new amount, re-propose
brain:pay:dismiss:<actionId>    -> Set status to "dismissed", log to audit
```

### 6. Execute via wallet_send

On approval (manual or auto), execute the payment:

```typescript
async function executePayment(action: Action): Promise<void> {
  action.status = "executing";

  try {
    // Call wallet_send tool
    const result = await toolCall("wallet_send", {
      to: action.resolvedParams.to,
      amount: action.resolvedParams.amount,
      reason: action.resolvedParams.reason,
    });

    action.status = "complete";
    action.result = result;  // { txid, fee }
    action.executedAt = new Date().toISOString();
  } catch (err) {
    action.status = "failed";
    action.error = String(err);
  }
}
```

### 7. Audit Trail and Status Updates

Log every step to the Brain audit trail:

```typescript
// After classification detects payment intent:
logAudit({ action: "action-proposed", inputId, details: "Payment detected: 5 DOGE to Susie" });

// After entity resolution:
logAudit({ action: "action-resolved", inputId, details: "Recipient resolved: Susie -> D7xAbc..." });

// After policy check:
logAudit({ action: "action-policy-check", inputId, details: "Brain: prompt, Wallet: auto-logged" });

// After execution:
logAudit({ action: "action-executed", inputId, details: "Payment complete: txid=0xabc..." });
```

Update the action's `status` field on the bucket record at each transition.

---

## Test Scenarios

### Happy Path

| # | Input | Expected Behavior |
|---|-------|-------------------|
| 1 | "Pay Susie 5 DOGE for lunch" | Resolve Susie from Brain. Amount explicit. Propose payment with high score. Prompt via Telegram (5 > maxAutoValue). On approve, execute wallet_send. |
| 2 | "Send 1 DOGE to D7xAbcdef1234567890abcdef1234" | Raw address detected. Skip person lookup. Amount explicit. If score high and amount <= 1, auto-execute (micro tier). |
| 3 | "Tip Susie" | Resolve Susie. No amount. Look up wallet history for median past amount to Susie. Suggest amount in Telegram prompt. User must confirm amount. |

### Partial Resolution

| # | Input | Expected Behavior |
|---|-------|-------------------|
| 4 | "Pay Susie for the thing" | Resolve Susie. No amount. Lower resolution score. Prompt with "How much?" edit option. |
| 5 | "Pay someone 10 DOGE" | No recipient name. Cannot resolve person. Store as pending (low score). Log to audit. User can fix via `brain_fix`. |
| 6 | "Send 10 DOGE" | No recipient at all. Cannot proceed. Store as pending with error "Missing recipient." |

### Edge Cases

| # | Input | Expected Behavior |
|---|-------|-------------------|
| 7 | "Remember to pay Susie after the meeting" | Classifier detects conditional trigger. Out of PoC scope. Graceful degradation: classify as `finance` or `admin` bucket, log intent. Do NOT create payment action. Suggest in nextActions: "Pay Susie (amount TBD)." |
| 8 | "Pay Susie 50000 DOGE for the yacht" | Amount exceeds both Brain spending cap (500/week) and wallet tier (sweep). Policy: deny. Notify user of spending cap violation. |
| 9 | "Pay NewGuy 5 DOGE" | "NewGuy" not found in Brain people bucket. Store as pending. Prompt user: "I don't know NewGuy. Add them to Brain first, or provide a DOGE address." |
| 10 | "Pay Susie 5 DOGE" (wallet locked) | Entity resolution succeeds. Policy approves. Execution fails because wallet is locked. Status: failed. Error: "Wallet is locked. Run /wallet unlock first." |
| 11 | "Pay Susie 5 DOGE" (Susie has no DOGE address) | Susie found in Brain but no DOGE address in contactInfo or wallet history. Resolution incomplete. Prompt user: "I found Susie but don't have her DOGE address. Please provide it." |
| 12 | "Pay Susie 0.5 DOGE for coffee" | Amount under micro tier (1 DOGE). Susie is known (not first-time). Score >= 0.95. Brain: auto. Wallet: auto (micro). Both pass. Auto-execute silently, log to audit. |
| 13 | "Pay Susie 5 DOGE" (first-time recipient) | Susie found, address resolved, but wallet history shows no prior sends to this address. First-time recipient rule: never auto-execute. Prompt via Telegram. |

---

## Implementation Steps

### Step 1: Extend DetectedIntent and Classifier Prompt
**Complexity:** S (Small)
**Estimate:** 1-2 hours

- Add `"payment"` to `DetectedIntent` type in `schemas.ts`
- Add `"payment"` to `VALID_INTENTS` in `classifier.ts`
- Extend `CLASSIFICATION_SYSTEM_PROMPT` with payment intent and `proposedActions` field
- Update `CLASSIFICATION_JSON_SCHEMA` to include `proposedActions`
- Update `normalizeClassification()` to pass through `proposedActions`

**Test:** Drop "Pay Susie 5 DOGE for lunch" and verify classifier output includes `detectedIntent: "payment"` and `proposedActions` with correct params.

### Step 2: Build Payment Entity Resolver
**Complexity:** M (Medium)
**Estimate:** 3-4 hours

- Create `payment-resolver.ts` module
- Implement people bucket search by name
- Implement wallet history search for DOGE addresses
- Implement amount parsing and history-based suggestion
- Implement raw DOGE address detection
- Compute resolution score

**Test:** Unit tests for each resolution path: known person with address, known person without address, unknown person, raw address, missing amount.

### Step 3: Create Action Object and Schema Extension
**Complexity:** S (Small)
**Estimate:** 1-2 hours

- Define `Action` interface in `schemas.ts`
- Add `actions: "[]"` to all bucket schema seeds
- Create `payment-action.ts` with `createPaymentAction()` function
- Compute execution score from classifier confidence and resolution score

**Test:** Create action objects for various resolution outcomes. Verify score computation.

### Step 4: Implement Brain Policy Evaluation
**Complexity:** S (Small)
**Estimate:** 2-3 hours

- Create `action-policy.ts` module
- Implement threshold-based evaluation (auto/prompt/pending/deny)
- Implement first-time recipient check
- Implement rate limiting (in-memory counter for PoC, persistent for production)
- Implement spending cap check

**Test:** Unit tests for each policy outcome: auto, prompt, pending, deny, first-time override.

### Step 5: Wire into Action Router
**Complexity:** M (Medium)
**Estimate:** 2-3 hours

- Add `"payment"` case to `resolveIntent()` and `routeActions()` switch in `action-router.ts`
- Implement `handlePaymentAction()` that orchestrates: resolve, propose, evaluate policy, store action
- Ensure non-fatal: wrap entire payment flow in try/catch, always return `ActionResult`

**Test:** End-to-end: drop "Pay Susie 5 DOGE for lunch" and verify action is created on the routed record, audit trail entries logged, and correct policy decision made.

### Step 6: Telegram Approval UX
**Complexity:** M (Medium)
**Estimate:** 3-4 hours

- Create `payment-approval.ts` module
- Build Telegram message with inline buttons (approve/edit/dismiss)
- Add callback handlers for `brain:pay:approve`, `brain:pay:edit`, `brain:pay:dismiss`
- Add callback patterns to AGENTS.md
- Implement edit flow: capture next user message as new amount

**Test:** Trigger a payment requiring approval. Verify inline buttons appear. Click approve, verify action transitions to executing. Click dismiss, verify action transitions to dismissed.

### Step 7: Execute via wallet_send
**Complexity:** S (Small)
**Estimate:** 1-2 hours

- Implement `executePayment()` function
- Call `wallet_send` tool with resolved params
- Handle success: update action status, record txid
- Handle failure: update action status, record error
- Send confirmation message to Telegram

**Test:** Approve a payment and verify wallet_send is called. Verify txid is recorded. Verify Telegram confirmation is sent.

### Step 8: Audit Trail Integration
**Complexity:** S (Small)
**Estimate:** 1 hour

- Add new audit action types: `action-proposed`, `action-resolved`, `action-policy-check`, `action-approved`, `action-executing`, `action-executed`, `action-failed`, `action-dismissed`
- Log at every state transition
- Include action ID in audit details for traceability

**Test:** Drop a payment, go through full lifecycle, verify audit trail has complete history via `brain_audit`.

### Step 9: Integration Testing
**Complexity:** M (Medium)
**Estimate:** 3-4 hours

- Test all 13 scenarios from the test matrix above
- Test with real Brain data (create a test person with DOGE address)
- Test with real wallet (testnet or mainnet micro amounts)
- Test error recovery: what happens if wallet is locked mid-execution?
- Test concurrent payments: two payment drops in quick succession

### Step 10: Documentation and Config
**Complexity:** S (Small)
**Estimate:** 1 hour

- Document callback patterns in AGENTS.md
- Add default payment policy to openclaw.plugin.json
- Update brain-roadmap.md to mark payment action as in-progress

---

## Total Estimated Effort

| Step | Complexity | Hours |
|------|-----------|-------|
| 1. Extend classifier | S | 1-2 |
| 2. Entity resolver | M | 3-4 |
| 3. Action schema | S | 1-2 |
| 4. Policy evaluation | S | 2-3 |
| 5. Action router wiring | M | 2-3 |
| 6. Telegram approval UX | M | 3-4 |
| 7. wallet_send execution | S | 1-2 |
| 8. Audit trail | S | 1 |
| 9. Integration testing | M | 3-4 |
| 10. Documentation | S | 1 |
| **Total** | | **18-26 hours** |

---

## Success Criteria

The PoC is **done** when:

1. **Detection works:** Dropping "Pay Susie 5 DOGE for lunch" results in a `payment` detected intent with correct extracted params.
2. **Resolution works:** Susie is resolved to a Brain person record with a DOGE address. The resolution score reflects completeness.
3. **Policy gating works:** Actions below the auto-approve threshold trigger Telegram inline button prompts. Actions above threshold (for micro amounts to known recipients) auto-execute.
4. **Approval flow works:** Clicking "Approve" on the Telegram inline button executes the payment. Clicking "Dismiss" cancels it. Clicking "Edit Amount" allows changing the amount.
5. **Execution works:** `wallet_send` is called with correct parameters. The txid is recorded on the action object.
6. **Audit trail is complete:** Every state transition (proposed, resolved, policy-check, approved, executing, complete/failed) is logged to the Brain audit trail.
7. **First-time recipients are never auto-approved:** Even with a perfect execution score, first-time recipients require manual approval.
8. **Graceful degradation works:** "Remember to pay Susie after the meeting" (conditional trigger) does NOT create a payment action. It classifies normally and notes the intent in nextActions.
9. **Errors are non-fatal:** A failure in any payment pipeline step does not prevent the drop from being classified and routed normally.
10. **All 13 test scenarios pass** as described in the test matrix above.

---

## Fast-Follow: dev_task Action Type

After the payment PoC is validated, the next action type to implement is `dev_task`, which turns Brain drops into development work orders. This extends the pipeline from simple atomic operations (send DOGE) to complex multi-step work (edit files, commit, push) executed by spawned sub-agents.

### Scope for v2 PoC

- Detect development task intent from natural language drops
- Resolve repo paths and target files against the Brain `projects` bucket
- Assess change complexity and apply tiered gating (auto-approve doc edits, prompt for code changes, manual for destructive ops)
- Spawn a coding-agent sub-agent with task context
- Capture results: commit hash, files changed, and PR link if applicable
- Also support `research` as a lightweight sub-agent action type (non-destructive, auto-approve)

### Test Scenarios

| # | Input | Type | Expected Behavior |
|---|-------|------|-------------------|
| 1 | "Update readme installation instructions so installation from source is the preferred method" | doc edit | Resolve repo from projects bucket. Low-risk doc edit. Auto-approve if confidence >= 0.90. Spawn sub-agent to edit README and commit. |
| 2 | "Add error handling to the payment resolver" | code change | Resolve repo and file (`payment-resolver.ts`). Code change detected. Always prompt via Telegram, regardless of confidence score. |
| 3 | "Research alternatives to LanceDB for vector storage" | research | Research type, non-destructive. Auto-approve. Spawn research sub-agent. Writes findings to a file and reports summary. |
| 4 | "Fix the typo in the troubleshooting section" | doc edit | Resolve repo and target file. Low-risk doc edit. Auto-approve if confidence >= 0.90. Spawn sub-agent to fix and commit. |
| 5 | "Delete the old migration scripts" | destructive | Destructive operation detected (file deletion). Always manual with explicit confirmation, regardless of confidence score. |
| 6 | "Refactor the classifier to use streaming responses" | code change | Multi-file code change, medium complexity. Always prompt. Spawn sub-agent with broader file context. |

### Implementation Steps

#### Step 1: Extend Classifier for dev_task and research Intents
**Estimate:** 2-3 hours

- Add `"dev_task"` and `"research"` to `DetectedIntent` and `VALID_INTENTS`
- Extend classifier prompt with dev_task detection: extract repo, files, task description
- Extend classifier prompt with research detection: extract topic, scope

#### Step 2: Build Dev Task Entity Resolver
**Estimate:** 3-4 hours

- Create `devtask-resolver.ts` module
- Search `projects` bucket for matching repo or project name
- Resolve repo path on disk, identify target files if specified
- Assess complexity: S (single doc/config file), M (single source file or small set), L (multi-file refactor)
- Classify change type: doc-edit, code-change, or destructive

#### Step 3: Implement Gating Policy for dev_task
**Estimate:** 1-2 hours

- Doc edits (README, markdown, config, comments): auto-approve if confidence >= 0.90
- Code changes (source files, tests): always prompt
- Destructive operations (delete files, force push, schema migrations): always manual with confirmation
- Wire into existing `action-policy.ts` framework

#### Step 4: Sub-Agent Spawning and Result Capture
**Estimate:** 3-4 hours

- Implement `sessions_spawn` integration for coding-agent sub-agents
- Pass task description, repo path, file context, and constraints to the sub-agent
- Capture sub-agent results: commit hash, files changed, diff summary
- Record results on the Action object and log to audit trail

#### Step 5: Research Action Type
**Estimate:** 1-2 hours

- Simpler variant of dev_task: always auto-approve (non-destructive)
- Spawn research sub-agent with topic and scope
- Write findings to output file, report summary to user

#### Step 6: Integration Testing
**Estimate:** 2-3 hours

- Test all 6 scenarios from the test matrix above
- Test with real repos in the projects bucket
- Test gating: verify doc edits auto-approve, code changes prompt, destructive ops require manual confirmation
- Test error handling: unknown repo, missing files, sub-agent failure

### Estimated Effort

| Step | Hours |
|------|-------|
| 1. Extend classifier | 2-3 |
| 2. Entity resolver | 3-4 |
| 3. Gating policy | 1-2 |
| 4. Sub-agent spawning | 3-4 |
| 5. Research action | 1-2 |
| 6. Integration testing | 2-3 |
| **Total** | **12-18 hours** |
