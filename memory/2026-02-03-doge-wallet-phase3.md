# DOGE Wallet Phase 3 — Transaction Builder + Sending

**Date:** 2026-02-03
**Status:** ✅ Complete — TypeScript compiles clean (`npx tsc --noEmit` passes)

## Files Created

### Transaction Module (`src/tx/`)
1. **`src/tx/builder.ts`** — Transaction construction using bitcore-lib-doge
   - `buildTransaction(params)` → unsigned tx hex, txid, fee, outputs
   - P2PKH transaction with recipient + change outputs
   - Fee calculation: `(inputs * 148 + outputs * 34 + 10) * feeRate`
   - Optional OP_RETURN data output for Quackstro Protocol
   - Dust threshold handling (absorb sub-dust change into fee)

2. **`src/tx/signer.ts`** — ECDSA signing
   - `signTransaction(rawTx, privateKey, network)` → signed tx hex
   - Uses bitcore-lib-doge PrivateKey.fromBuffer for network-aware signing
   - Verifies transaction is fully signed before returning
   - Private key NEVER logged

3. **`src/tx/broadcaster.ts`** — Network broadcast with retry
   - `broadcastTransaction(signedTxHex, provider, options)` → { txid, success }
   - 3 attempts with exponential backoff (1s, 3s, 9s)
   - Handles: already-broadcast (idempotent), double-spend (fatal), fee-too-low (fatal)
   - `verifyBroadcast()` — polls network to confirm tx acceptance

4. **`src/tx/tracker.ts`** — Confirmation tracking
   - `TransactionTracker` class with persistent state
   - Polls every 30s; status: pending → confirming → confirmed (6+) → failed
   - Event callbacks: onConfirmation, onConfirmed, onFailed
   - Resumes tracking on plugin restart
   - Persists to `{dataDir}/tracking.json`

### Policy Module (`src/policy/`)
5. **`src/policy/engine.ts`** — Spending policy evaluation
   - `PolicyEngine.evaluate(amountDoge, recipient, reason)` → { allowed, tier, action }
   - Tiers: micro (<10), small (<100), medium (<1000), large (<10000), sweep (≥10000)
   - Actions: auto, notify, delay, approve, confirm-code, deny
   - Checks: freeze flag, denylist, allowlist, rate limits, cooldown
   - freeze() / unfreeze() methods

6. **`src/policy/limits.ts`** — Rate limiting
   - `LimitTracker` — tracks daily/hourly spend totals
   - `recordSpend()`, `getDailySpent()`, `getHourlySpent()`, `getTxCountToday()`
   - `isWithinLimits(amount)` → boolean + remaining allowance
   - `checkCooldown()` — minimum seconds between sends
   - Resets daily at midnight UTC
   - Persists to `{dataDir}/limits.json`

7. **`src/policy/approval.ts`** — Pending approval queue
   - `ApprovalQueue` — persistent queue of pending send approvals
   - `queueForApproval()`, `approve()`, `deny()`, `expire()`
   - Delay tier: auto-approves after N minutes
   - Approval tier: auto-denies after 24h
   - `cleanup()` — keeps last 100 resolved entries
   - Persists to `{dataDir}/pending.json`

### Type Declarations
8. **`src/types/bitcore-lib-doge.d.ts`** — TypeScript declarations for bitcore-lib-doge

## Files Modified

### `index.ts` — Complete rewrite for Phase 3
- **New commands:**
  - `/send <amount> DOGE to <address>` — Full send flow with policy evaluation
  - `/approve <id>` — Approve pending send
  - `/deny <id>` — Deny pending send
  - `/wallet pending` — Show pending approvals
  - `/wallet history` — Show recent transactions from audit trail
  - `/wallet freeze` — Emergency freeze (blocks all sends)
  - `/wallet unfreeze` — Resume normal operation

- **New agent tools:**
  - `wallet_send` — Send DOGE with policy evaluation (for agent use)
  - `wallet_history` — Get recent transaction history

- **New service lifecycle:**
  - Loads limits, approval queue, and tracker state on startup
  - Approval expiry checker runs every 30s (auto-approves/denies expired)
  - Tracker resumes polling on restart
  - Proper cleanup on stop

### `src/audit.ts` — Added transaction-specific audit methods
- `logSend(txid, to, amount, fee, tier, status)` 
- `logApproval(pendingId, approved, by)`
- `logPolicyCheck(amount, tier, action, reason)`
- `logFreeze(frozen, by)`
- `getSendHistory(limit)`

## Send Flow (Phase 3)
```
/send 50 DOGE to DAddr
  → Parse amount + address
  → Validate address (network-aware)
  → Check wallet initialized + unlocked
  → PolicyEngine.evaluate(50, DAddr, reason)
    → Check freeze → denylist → allowlist → rate limits → cooldown → tier
    → Return: { allowed: true, tier: "small", action: "notify" }
  → selectCoins(utxos, amount, feeRate)
  → buildTransaction(from, to, amount, utxos, changeAddr, feeRate)
  → signTransaction(rawTx, privateKey, network)
  → Lock UTXOs (mark spent)
  → broadcastTransaction(signedTx, provider)
    → If fail: unlock UTXOs, throw
  → limitTracker.recordSpend(amount + fee)
  → txTracker.track(txid)
  → auditLog.logSend(...)
  → Return success with txid, fee
```

## Design Decisions
- All amounts stored/processed in koinu internally, DOGE for display
- Wallet MUST be unlocked to sign (check enforced before signing)
- UTXOs locked immediately before broadcast, unlocked on failure
- Approval queue and limits survive restarts (persisted to JSON)
- Auto-approval timer for "delay" tier (medium amounts)
- bitcore-lib-doge used for tx construction + signing (require-style for CJS compat)
- No private keys in logs, errors, or audit entries

## TypeScript Compilation
```
$ npx tsc --noEmit
(clean — no errors)
```
