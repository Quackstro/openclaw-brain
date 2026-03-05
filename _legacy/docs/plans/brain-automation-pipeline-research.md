# Brain 2.0 Automation Pipeline — Research Summary

**Date:** 2026-02-08  
**Purpose:** Inform design of confidence-gated automation pipeline where Brain drops trigger real-world actions (payments, messages, API calls).

---

## 1. Current Wallet Spending Policy / Tiers / Auto-Approve

The DOGE wallet plugin has a fully implemented tiered spending policy with auto-approval:

| Tier | Max Amount | Approval Mode | Details |
|------|-----------|---------------|---------|
| Micro | ≤1 DOGE | `auto` | Silent auto-approve |
| Small | ≤10 DOGE | `auto-logged` | Auto-approve, logged to audit |
| Medium | ≤100 DOGE | `notify-delay` | Notify owner + 5-min delay before execution |
| Large | ≤1,000 DOGE | `owner-required` | Queued, requires `/wallet approve <id>` |
| Sweep | >1,000 DOGE | `owner-confirm-code` | Owner approval + confirmation code |

**Rate Limits:**
- Daily max: 5,000 DOGE
- Hourly max: 1,000 DOGE
- Max 50 transactions/day
- 30-second cooldown between sends

**Key Classes (from source):**
- `PolicyEngine` — evaluates amount + address against tiers, returns `{ tier, action, delayMinutes?, reason? }`
- `LimitTracker` — tracks daily/hourly spend, persists to `limits.json`
- `ApprovalQueue` — manages pending approvals with `queueForApproval()`, `getPending()`, `approve()`, `deny()`

**Flow in code:**
1. `policyEngine.evaluate(amountDoge, toAddress, reason)` → returns evaluation
2. If `action === "block"` → denied, notifier sends policy block alert
3. If tier is auto/auto-logged → `executeSend()` immediately
4. If notify-delay → queued with `approvalQueue.queueForApproval()`, auto-approves after delay
5. If owner-required → queued, waits for `/wallet approve <shortId>`

**Configuration is fully customizable** — tiers, limits, allowlist, denylist all configurable in `openclaw.json`.

---

## 2. How wallet_send Works

**Parameters:**
- `to` (required) — Recipient DOGE address
- `amount` (required) — Amount in DOGE
- `reason` (required) — Audit trail reason string
- `currency` — defaults to "DOGE"

**Execution flow (`executeSend()`):**
1. Get spendable UTXOs (respecting `minConfirmations`)
2. Coin selection algorithm
3. Build transaction (inputs, outputs, change)
4. Sign with HD wallet key
5. Multi-provider broadcast: P2P → BlockCypher → SoChain → Blockchair
6. `limitTracker.recordSpend(amount + fee)`
7. `auditLog.logSend(txid, to, amount, fee, tier, "broadcast", reason)`
8. `notifier.notifySend(...)` — Telegram notification
9. Returns `{ txid, fee }` or error

**Approval flow for non-auto tiers:**
- Returns pending approval ID instead of txid
- Telegram notification with approve/deny instructions
- Medium tier: auto-approves after 5-min delay unless denied
- Large/Sweep: waits indefinitely for owner action

---

## 3. Agent-to-Agent (A2A) Payment Infrastructure

### Current Implementation (wallet plugin v0.1.0)

**Invoice System:**
- `wallet_invoice` tool — creates invoice with `{ amount, description, callbackUrl?, reference?, expiryMinutes? }`
- `InvoiceManager` handles creation, storage, expiry cleanup
- Invoices include a unique ID used in OP_RETURN tagging

**Payment Verification:**
- `wallet_verify_payment` tool — takes `{ invoiceId, txid, amount }`
- `PaymentVerifier` checks on-chain: confirms tx exists, validates amount, verifies `OP_RETURN` contains `OC:<invoiceId>`
- Trustless verification — the blockchain IS the proof

**Callback System:**
- `CallbackSender` — POSTs payment notification to `callbackUrl` when payment verified
- Enables async notification to paying agent

**Flow:**
```
Agent A creates invoice → Agent B pays to address with OP_RETURN "OC:<invoiceId>" → 
Agent A calls wallet_verify_payment → confirms on-chain → CallbackSender notifies
```

### Quackstro Protocol (Planned — spec complete, not yet implemented)

The Quackstro Protocol is a comprehensive decentralized A2A economy on Dogecoin:

- **On-chain service discovery** via OP_RETURN to registry addresses
- **ECDH encrypted handshake** for establishing secure sessions
- **Three settlement modes:** Direct HTLC (atomic), Payment Channels (high-frequency), Post-payment (micro, trust-based)
- **On-chain reputation** computed from immutable transaction history
- **Skill code taxonomy** — standardized uint16 service identifiers
- **MCP tool integration** — payment IS authorization for tool calls

**Implementation Roadmap (approved):**
- Q1: Discovery + Handshake
- Q2: Direct HTLC
- Q3: Payment Channels
- Q4: Reputation + Arbiter

**Registry Addresses (computed, ready):**
```
general:  DG7EBGqYFaWnaYeH9QQNEWeT6xY2DqVCzE
compute:  DMiK6hDKciWj4NG9Pi7m9dtATduM46sdsT
data:     D9mT3x5tsg7UYtxvjs9YwN8HN6EPiroSF6
content:  DFhMUCFGhiv7Fd5fA1nvceDwTzPW8zpMi8
identity: DLtg8eRLc4BCZsb18GAvYmDRZC1PDyyJSi
```

---

## 4. Current Brain Action Router — Capabilities & Limitations

### Architecture

The action router runs as step 3.5 in the `/drop` pipeline (after classification + routing). It's in `action-router.ts`.

### Supported Action Types

| Action Type | Handler | What It Does |
|-------------|---------|-------------|
| `reminder-created` | `handleTimeSensitiveAction` | LLM extracts time → creates cron trigger + nag jobs → Telegram inline buttons |
| `booking-created` | `handleTimeSensitiveAction` | Same as reminder, labeled as booking |
| `todo-tagged` | `handleTodoAction` | Logs to audit trail (tag already applied by pipeline) |
| `purchase-tagged` | `handlePurchaseAction` | Logs to audit trail with amount info |
| `call-tagged` | `handleCallAction` | Logs to audit trail with person info |
| `no-action` | (default) | Nothing to do |

### Intent Resolution (3-tier priority)

1. **Explicit input tag** — user bracket tags like `[todo]`, `[buy]`, `[call]`
2. **Classifier-detected intent** — LLM classifier's `detectedIntent` field
3. **Keyword heuristic** — falls back to `shouldRoute()` regex/keyword matching

### DetectedIntent enum (from schemas.ts)

```typescript
type DetectedIntent = "reminder" | "todo" | "purchase" | "call" | "booking" | "none";
```

### What Works Well

- **Reminder system is robust**: dual cron job pattern (trigger + nag), Telegram inline buttons (dismiss/snooze), LLM time extraction, timezone-aware
- **Non-fatal design**: all errors caught, drop pipeline always completes
- **Audit trail**: every action logged via `logAudit()`
- **Tag parser integration**: explicit bracket tags override classifier

### Limitations / Gaps for Automation Pipeline

1. **No payment actions** — no `DetectedIntent` for "pay", "send DOGE", "tip", "invoice"
2. **No message actions** — can't trigger sending messages to external parties
3. **No API call actions** — can't trigger webhooks or external API calls
4. **No confidence gating** — actions fire based on intent match, not confidence thresholds
5. **No approval queue** — unlike wallet's `ApprovalQueue`, brain actions execute immediately or not at all
6. **No chaining** — can't compose actions (e.g., "remind me to pay X" = reminder + future payment)
7. **Todo/purchase/call only log** — they create audit entries but don't trigger real-world actions
8. **Time extraction is the only LLM step** — no LLM step for extracting payment amounts, recipients, etc.

### Classification Schema (relevant fields)

```typescript
interface ClassificationResult {
  bucket: MainBucket | "unknown";
  confidence: number;          // 0-1 — EXISTS but not used for action gating
  title: string;
  summary: string;
  nextActions: string[];
  entities: {
    people: string[];          // Could map to message recipients
    dates: string[];           // Already used for reminders
    amounts: string[];         // Could map to payment amounts
    locations: string[];
  };
  urgency: "now" | "today" | "this-week" | "someday";
  followUpDate: string | null;
  tags: string[];
  detectedIntent?: DetectedIntent;
}
```

**Key insight:** The classifier already extracts `amounts` and `people` entities. These are logged but never acted upon. The automation pipeline can leverage these existing fields.

---

## 5. Wallet Plugin Roadmap (Relevant Items)

**Completed:** Core wallet, spending policy, A2A invoices, P2P broadcast, notifications

**In Progress:** Local Dogecoin node support

**Planned (relevant to automation):**
- Scheduled/recurring payments (💡 Considering)
- Webhook callbacks for external integrations (💡 Considering)
- Multi-address HD rotation

**Platform integration hooks (from quackstro-agent-platform.md):**
- `platformRules` in spending policy — auto-approve by platform source
- Event emitter: `wallet.on('balance-changed')`, `wallet.on('send-complete')`, `wallet.on('receive-confirmed')`
- Invoice creation with platform context (source, conversationId, serviceRequestId)

---

## 6. Design Implications for Brain Automation Pipeline

### What Already Exists That We Can Build On

1. **Wallet's tiered auto-approve** — proven pattern for confidence-gated execution
2. **Brain's action router** — extensible switch statement, just add new intent types
3. **Brain's classifier** — already extracts amounts, people, dates, urgency
4. **Brain's audit trail** — already logs all action routing decisions
5. **Wallet's approval queue** — reusable pattern for pending human approval
6. **Cron job infrastructure** — proven for deferred/scheduled actions

### Key Architecture Decision Points

1. **Where does confidence gating live?** Options:
   - In the action router (before dispatching)
   - In each action handler (per-action thresholds)
   - In a shared approval queue (wallet-style)

2. **New DetectedIntent values needed:**
   - `payment` — "send 50 DOGE to X", "pay the invoice"
   - `message` — "text John about dinner", "tell the team"
   - `api-call` — "trigger the deploy webhook"
   - `purchase` already exists but only logs

3. **Confidence → Tier mapping (proposed):**
   | Confidence | Action |
   |-----------|--------|
   | ≥0.95 | Auto-execute (micro equivalent) |
   | 0.85-0.94 | Auto-execute + log (small equivalent) |
   | 0.70-0.84 | Notify + delay (medium equivalent) |
   | 0.50-0.69 | Owner approval required (large equivalent) |
   | <0.50 | Log only, no action |

4. **Entity extraction needs enhancement:**
   - Payment: extract amount + currency + recipient address/name
   - Message: extract recipient + channel + content
   - API call: extract endpoint + method + payload

### Integration Points

```
Brain Drop → Classifier (entities, intent, confidence)
  → Action Router (intent switch + confidence gate)
    → Payment Handler → wallet_send (subject to wallet policy too)
    → Message Handler → message tool / exec CLI
    → Reminder Handler → cron jobs (existing)
    → API Handler → fetch / webhook
    → Approval Queue (if confidence too low)
      → Telegram inline buttons (approve/deny/edit)
      → Auto-expire after timeout
```

**Double gating for payments:** Brain confidence gate + wallet spending policy = two independent safety layers.

---

## 7. Summary of Findings

| Area | Status | Readiness for Automation |
|------|--------|------------------------|
| Wallet spending policy | ✅ Production | Pattern ready to replicate |
| Wallet auto-approve tiers | ✅ Production | Direct model for confidence gating |
| Wallet approval queue | ✅ Production | Reusable for brain action approvals |
| A2A invoice system | ✅ Production | Ready for programmatic use |
| Payment verification | ✅ Production | On-chain trustless verification |
| Brain action router | ✅ Production | Extensible, needs new intent types |
| Brain classifier entities | ✅ Production | Already extracts amounts, people, dates |
| Brain confidence scoring | ✅ Exists | Not yet used for action gating |
| Quackstro Protocol | 📋 Spec complete | Implementation Q1-Q4 2026 |
| Payment actions in Brain | ❌ Not implemented | Needs new intent + handler |
| Message actions in Brain | ❌ Not implemented | Needs new intent + handler |
| Confidence-gated approval | ❌ Not implemented | Core design needed |
| Action chaining | ❌ Not implemented | Future enhancement |

**Bottom line:** The infrastructure is 70% there. The wallet's tiered policy engine and the brain's action router are both extensible. The main work is:
1. Adding new intent types (payment, message, api-call)
2. Building confidence-gated approval queue
3. Wiring Brain → Wallet for payment actions
4. Entity extraction enhancement for payment/message details
