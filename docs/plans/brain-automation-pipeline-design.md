# Brain 2.0 Automation Pipeline: Full Design Document

**Date:** 2026-02-08
**Status:** Draft
**Authors:** Jarvis (AI Agent) for Dr. Castro / Quackstro LLC

---

## Table of Contents

1. [Overview](#1-overview)
2. [Actions Array Schema](#2-actions-array-schema)
3. [Entity Resolution Engine](#3-entity-resolution-engine)
4. [Action Proposal](#4-action-proposal)
5. [Action Policy Engine](#5-action-policy-engine)
6. [Conditional Triggers](#6-conditional-triggers)
7. [Plugin Action Registry](#7-plugin-action-registry)
8. [Execution Engine](#8-execution-engine)
9. [Approval UX](#9-approval-ux)
10. [Safety and Guardrails](#10-safety-and-guardrails)
11. [Configuration Schema](#11-configuration-schema)
12. [Quackstro Protocol Integration](#12-quackstro-protocol-integration)
13. [Pipeline Diagrams](#13-pipeline-diagrams)

---

## 1. Overview

The Brain Automation Pipeline transforms Brain from a "smart filing cabinet" into an autonomous action engine. When a user drops a thought like "Pay Susie 5 DOGE for lunch," the pipeline classifies it, resolves entities (who is Susie? what is her DOGE address?), proposes an action (send 5 DOGE), evaluates it against configurable policies, and either auto-executes or prompts for approval.

### Design Principles

- **Confidence-gated execution:** Every action has a computed execution score. Higher scores unlock more automation; lower scores require human approval.
- **Double gating for payments:** Brain confidence gate AND wallet spending policy operate as two independent safety layers.
- **Non-fatal by design:** Action pipeline failures never block the drop pipeline. Classification and routing always complete.
- **Audit everything:** Every action proposal, policy evaluation, execution, and failure is logged to the audit trail.
- **Opt-in auto-approve:** No action type auto-executes until the user explicitly enables it.

### Current State

The existing action router (`action-router.ts`) handles five intent types: reminder, booking, todo, purchase, and call. Of these, only reminder/booking trigger real-world actions (cron job creation). Todo, purchase, and call merely log to the audit trail. The classifier already extracts `entities.people`, `entities.amounts`, `entities.dates`, and `entities.locations`, but these fields are logged and never acted upon.

The wallet plugin has a mature `PolicyEngine` with tiered auto-approval, a `LimitTracker` for rate limiting, and an `ApprovalQueue` for pending human approvals. This pattern is the direct model for the generalized Action Policy Engine.

---

## 2. Actions Array Schema

Each bucket record gains a new `actions` field (JSON-serialized array) storing proposed and executed actions.

### Action Object Schema

```typescript
interface Action {
  /** Unique action ID (UUID) */
  id: string;

  /** Action type matching a registered plugin action */
  type: string;  // "payment" | "send_message" | "reminder" | "create_issue" | "http_call" | ...

  /** Confidence that this action was correctly inferred from the input (0.0-1.0) */
  confidence: number;

  /** Raw extracted parameters (from classifier) */
  params: {
    [key: string]: unknown;
    // For payment: { recipient: "Susie", amount: "5", currency: "DOGE", reason: "lunch" }
    // For message: { to: "John", message: "dinner still on?" }
  };

  /** Resolved parameters (after entity resolution) */
  resolvedParams: {
    [key: string]: unknown;
    // For payment: { to: "D7xAbc...", amount: 5, currency: "DOGE", reason: "lunch", recipientName: "Susie" }
    // For message: { chatId: "12345", message: "dinner still on?", recipientName: "John" }
  } | null;

  /** Current lifecycle status */
  status:
    | "proposed"         // Action inferred, not yet evaluated
    | "pending_trigger"  // Waiting for a conditional trigger
    | "approved"         // Policy approved, ready to execute
    | "executing"        // Currently running
    | "complete"         // Successfully executed
    | "failed"           // Execution failed
    | "dismissed"        // User dismissed
    | "expired";         // Trigger condition expired

  /** How the action is gated */
  gating: "auto" | "manual" | "disabled";

  /** Computed execution score: confidence * entityResolutionScore * historyBonus */
  executionScore: number;

  /** Which plugin handles execution */
  pluginId: string;  // "doge-wallet" | "telegram" | "github" | "cron" | "webhook"

  /** Conditional trigger (null for immediate actions) */
  trigger: ActionTrigger | null;

  /** Timestamps */
  createdAt: string;   // ISO 8601
  executedAt: string | null;

  /** Link to audit trail entry for this action */
  auditId: string | null;

  /** Execution result (plugin-specific) */
  result: {
    [key: string]: unknown;
    // For payment: { txid: "abc123", fee: 0.01 }
  } | null;

  /** Error message if failed */
  error: string | null;
}

interface ActionTrigger {
  type: "time" | "event" | "manual";

  /** For time triggers: ISO datetime or cron expression */
  at?: string;
  cron?: string;

  /** For event triggers: description of the condition */
  condition?: string;

  /** Embedding of the condition text (for semantic matching) */
  conditionVector?: number[];

  /** Whether the trigger has fired */
  fired: boolean;
  firedAt?: string;
}
```

### Schema Seed Update

The `schemaSeed` function in `schemas.ts` must be updated for every bucket to include:

```typescript
actions: "[]"  // JSON-serialized Action[]
```

### Migration

Existing records have no `actions` field. The pipeline treats missing/empty `actions` as equivalent to `[]`. No data migration is required; LanceDB will accept the new field on first write.

---

## 3. Entity Resolution Engine

After classification, the Entity Resolution Engine resolves extracted entity strings against known Brain data and external sources.

### 3.1 People Resolution

**Input:** `entities.people` array from classifier (e.g., `["Susie"]`).

**Resolution steps:**
1. Search the `people` bucket by semantic similarity to the name string.
2. If a match is found (similarity >= 0.85), pull the `PersonRecord`:
   - `name`: confirmed display name
   - `contactInfo`: may contain phone, email, Telegram handle
   - Search wallet transaction history for DOGE addresses associated with this person (by matching `reason` fields containing the person's name)
3. If no Brain match, search wallet transaction history directly for the name in past `reason` strings.
4. Return a `ResolvedPerson` object or `null`.

```typescript
interface ResolvedPerson {
  brainId: string | null;       // People bucket record ID
  name: string;                 // Confirmed name
  dogeAddress: string | null;   // From wallet history or contactInfo
  contactInfo: string | null;   // Raw contact info from Brain
  confidence: number;           // How certain is this match (0.0-1.0)
  source: "brain" | "wallet_history" | "manual";
}
```

### 3.2 Amount Resolution

**Input:** `entities.amounts` array from classifier (e.g., `["5 DOGE"]`, `["$20"]`).

**Resolution steps:**
1. Parse amount string: extract numeric value and currency.
2. If currency is missing, default to DOGE.
3. If amount is missing but recipient is known, check past transactions for typical amounts with this person. Use the median of past 5 transactions as a suggestion (not auto-fill).
4. Validate amount is positive and within sane bounds.

```typescript
interface ResolvedAmount {
  value: number;
  currency: string;
  source: "explicit" | "suggested_from_history" | "unknown";
  historicalMedian: number | null;  // Median past amount to this recipient
}
```

### 3.3 Date/Trigger Resolution

**Input:** `entities.dates` array, `followUpDate`, urgency field.

**Resolution steps:**
1. Parse date strings into ISO datetime (reuse existing LLM time extraction from action router).
2. Match against existing Brain items for event-based triggers ("after the meeting" resolves to a specific admin/booking item).
3. For cron patterns ("every Monday"), generate cron expression.
4. Return trigger specification.

### 3.4 Location Resolution

**Input:** `entities.locations` array.

**Resolution steps:**
1. Search Brain records for known locations (admin items with location data, people with addresses).
2. Normalize location strings.
3. For location-based triggers (future feature), store geofence data.

### 3.5 Resolution Score

The entity resolution engine produces an overall resolution score:

```
resolutionScore = (resolvedFields / totalRequiredFields)
```

For a payment action, required fields are: recipient (with DOGE address), amount, reason.
- All three resolved: `resolutionScore = 1.0`
- Recipient resolved but no amount: `resolutionScore = 0.67`
- Nothing resolved: `resolutionScore = 0.0`

---

## 4. Action Proposal

The classifier prompt is extended to detect action intents beyond the current six. During classification, the LLM proposes actions with extracted parameters.

### 4.1 Extended DetectedIntent

```typescript
type DetectedIntent =
  | "reminder"    // existing
  | "todo"        // existing
  | "purchase"    // existing
  | "call"        // existing
  | "booking"     // existing
  | "payment"     // NEW: send money
  | "message"     // NEW: send a message to someone
  | "api_call"    // NEW: trigger a webhook/API
  | "none";
```

### 4.2 Extended Classification Output

The classifier output gains a new `proposedActions` field:

```typescript
interface ClassificationResult {
  // ... existing fields ...

  /** Actions the LLM believes should be taken */
  proposedActions?: ProposedAction[];
}

interface ProposedAction {
  type: string;           // "payment", "send_message", etc.
  confidence: number;     // How sure the LLM is about this action
  params: Record<string, unknown>;  // Extracted parameters
}
```

### 4.3 Classifier Prompt Addition

Append to the existing `CLASSIFICATION_SYSTEM_PROMPT`:

```
ACTION DETECTION:
If the text implies a concrete action, propose it:
- "payment": user wants to send money. Extract: recipient, amount, currency, reason.
- "message": user wants to send a message to someone. Extract: to, message.
- "api_call": user wants to trigger an external API. Extract: url, method, body.

Add to your output:
  "proposedActions": [
    {
      "type": "payment",
      "confidence": 0.95,
      "params": { "recipient": "Susie", "amount": "5", "currency": "DOGE", "reason": "lunch" }
    }
  ]

Only propose actions you are confident about. If unsure, omit the field.
```

### 4.4 Confidence Score Computation

Each proposed action receives a final confidence score combining multiple signals:

```
executionScore = classifierConfidence * entityResolutionScore * historyBonus
```

Where:
- `classifierConfidence`: the LLM's stated confidence for this action (0.0-1.0)
- `entityResolutionScore`: how completely entities were resolved (0.0-1.0)
- `historyBonus`: 1.0 by default; 1.1 if the user has done this exact action type with this entity before (capped at 1.0 for final score)

Example: "Pay Susie 5 DOGE for lunch"
- classifierConfidence: 0.95 (clear payment intent)
- entityResolutionScore: 1.0 (Susie found in Brain, DOGE address known, amount explicit)
- historyBonus: 1.1 (paid Susie before)
- executionScore: 0.95 * 1.0 * 1.1 = 1.045, capped to 1.0

---

## 5. Action Policy Engine

Generalized from the wallet `PolicyEngine`. Determines whether an action auto-executes, requires approval, or is stored as pending.

### 5.1 Policy Hierarchy

Policies are evaluated in order of specificity. The most specific matching policy wins.

```
1. Per-action-type policy   (e.g., "payment" actions)
2. Per-bucket default policy (e.g., all actions from "finance" bucket)
3. Global default policy     (fallback for everything)
```

### 5.2 Policy Schema

```typescript
interface ActionPolicy {
  /** Action type this policy applies to (or "*" for global) */
  actionType: string;

  /** Bucket this policy applies to (or "*" for all buckets) */
  bucket: string;

  /** Minimum execution score for auto-approval */
  autoApproveThreshold: number;  // default: 0.95

  /** Maximum monetary value for auto-approval (payments only) */
  maxAutoValue: number | null;   // default: 1.0 (DOGE), null for non-monetary actions

  /** Require all entities to be resolved before auto-approve */
  requireEntityMatch: boolean;   // default: true

  /** Minimum seconds between auto-executions of this type */
  cooldown: number;              // default: 30

  /** Plugin that handles this action type */
  pluginId: string;

  /** Whether this policy is active */
  enabled: boolean;              // default: false (opt-in)

  /** Additional plugin-specific constraints */
  constraints: Record<string, unknown>;
}
```

### 5.3 Policy Evaluation

```
evaluate(action, policy) -> "auto" | "prompt" | "pending" | "deny"

1. If policy.enabled === false -> "deny" (action type not enabled)
2. If action.executionScore >= policy.autoApproveThreshold
   AND (policy.maxAutoValue === null OR action.resolvedParams.amount <= policy.maxAutoValue)
   AND (policy.requireEntityMatch === false OR action.resolvedParams !== null)
   AND cooldown not violated
   -> "auto"
3. If action.executionScore >= 0.50
   -> "prompt" (send Telegram approval request)
4. If action.executionScore < 0.50
   -> "pending" (store silently, available via brain_fix)
5. Special: if recipient is first-time (no prior transactions) -> never "auto", at most "prompt"
```

### 5.4 Double Gating for Payments

Payment actions pass through TWO independent gates:

```
Brain Policy Engine                    Wallet Policy Engine
========================              ========================
action.executionScore >= 0.95   AND   policyEngine.evaluate(amount, address, reason).allowed === true
  -> auto                               -> auto-approved tier (micro/small)
  -> prompt                              -> notify-delay tier (medium)
  -> pending                             -> owner-required tier (large/sweep)
```

Both must approve for auto-execution. If Brain says "auto" but Wallet says "owner-required," the user gets a Telegram approval prompt.

### 5.5 Policy Evaluation Decision Tree

```
                    ┌─────────────────────┐
                    │  Action Proposed     │
                    │  executionScore: X   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Policy Enabled?     │
                    └──────────┬──────────┘
                          yes/ \no
                          /     \
              ┌──────────▼┐   ┌─▼──────────┐
              │ Continue   │   │ DENY       │
              └──────────┬┘   │ (disabled)  │
                         │    └────────────┘
              ┌──────────▼──────────┐
              │  First-time         │
              │  recipient?         │
              └──────────┬──────────┘
                    yes/ \no
                    /     \
        ┌──────────▼┐  ┌──▼─────────────────┐
        │ Cap at     │  │ X >= autoApprove    │
        │ "prompt"   │  │ Threshold?          │
        │ max        │  └──────────┬──────────┘
        └──────────┬┘        yes/ \no
                   │         /     \
                   │  ┌─────▼────┐ │
                   │  │ Amount <= │ │
                   │  │ maxAuto?  │ │
                   │  └────┬─────┘ │
                   │  yes/ \no     │
                   │  /     \      │
                   │ ▼       ▼     │
                   │AUTO  PROMPT   │
                   │               │
                   │  ┌────────────▼──────────┐
                   │  │  X >= 0.50?           │
                   │  └──────────┬────────────┘
                   │        yes/ \no
                   │        /     \
                   └──►PROMPT   PENDING
                              (silent store)
```

---

## 6. Conditional Triggers

Actions can wait for conditions before executing.

### 6.1 Trigger Types

| Type | Description | Example | Implementation |
|------|-------------|---------|----------------|
| Time-based | Fires at a specific datetime or recurring cron | "Pay Susie on Friday" | Cron job (existing infrastructure) |
| Event-based | Fires when a new drop matches a semantic condition | "Pay Susie after the meeting" | Semantic similarity of new drops to trigger condition |
| Manual | Fires when user explicitly triggers via brain_fix or inline button | "Pay Susie (when I say so)" | User interaction |

### 6.2 Event-Based Trigger Resolution

When a new drop arrives, the pipeline checks all `pending_trigger` actions with event-based triggers:

1. Embed the trigger condition text (stored in `trigger.conditionVector`).
2. Compute cosine similarity between the new drop's embedding and each trigger condition.
3. If similarity >= 0.80, fire the trigger.
4. Ask the LLM for confirmation: "Does this new drop satisfy the condition '{condition}'?"
5. If confirmed, transition action from `pending_trigger` to `approved` and enter the execution pipeline.

### 6.3 Trigger Lifecycle

```
    ┌──────────┐
    │ DORMANT  │   Action created with trigger condition
    │          │   status: "pending_trigger"
    └────┬─────┘
         │
         │  New drop arrives / cron fires / user clicks button
         │
    ┌────▼─────┐
    │ EVALUATE │   Check if condition is met
    │          │   (semantic match / time match / manual)
    └────┬─────┘
         │
    yes/ \no
    /     \
   ▼       ▼
┌────────┐ ┌──────────┐
│ FIRE   │ │ REMAIN   │
│        │ │ DORMANT  │
└───┬────┘ └──────────┘
    │
    │  Re-enter policy evaluation
    │
┌───▼────────┐
│ EXECUTE    │   Normal execution pipeline
│ or PROMPT  │   (auto/manual based on policy)
└────────────┘
```

### 6.4 Trigger Expiry

Triggers expire if not fired within a configurable window (default: 30 days). Expired triggers transition the action to `expired` status and log to audit trail.

---

## 7. Plugin Action Registry

Plugins register the action types they can execute. The registry maps action types to handler functions.

### 7.1 Registry Interface

```typescript
interface PluginActionHandler {
  /** Unique action type identifier */
  actionType: string;

  /** Plugin that owns this handler */
  pluginId: string;

  /** Human-readable description */
  description: string;

  /** Required parameters schema */
  requiredParams: string[];

  /** Optional parameters schema */
  optionalParams: string[];

  /** Whether this action involves monetary value */
  monetary: boolean;

  /** Execute the action. Returns result or throws. */
  execute(resolvedParams: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Validate that all required params are present and valid */
  validate(resolvedParams: Record<string, unknown>): { valid: boolean; errors: string[] };
}
```

### 7.2 Built-in Action Types

| Action Type | Plugin | Required Params | Optional Params | Monetary |
|-------------|--------|----------------|-----------------|----------|
| `payment` | doge-wallet | to, amount, reason | currency | Yes |
| `send_message` | telegram/message | to, message | replyTo | No |
| `create_issue` | github | repo, title, body | labels, assignee | No |
| `reminder` | cron | text, at/cron | timezone | No |
| `http_call` | webhook | url, method | body, headers | No |

### 7.3 Registration Flow

Plugins register their action handlers during initialization:

```typescript
// In plugin init:
actionRegistry.register({
  actionType: "payment",
  pluginId: "doge-wallet",
  description: "Send DOGE to an address",
  requiredParams: ["to", "amount", "reason"],
  optionalParams: ["currency"],
  monetary: true,
  execute: async (params) => {
    // Call wallet_send internally
    return await walletSend(params.to, params.amount, params.reason);
  },
  validate: (params) => {
    const errors = [];
    if (!params.to) errors.push("Missing recipient address");
    if (!params.amount || params.amount <= 0) errors.push("Invalid amount");
    if (!params.reason) errors.push("Missing reason");
    return { valid: errors.length === 0, errors };
  },
});
```

### 7.4 Custom User-Defined Actions

Users can define custom webhook-based actions in plugin config:

```json
{
  "customActions": [
    {
      "actionType": "deploy_staging",
      "pluginId": "webhook",
      "description": "Deploy to staging environment",
      "url": "https://ci.example.com/api/deploy",
      "method": "POST",
      "headers": { "Authorization": "Bearer ${DEPLOY_TOKEN}" },
      "bodyTemplate": { "environment": "staging", "ref": "${params.branch}" }
    }
  ]
}
```

---

## 8. Execution Engine

Orchestrates action execution from proposal through completion.

### 8.1 Execution Flow

```typescript
async function executeAction(action: Action, handler: PluginActionHandler): Promise<void> {
  // 1. Validate all params resolved
  const validation = handler.validate(action.resolvedParams);
  if (!validation.valid) {
    action.status = "failed";
    action.error = `Validation failed: ${validation.errors.join(", ")}`;
    await logAudit("action-validation-failed", action);
    return;
  }

  // 2. Check policy gate
  const policyResult = evaluatePolicy(action);
  if (policyResult === "deny") {
    action.status = "failed";
    action.error = "Denied by policy";
    await logAudit("action-denied", action);
    return;
  }
  if (policyResult === "prompt") {
    action.status = "proposed";
    action.gating = "manual";
    await sendApprovalPrompt(action);
    await logAudit("action-pending-approval", action);
    return;
  }
  if (policyResult === "pending") {
    action.status = "proposed";
    action.gating = "manual";
    await logAudit("action-stored-pending", action);
    return;
  }

  // 3. Execute
  action.status = "executing";
  try {
    const result = await handler.execute(action.resolvedParams!);
    action.status = "complete";
    action.result = result;
    action.executedAt = new Date().toISOString();
    await logAudit("action-executed", action);
  } catch (err) {
    action.status = "failed";
    action.error = String(err);
    await logAudit("action-execution-failed", action);
  }

  // 4. Send confirmation to user
  await sendConfirmation(action);
}
```

### 8.2 Retry Policy

Failed actions can be retried manually via `brain_fix <actionId> retry`. No automatic retries to avoid duplicate payments or message spam.

### 8.3 Execution Engine Integration Point

The execution engine plugs into the action router as a new step after entity resolution:

```
routeActions() {
  // Existing intent resolution...
  switch (intent) {
    case "payment":
      return await handlePaymentAction(store, classification, rawText, inboxId, config);
    // ... other new intents
  }
}

async function handlePaymentAction(...) {
  // 1. Extract params from classifier proposedActions
  // 2. Resolve entities (people, amounts)
  // 3. Compute execution score
  // 4. Create Action object on the bucket record
  // 5. Evaluate policy
  // 6. Execute or prompt
}
```

---

## 9. Approval UX

### 9.1 Telegram Inline Buttons

When an action requires manual approval, send a Telegram message with inline buttons:

```
🧠 Brain Action Proposal
━━━━━━━━━━━━━━━━━━━━━━━━━
💸 Payment: Send 5 DOGE to Susie
📝 Reason: lunch
🎯 Confidence: 95%
🏦 Address: D7xAbc...def

[✅ Approve] [💰 Edit Amount] [👤 Edit Recipient] [❌ Dismiss]
```

**Callback data format:**
- `brain:action:approve:<actionId>`
- `brain:action:edit_amount:<actionId>`
- `brain:action:edit_recipient:<actionId>`
- `brain:action:dismiss:<actionId>`
- `brain:action:snooze:<actionId>:<minutes>`

### 9.2 Edit Flow

When the user clicks "Edit Amount" or "Edit Recipient," respond with:

```
💰 Enter the new amount (in DOGE):
```

The next message from the user is captured as the new value. The action is re-validated and re-proposed.

### 9.3 Batch Approval

When multiple actions are pending, offer a batch view:

```
🧠 Pending Actions (3)
━━━━━━━━━━━━━━━━━━━━━
1. 💸 Pay Susie 5 DOGE (lunch)
2. 💸 Pay John 10 DOGE (concert tickets)
3. 📤 Message Sarah: "meeting at 3pm"

[✅ Approve All] [📋 Review One-by-One] [❌ Dismiss All]
```

### 9.4 Snooze

For triggered actions, add a snooze option:

```
[💤 Snooze 1h] [💤 Snooze 4h] [💤 Snooze 1d]
```

Snoozing creates a new time-based trigger set to the snooze duration.

---

## 10. Safety and Guardrails

### 10.1 Rate Limiting

Per action type, enforce configurable rate limits:

```typescript
interface RateLimit {
  maxPerHour: number;
  maxPerDay: number;
  cooldownSeconds: number;
}
```

Defaults:
| Action Type | Max/Hour | Max/Day | Cooldown |
|-------------|----------|---------|----------|
| payment | 10 | 50 | 30s |
| send_message | 20 | 100 | 5s |
| http_call | 30 | 200 | 2s |
| create_issue | 5 | 20 | 60s |

### 10.2 Spending Caps

For monetary actions, enforce daily and weekly caps independent of the wallet's own limits:

```typescript
interface SpendingCap {
  dailyMaxDoge: number;    // default: 100
  weeklyMaxDoge: number;   // default: 500
  perActionMaxDoge: number; // default: 50
}
```

These caps apply only to Brain-initiated payments. Direct wallet commands (`/wallet send`) bypass Brain caps but still respect wallet policy.

### 10.3 Opt-in Auto-Approve

Every action type starts with `enabled: false` in its policy. The user must explicitly enable auto-approval per action type:

```json
{
  "brain": {
    "actionPolicies": {
      "payment": { "enabled": true, "autoApproveThreshold": 0.95, "maxAutoValue": 1.0 },
      "send_message": { "enabled": false }
    }
  }
}
```

### 10.4 First-Time Recipient Rule

For payment actions, if the recipient has never received a payment from this wallet before:
- Never auto-execute, regardless of execution score.
- Always require manual approval (at minimum "prompt").
- Log to audit trail with "first-time recipient" flag.

### 10.5 Audit Trail

Every action lifecycle event is logged:

| Event | When |
|-------|------|
| `action-proposed` | Action created by classifier |
| `action-resolved` | Entity resolution completed |
| `action-policy-check` | Policy evaluated |
| `action-approved` | User approved (manual) or policy approved (auto) |
| `action-executing` | Execution started |
| `action-complete` | Execution succeeded |
| `action-failed` | Execution or validation failed |
| `action-dismissed` | User dismissed |
| `action-expired` | Trigger expired |

### 10.6 Undo/Reversal

- **Payments:** Cannot be reversed on-chain. Undo is not supported. The double-gating design prevents accidental sends.
- **Messages:** Cannot be unsent. Undo is not supported.
- **Reminders:** Can be cancelled by dismissing the cron job.
- **API calls:** Plugin-specific; some may support rollback.
- **Issues:** Can be closed after creation.

---

## 11. Configuration Schema

Action policies are configured in `openclaw.plugin.json` under the brain plugin section:

```json
{
  "brain": {
    "actionPipeline": {
      "enabled": true,

      "globalPolicy": {
        "autoApproveThreshold": 0.95,
        "requireEntityMatch": true,
        "cooldown": 30
      },

      "bucketPolicies": {
        "finance": {
          "autoApproveThreshold": 0.98,
          "maxAutoValue": 5.0
        }
      },

      "actionPolicies": {
        "payment": {
          "enabled": true,
          "pluginId": "doge-wallet",
          "autoApproveThreshold": 0.95,
          "maxAutoValue": 1.0,
          "requireEntityMatch": true,
          "cooldown": 30,
          "constraints": {
            "dailyMaxDoge": 100,
            "weeklyMaxDoge": 500,
            "noFirstTimeAutoApprove": true
          }
        },
        "send_message": {
          "enabled": false,
          "pluginId": "telegram",
          "autoApproveThreshold": 0.90,
          "maxAutoValue": null,
          "requireEntityMatch": true,
          "cooldown": 5
        },
        "reminder": {
          "enabled": true,
          "pluginId": "cron",
          "autoApproveThreshold": 0.80,
          "maxAutoValue": null,
          "requireEntityMatch": false,
          "cooldown": 5
        },
        "http_call": {
          "enabled": false,
          "pluginId": "webhook",
          "autoApproveThreshold": 0.98,
          "maxAutoValue": null,
          "requireEntityMatch": true,
          "cooldown": 10
        }
      },

      "rateLimits": {
        "payment": { "maxPerHour": 10, "maxPerDay": 50, "cooldownSeconds": 30 },
        "send_message": { "maxPerHour": 20, "maxPerDay": 100, "cooldownSeconds": 5 },
        "http_call": { "maxPerHour": 30, "maxPerDay": 200, "cooldownSeconds": 2 }
      },

      "spendingCaps": {
        "dailyMaxDoge": 100,
        "weeklyMaxDoge": 500,
        "perActionMaxDoge": 50
      },

      "triggerDefaults": {
        "expiryDays": 30,
        "eventSimilarityThreshold": 0.80
      }
    }
  }
}
```

---

## 12. Quackstro Protocol Integration

The Quackstro Protocol defines agent-to-agent payments on the Dogecoin blockchain. The automation pipeline integrates with it for cross-agent payment scenarios.

### 12.1 A2A Invoice Flow

When another agent sends an invoice (via Quackstro or the existing `wallet_invoice` system):

1. The invoice arrives as a Brain drop (e.g., "Invoice from AgentX: 10 DOGE for OCR service, invoice ID: INV-abc123").
2. The classifier detects `payment` intent and extracts the invoice details.
3. Entity resolution looks up AgentX in the people bucket and matches the invoice ID against `wallet_verify_payment`.
4. The action is proposed with the invoice's DOGE address and amount.
5. Policy evaluation applies. For A2A payments, additional constraints may apply (e.g., require invoice verification, check agent reputation).

### 12.2 OP_RETURN Verification

When executing a payment action linked to an invoice:
1. The execution engine passes the invoice ID to `wallet_send` via the reason field.
2. The wallet plugin includes `OC:<invoiceId>` in the OP_RETURN of the payment transaction.
3. The receiving agent verifies the payment via `wallet_verify_payment`.

### 12.3 Reputation Integration

As the Quackstro reputation system comes online (Q4 2026), the policy engine can incorporate reputation scores:

```typescript
// Future: adjust auto-approve threshold based on agent reputation
if (recipientAgent.reputationScore >= 600) {
  effectiveThreshold = policy.autoApproveThreshold * 0.9; // 10% easier
}
```

### 12.4 Settlement Mode Selection

The automation pipeline can select the appropriate Quackstro settlement mode based on action parameters:
- Micro payments (< 1 DOGE): Post-payment (trust-based, if reputation sufficient)
- Small payments (1-10 DOGE): Direct HTLC (atomic, trustless)
- Recurring payments: Payment Channel (if high-frequency)

---

## 13. Pipeline Diagrams

### 13.1 Full Pipeline Flow

```
┌──────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐   ┌───────────┐
│  DROP    │──>│ CLASSIFY   │──>│   RESOLVE    │──>│  PROPOSE    │──>│  GATE    │──>│  EXECUTE  │
│          │   │            │   │              │   │             │   │          │   │           │
│ Raw text │   │ Bucket +   │   │ People +     │   │ Create      │   │ Policy   │   │ Plugin    │
│ arrives  │   │ entities + │   │ amounts +    │   │ Action obj  │   │ evaluate │   │ handler   │
│ via      │   │ intent +   │   │ dates +      │   │ with score  │   │          │   │ runs      │
│ Telegram │   │ proposed   │   │ locations    │   │             │   │ auto /   │   │           │
│          │   │ actions    │   │ against      │   │ Compute     │   │ prompt / │   │ Record    │
│          │   │            │   │ Brain data   │   │ execution   │   │ pending /│   │ result    │
│          │   │            │   │ + wallet     │   │ score       │   │ deny     │   │ to audit  │
└──────────┘   └────────────┘   └──────────────┘   └─────────────┘   └──────────┘   └───────────┘
                     │                                                     │
                     │                                                     │
                     ▼                                                     ▼
              ┌────────────┐                                    ┌──────────────────┐
              │ ROUTE to   │                                    │ PROMPT user via  │
              │ bucket     │                                    │ Telegram inline  │
              │ (existing) │                                    │ buttons          │
              └────────────┘                                    └──────────────────┘
```

### 13.2 Payment Action Detail Flow

```
"Pay Susie 5 DOGE for lunch"
         │
         ▼
┌─────────────────────────┐
│ CLASSIFIER               │
│ intent: "payment"        │
│ confidence: 0.95         │
│ entities.people: ["Susie"]│
│ entities.amounts: ["5"]  │
│ proposedActions: [{      │
│   type: "payment",       │
│   params: {              │
│     recipient: "Susie",  │
│     amount: "5",         │
│     currency: "DOGE",    │
│     reason: "lunch"      │
│   }                      │
│ }]                       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ ENTITY RESOLUTION        │
│                          │
│ People: "Susie"          │
│   -> Brain people search │
│   -> Found: id=abc123    │
│   -> Wallet history:     │
│      D7xAbc...def        │
│   -> resolvedPerson:     │
│      { confidence: 0.98 }│
│                          │
│ Amount: "5"              │
│   -> parsed: 5.0 DOGE    │
│   -> history median: 5   │
│   -> resolvedAmount:     │
│      { value: 5,         │
│        source: "explicit"}│
│                          │
│ resolutionScore: 1.0     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ EXECUTION SCORE           │
│ 0.95 * 1.0 * 1.0 = 0.95 │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ BRAIN POLICY              │
│ threshold: 0.95           │
│ maxAutoValue: 1.0 DOGE    │
│ amount: 5 DOGE            │
│ 5 > 1 => PROMPT          │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ TELEGRAM APPROVAL         │
│                          │
│ 💸 Pay Susie 5 DOGE      │
│ 📝 Reason: lunch         │
│ 🎯 Score: 95%            │
│                          │
│ [Approve] [Edit] [Dismiss]│
└────────────┬────────────┘
             │ User clicks Approve
             ▼
┌─────────────────────────┐
│ WALLET POLICY             │
│ evaluate(5, D7x..., ...) │
│ tier: "small"             │
│ action: "auto-logged"     │
│ => ALLOWED                │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ EXECUTE via wallet_send   │
│ to: D7xAbc...def         │
│ amount: 5                 │
│ reason: "lunch"           │
│ => txid: 0xabc...        │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ AUDIT + CONFIRM           │
│ Log: action-complete      │
│ Telegram: "Sent 5 DOGE   │
│   to Susie. TX: 0xabc..."│
└─────────────────────────┘
```

---

## Appendix: File References

| Component | File | Key Elements |
|-----------|------|-------------|
| Action Router | `extensions/brain/action-router.ts` | `routeActions()`, `shouldRoute()`, intent resolution |
| Schemas | `extensions/brain/schemas.ts` | `ClassificationResult`, `DetectedIntent`, bucket types |
| Classifier | `extensions/brain/classifier.ts` | `CLASSIFICATION_SYSTEM_PROMPT`, `classifyText()` |
| Router | `extensions/brain/router.ts` | `routeClassification()`, `checkConfidence()`, policy check |
| Wallet Policy | `extensions/doge-wallet/dist/index.js` | `PolicyEngine`, `ApprovalQueue`, `LimitTracker` |
| Quackstro Protocol | `plans/quackstro-protocol-spec.md` | A2A payments, OP_RETURN, reputation |
| Brain Roadmap | `plans/brain-roadmap.md` | Feature priorities, competitive analysis |
