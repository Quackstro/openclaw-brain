# OpenClaw DOGE Wallet Plugin — System Design

**Author:** Jarvis (for Dr. Castro / Quackstro LLC)
**Date:** 2026-02-03
**Status:** 📋 Design Draft — Awaiting Review

---

## 1. Vision

A Dogecoin wallet that runs as an OpenClaw plugin, giving Jarvis (and any OpenClaw agent) the ability to hold, send, receive, and manage DOGE autonomously — with owner oversight.

**Why DOGE:**
- Meme-first culture aligns with Quackstro's personality — this isn't a boring enterprise wallet
- Low fees (~1 DOGE ≈ $0.11) make micro-transactions viable
- UTXO model is simple, well-understood, battle-tested
- No smart contract complexity — just send and receive
- DOGE has the community. If agents are going to tip each other, they should do it with the people's crypto
- Litecoin/Bitcoin fork means mature JS tooling exists

**Primary use case:** Agent-to-agent micro-transactions — paying other AI agents for services, data, or compute.

**Secondary uses:** Petty cash fund for automated purchases, tipping humans/agents, API cost self-funding, Dr. Castro's automated DOGE operations.

**Current DOGE price:** ~$0.108 USD (as of 2026-02-03)

---

## 2. Design Principles

| # | Principle | Implementation Implication |
|---|-----------|---------------------------|
| 1 | Security-first, always | Encrypted keys at rest (AES-256-GCM), spending tiers, owner approval for large sends |
| 2 | Meme-first, no cringe | Error messages, notifications, and commands embrace DOGE culture. "Much send. Very confirm. Wow." |
| 3 | Agent-native, not human-wallet-with-AI | Designed for autonomous operation — spending policies replace "click confirm" |
| 4 | Owner is god | Dr. Castro can override, freeze, sweep at any time. Agent proposes, owner disposes. |
| 5 | UTXO-aware | Proper coin selection, change management, dust avoidance — no "balance = number" abstraction leaks |
| 6 | Audit everything | Every satoshi in, every satoshi out, logged with context. IRS-ready if needed. |
| 7 | Fail safe, not fail open | If API is down, if keys can't decrypt, if anything is weird — refuse to send. Never lose funds. |
| 8 | Start small, earn trust | Phase 0 is read-only. Sending comes after security review. Large sends require approval. |
| 9 | Multi-provider resilient | Don't depend on one API. BlockCypher down? Fall back to SoChain. Both down? Refuse gracefully. |
| 10 | Plugin-clean | Standard OpenClaw plugin — no monkeypatching, no globals, clean lifecycle |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      TELEGRAM (Interface)                         │
│   /balance   /send <addr> <amt>   /wallet   /approve <txid>      │
└──────┬──────────────┬──────────────┬──────────────┬──────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    OPENCLAW GATEWAY (in-process)                   │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  DOGE WALLET PLUGIN                          │  │
│  │                                                              │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │  │
│  │  │ Agent    │  │ Spending     │  │ Notification          │ │  │
│  │  │ Tools    │  │ Policy       │  │ System                │ │  │
│  │  │          │  │ Engine       │  │ (Telegram alerts)     │ │  │
│  │  │ wallet_  │  │              │  │                       │ │  │
│  │  │ balance  │  │ auto/approve │  │ send/receive/approve  │ │  │
│  │  │ wallet_  │  │ /deny tiers  │  │ confirmation alerts   │ │  │
│  │  │ send     │  │              │  │                       │ │  │
│  │  │ wallet_  │  │              │  │                       │ │  │
│  │  │ history  │  │              │  │                       │ │  │
│  │  │ wallet_  │  │              │  │                       │ │  │
│  │  │ invoice  │  │              │  │                       │ │  │
│  │  └────┬─────┘  └──────┬───────┘  └───────────┬───────────┘ │  │
│  │       │               │                       │              │  │
│  │       ▼               ▼                       ▼              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │              TRANSACTION BUILDER                      │   │  │
│  │  │  UTXO select → construct → sign → broadcast → track  │   │  │
│  │  └───────────┬──────────────────────────┬───────────────┘   │  │
│  │              │                          │                    │  │
│  │              ▼                          ▼                    │  │
│  │  ┌─────────────────┐       ┌────────────────────────┐      │  │
│  │  │  KEY MANAGER    │       │  UTXO MANAGER          │      │  │
│  │  │                 │       │                        │      │  │
│  │  │  HD wallet      │       │  Track unspent outputs │      │  │
│  │  │  AES-256-GCM    │       │  Coin selection algo   │      │  │
│  │  │  encrypted at   │       │  Change address mgmt   │      │  │
│  │  │  rest            │       │  Dust threshold        │      │  │
│  │  └────────┬────────┘       └───────────┬────────────┘      │  │
│  │           │                            │                    │  │
│  │           ▼                            ▼                    │  │
│  │  ┌─────────────────┐       ┌────────────────────────┐      │  │
│  │  │  ENCRYPTED      │       │  API PROVIDER LAYER    │      │  │
│  │  │  KEY STORE      │       │                        │      │  │
│  │  │  (~/.openclaw/  │       │  BlockCypher (primary) │      │  │
│  │  │   doge/keys/)   │       │  SoChain (fallback)    │      │  │
│  │  └─────────────────┘       └───────────┬────────────┘      │  │
│  │                                        │                    │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │                  AUDIT TRAIL (LanceDB)                │   │  │
│  │  │  Every tx, every approval, every denial logged        │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  DOGECOIN        │
                    │  NETWORK         │
                    │  (mainnet/       │
                    │   testnet)       │
                    └──────────────────┘
```

---

## 4. Existing Infrastructure We Build On

| Component | What Exists | How DOGE Plugin Uses It |
|-----------|-------------|------------------------|
| **OpenClaw Plugin API** | `api.registerTool()`, `api.registerCommand()`, `api.registerService()` | Register wallet tools + commands + background UTXO watcher |
| **Telegram channel** | Active, inline buttons, commands | `/balance`, `/send`, `/wallet`, `/approve` commands + approval buttons |
| **LanceDB** | Proven store engine (Brain, doc-RAG) | Audit trail + transaction history store |
| **Cron** | Working, multiple jobs active | Periodic balance checks, pending tx monitoring, UTXO refresh |
| **Brain** | Active memory system | Store wallet-related decisions, agent payment preferences |
| **Config system** | `openclaw.json` with plugin entries | All wallet config under `plugins.entries.doge-wallet.config` |
| **Node.js crypto** | Built-in `crypto` module | AES-256-GCM encryption, key derivation, random generation |
| **Sub-agents** | Working delegation system | Heavy tx construction offloaded if needed |

---

## 5. Building Blocks — Detailed Design

### 5.1 Key Management

**Strategy:** BIP44 HD Wallet — one seed, infinite addresses.

**BIP44 Derivation Path for DOGE:**
```
m / 44' / 3' / 0' / 0 / index    (receiving addresses)
m / 44' / 3' / 0' / 1 / index    (change addresses)
```
Coin type `3` = Dogecoin per [SLIP-0044](https://github.com/satoshilabs/slips/blob/master/slip-0044.md).

**Seed Generation:**
```typescript
// 1. Generate 256-bit entropy
const entropy = crypto.randomBytes(32);

// 2. Convert to 24-word BIP39 mnemonic
const mnemonic = bip39.entropyToMnemonic(entropy.toString('hex'));

// 3. Derive seed from mnemonic
const seed = await bip39.mnemonicToSeed(mnemonic);

// 4. Create HD wallet root
const root = HDKey.fromMasterSeed(seed);

// 5. Derive DOGE account key
const account = root.derive("m/44'/3'/0'");
```

**Encryption at Rest (AES-256-GCM):**
```typescript
interface EncryptedKeyStore {
  version: 1;
  kdf: "scrypt";
  kdfParams: {
    n: 2 ** 20;        // CPU/memory cost (1M)
    r: 8;              // Block size
    p: 1;              // Parallelization
    dkLen: 32;         // Derived key length
    salt: string;      // Hex-encoded random salt (32 bytes)
  };
  cipher: "aes-256-gcm";
  cipherParams: {
    iv: string;        // Hex-encoded IV (12 bytes)
    tag: string;       // Hex-encoded auth tag (16 bytes)
  };
  ciphertext: string;  // Hex-encoded encrypted seed
  checksum: string;    // SHA-256 of decrypted seed (for verification)
  createdAt: string;   // ISO 8601
  lastRotated: string; // ISO 8601
}
```

**Key Derivation from Passphrase:**
- Passphrase set by Dr. Castro during wallet initialization
- scrypt with N=2^20, r=8, p=1 (takes ~1s on modern hardware — intentionally slow)
- Derived key used as AES-256-GCM encryption key
- Passphrase is NEVER stored — only the encrypted seed + scrypt params

**Storage Location:** `~/.openclaw/doge/keys/keystore.json`
- File permissions: `0600` (owner read/write only)
- Directory permissions: `0700`

**Recovery:**
- 24-word mnemonic is the ONLY backup — displayed once at creation, never stored
- Dr. Castro must write it down physically
- `/wallet recover` command to restore from mnemonic
- Recovery overwrites existing keystore (with confirmation)

**Key Rotation:**
- Passphrase rotation: re-encrypt seed with new passphrase (`/wallet rotate-passphrase`)
- Address rotation: derive next index for new receiving address (`/wallet new-address`)
- Seed rotation: NOT supported (would change all addresses — use recovery + new wallet instead)

**Address Management:**
```typescript
interface AddressBook {
  receiving: {
    current: number;     // Current derivation index
    addresses: {         // Map of index → address metadata
      [index: number]: {
        address: string;
        label?: string;
        createdAt: string;
        lastUsed?: string;
      }
    }
  };
  change: {
    current: number;
    addresses: { [index: number]: { address: string; createdAt: string } }
  };
}
```

### 5.2 UTXO Manager

Dogecoin uses the UTXO (Unspent Transaction Output) model. Every "balance" is really a collection of discrete unspent outputs.

**UTXO Tracking:**
```typescript
interface UTXO {
  txid: string;          // Transaction hash
  vout: number;          // Output index
  address: string;       // Address that owns this UTXO
  amount: number;        // Amount in koinu (1 DOGE = 100,000,000 koinu)
  scriptPubKey: string;  // Locking script (hex)
  confirmations: number; // Block confirmations
  blockHeight?: number;  // Block number (null if unconfirmed)
  locked: boolean;       // True if reserved for a pending tx
  lockedAt?: string;     // When it was locked
  lockedFor?: string;    // Which pending tx locked it
}
```

**UTXO Refresh Strategy:**
- On startup: full UTXO fetch from API for all known addresses
- Every 2 minutes: poll for new UTXOs (cron job)
- On send: immediately remove spent UTXOs, add change UTXO
- On receive notification: immediately add new UTXO
- Store locally in `~/.openclaw/doge/utxos.json` for fast startup

**Coin Selection Algorithm — Branch and Bound with fallback to Largest-First:**

```typescript
function selectCoins(target: number, feeRate: number, utxos: UTXO[]): CoinSelection {
  // 1. Filter: only confirmed UTXOs (≥1 confirmation) unless urgent
  const confirmed = utxos.filter(u => u.confirmations >= 1 && !u.locked);

  // 2. Try exact match first (no change output needed — saves fees)
  const exact = tryExactMatch(confirmed, target, feeRate);
  if (exact) return exact;

  // 3. Branch and Bound: minimize waste (excess going to fees)
  const bnb = branchAndBound(confirmed, target, feeRate, maxTries: 100000);
  if (bnb) return bnb;

  // 4. Fallback: Largest-first accumulation
  const sorted = confirmed.sort((a, b) => b.amount - a.amount);
  return accumulateUntilSufficient(sorted, target, feeRate);
}

interface CoinSelection {
  inputs: UTXO[];
  totalInput: number;     // koinu
  targetAmount: number;   // koinu
  fee: number;            // koinu
  changeAmount: number;   // koinu (0 if exact match)
  changeAddress?: string; // Derived change address
}
```

**Dust Threshold:**
- DOGE dust threshold: 100,000 koinu (0.001 DOGE)
- If change would be below dust, add it to the fee instead
- Never create outputs below dust — they're unspendable

**UTXO Consolidation:**
- When UTXO count > 50: suggest consolidation to owner
- When UTXO count > 100: auto-consolidate (combine small UTXOs into one, during low-fee periods)
- Consolidation tx sent to own address — just reduces future tx sizes

### 5.3 Transaction Builder

**Transaction Construction Flow:**
```
1. Validate: address format, amount > dust, sufficient balance
2. Select coins: UTXO selection algorithm
3. Estimate fee: (inputs * 148 + outputs * 34 + 10) * feePerByte
4. Build unsigned tx: inputs, outputs (recipient + change)
5. Sign: ECDSA secp256k1 with derived private keys
6. Serialize: raw hex transaction
7. Broadcast: push to network via API
8. Track: monitor for confirmations
```

**Fee Estimation:**
```typescript
interface FeeEstimate {
  // DOGE recommended fee: 1 DOGE per KB (100,000,000 koinu/KB)
  // Actual network fees from BlockCypher API (satoshis/byte equivalent):
  high: number;    // Fast confirmation (1-2 blocks, ~1-2 min)
  medium: number;  // Normal (3-5 blocks, ~3-5 min)
  low: number;     // Economy (10+ blocks, ~10 min)
}

// Typical P2PKH transaction sizes:
// 1-in, 2-out: ~226 bytes
// 2-in, 2-out: ~374 bytes
// Each additional input: ~148 bytes
// Each additional output: ~34 bytes

// At DOGE's standard 1 DOGE/KB fee:
// Typical tx: ~0.23 DOGE fee (~$0.025)
```

**Transaction Signing:**
```typescript
async function signTransaction(
  unsignedTx: UnsignedTransaction,
  keyStore: EncryptedKeyStore,
  passphrase: string
): Promise<string> {
  // 1. Derive encryption key from passphrase via scrypt
  const encKey = await scrypt(passphrase, keyStore.kdfParams);

  // 2. Decrypt seed
  const seed = decryptAES256GCM(keyStore.ciphertext, encKey, keyStore.cipherParams);

  // 3. Verify checksum
  if (sha256(seed) !== keyStore.checksum) throw new Error("Key integrity check failed");

  // 4. Derive HD root
  const root = HDKey.fromMasterSeed(seed);

  // 5. For each input, derive the signing key and sign
  for (const input of unsignedTx.inputs) {
    const path = getDerivationPath(input.address); // lookup from address book
    const child = root.derive(path);
    input.signature = signECDSA(unsignedTx.sigHash(input), child.privateKey);
  }

  // 6. Zero out sensitive data
  seed.fill(0);
  root.wipe();

  // 7. Serialize signed transaction
  return unsignedTx.serialize();
}
```

**Broadcasting:**
```typescript
async function broadcastTransaction(rawTx: string): Promise<BroadcastResult> {
  // Try primary provider first
  try {
    return await blockcypher.pushTx(rawTx);
  } catch (err) {
    logger.warn("BlockCypher broadcast failed, trying SoChain", err);
  }

  // Fallback to secondary
  try {
    return await sochain.pushTx(rawTx);
  } catch (err) {
    logger.error("All broadcast providers failed", err);
    throw new WalletError("BROADCAST_FAILED", "Could not broadcast transaction");
  }
}

interface BroadcastResult {
  txid: string;
  broadcast: boolean;
  provider: "blockcypher" | "sochain";
  timestamp: string;
}
```

**Confirmation Tracking:**
- After broadcast: poll every 30 seconds for first confirmation
- After 1 confirmation: poll every 2 minutes until 6 confirmations
- After 6 confirmations: mark as "confirmed" (finalized)
- DOGE block time: ~1 minute, so 6 confirmations ≈ 6 minutes
- If no confirmation after 30 minutes: alert owner, suggest RBF or wait

### 5.4 Spending Policy Engine

The heart of autonomous operation — defines what the agent can spend without asking.

**Spending Tiers:**

| Tier | Amount (DOGE) | Amount (USD approx) | Approval | Use Case |
|------|---------------|---------------------|----------|----------|
| **Micro** | ≤ 10 DOGE | ≤ $1.08 | Auto-approve | Tips, tiny API calls |
| **Small** | ≤ 100 DOGE | ≤ $10.80 | Auto-approve (logged) | Agent-to-agent service payments |
| **Medium** | ≤ 1,000 DOGE | ≤ $108 | Owner notification + 5-min delay | Significant purchases |
| **Large** | ≤ 10,000 DOGE | ≤ $1,080 | Owner approval required | Major expenses |
| **Sweep** | > 10,000 DOGE | > $1,080 | Owner approval + confirmation code | Emergency/bulk transfers |

**Policy Configuration:**
```typescript
interface SpendingPolicy {
  enabled: boolean;
  tiers: {
    micro:  { maxAmount: number; approval: "auto" };
    small:  { maxAmount: number; approval: "auto-logged" };
    medium: { maxAmount: number; approval: "notify-delay"; delayMinutes: number };
    large:  { maxAmount: number; approval: "owner-required" };
    sweep:  { maxAmount: null;   approval: "owner-confirm-code" };
  };
  limits: {
    dailyMax: number;           // Max DOGE per day (all tiers combined)
    hourlyMax: number;          // Max DOGE per hour
    txCountDailyMax: number;    // Max transactions per day
    cooldownSeconds: number;    // Min seconds between sends
  };
  allowlist: string[];          // Pre-approved addresses (skip tier check)
  denylist: string[];           // Blocked addresses (never send)
  freeze: boolean;              // Emergency stop — no sends at all
}
```

**Default Policy:**
```json
{
  "enabled": true,
  "tiers": {
    "micro":  { "maxAmount": 10,    "approval": "auto" },
    "small":  { "maxAmount": 100,   "approval": "auto-logged" },
    "medium": { "maxAmount": 1000,  "approval": "notify-delay", "delayMinutes": 5 },
    "large":  { "maxAmount": 10000, "approval": "owner-required" },
    "sweep":  { "maxAmount": null,  "approval": "owner-confirm-code" }
  },
  "limits": {
    "dailyMax": 5000,
    "hourlyMax": 1000,
    "txCountDailyMax": 50,
    "cooldownSeconds": 10
  },
  "allowlist": [],
  "denylist": [],
  "freeze": false
}
```

**Approval Flow:**

```
Agent wants to send 500 DOGE
  │
  ▼
Check freeze → frozen? DENY
  │
  ▼
Check denylist → recipient blocked? DENY
  │
  ▼
Check allowlist → pre-approved? SKIP TIER CHECK → proceed
  │
  ▼
Check rate limits → daily/hourly exceeded? DENY
  │
  ▼
Determine tier → 500 DOGE = "medium"
  │
  ▼
Medium policy: notify-delay (5 min)
  │
  ▼
Send Telegram notification with inline buttons:
  "🐕 Jarvis wants to send 500 DOGE (~$54) to DAddr123...
   Reason: Payment for data processing service
   [✅ Approve] [❌ Deny] [⏰ Auto-approve in 5 min]"
  │
  ├─ Owner clicks Approve → execute immediately
  ├─ Owner clicks Deny → cancel, notify agent
  └─ 5 min timeout with no response → auto-execute
```

**Pending Approval Queue:**
```typescript
interface PendingApproval {
  id: string;                // UUID
  createdAt: string;         // ISO 8601
  expiresAt: string;         // When auto-action fires
  autoAction: "approve" | "deny";  // What happens on timeout
  recipient: string;         // DOGE address
  amount: number;            // koinu
  reason: string;            // Why the agent wants to send
  requestedBy: string;       // Tool/command that initiated
  tier: string;              // Which tier matched
  status: "pending" | "approved" | "denied" | "expired" | "executed";
  telegramMessageId?: string; // For inline button callback tracking
}
```

### 5.5 Agent Tools

Tools the AI agent can call autonomously during conversations:

**`wallet_balance`**
```typescript
// Returns current wallet balance
interface WalletBalanceTool {
  name: "wallet_balance";
  description: "Check the current DOGE wallet balance";
  parameters: {};
  returns: {
    confirmed: number;      // DOGE (confirmed)
    unconfirmed: number;    // DOGE (pending)
    total: number;          // DOGE (confirmed + unconfirmed)
    usdValue: number;       // Approximate USD value
    utxoCount: number;      // Number of unspent outputs
    address: string;        // Current receiving address
  };
}
```

**`wallet_send`**
```typescript
// Send DOGE to an address (subject to spending policy)
interface WalletSendTool {
  name: "wallet_send";
  description: "Send DOGE to an address. Subject to spending policy tiers.";
  parameters: {
    address: string;        // Recipient DOGE address (D... format)
    amount: number;         // Amount in DOGE
    reason: string;         // Why this payment (logged in audit trail)
    priority?: "low" | "medium" | "high";  // Fee priority
  };
  returns: {
    status: "sent" | "pending-approval" | "denied";
    txid?: string;          // If sent immediately
    approvalId?: string;    // If pending owner approval
    fee?: number;           // Fee in DOGE
    message: string;        // Human-readable status
  };
}
```

**`wallet_history`**
```typescript
// Get transaction history
interface WalletHistoryTool {
  name: "wallet_history";
  description: "Get recent wallet transaction history";
  parameters: {
    limit?: number;         // Max results (default: 10)
    type?: "all" | "sent" | "received";
  };
  returns: {
    transactions: {
      txid: string;
      type: "sent" | "received";
      amount: number;       // DOGE
      address: string;      // Counter-party address
      confirmations: number;
      timestamp: string;
      reason?: string;      // If we logged a reason
    }[];
    totalSent: number;      // DOGE (all time)
    totalReceived: number;  // DOGE (all time)
  };
}
```

**`wallet_invoice`**
```typescript
// Create a payment invoice for another agent/human
interface WalletInvoiceTool {
  name: "wallet_invoice";
  description: "Create a payment invoice (request for payment)";
  parameters: {
    amount: number;         // DOGE requested
    description: string;    // What it's for
    expiresIn?: number;     // Minutes until expiry (default: 60)
    callbackUrl?: string;   // Webhook to call when paid
  };
  returns: {
    invoiceId: string;
    payToAddress: string;   // Fresh receiving address
    amount: number;
    expiresAt: string;
    dogeUri: string;        // dogecoin:DAddr?amount=X&label=Y
    status: "pending";
  };
}
```

**`wallet_address`**
```typescript
// Get a receiving address (for sharing)
interface WalletAddressTool {
  name: "wallet_address";
  description: "Get the current or a new DOGE receiving address";
  parameters: {
    fresh?: boolean;        // Generate new address (default: false)
    label?: string;         // Label for the address
  };
  returns: {
    address: string;
    label?: string;
    dogeUri: string;        // dogecoin:DAddr
  };
}
```

### 5.6 Commands

User-facing slash commands (registered via `api.registerCommand()`):

| Command | Args | Auth | Description |
|---------|------|------|-------------|
| `/balance` | none | yes | Show wallet balance + USD value |
| `/send` | `<address> <amount> [reason]` | yes | Send DOGE (respects spending policy) |
| `/wallet` | none | yes | Show wallet dashboard (balance, recent txs, address) |
| `/wallet init` | none | yes | Initialize new wallet (first-time setup) |
| `/wallet recover` | `<mnemonic>` | yes | Recover wallet from mnemonic |
| `/wallet address` | `[label]` | yes | Show or generate receiving address |
| `/wallet freeze` | none | yes | Emergency freeze — stop all sends |
| `/wallet unfreeze` | none | yes | Resume sends |
| `/wallet export` | none | yes | Export transaction history (CSV) |
| `/approve` | `<approvalId>` | yes | Approve a pending transaction |
| `/deny` | `<approvalId>` | yes | Deny a pending transaction |

**Example: `/balance` output:**
```
🐕 DOGE Wallet Balance
━━━━━━━━━━━━━━━━━━━━
💰 Confirmed: 1,234.56 DOGE (~$133.25)
⏳ Pending:   +50.00 DOGE
📊 UTXOs: 12 unspent outputs
📬 Address: DQ6dZtCmYL...R9xKe

Daily spend: 150/5,000 DOGE remaining
```

**Example: `/send` output:**
```
🐕 Sending DOGE...
━━━━━━━━━━━━━━━━
📤 To: DReci...pient
💰 Amount: 50 DOGE (~$5.40)
⛽ Fee: 0.23 DOGE
📝 Reason: Payment for image generation

✅ Transaction broadcast!
🔗 TX: abc123...def456
⏱️ Est. confirmation: ~1 minute
```

### 5.7 Agent-to-Agent Protocol

See Section 9 for the full detailed spec. Summary here:

- **Discovery:** Agents publish payment addresses via a `.well-known/openclaw-pay.json` endpoint or exchange addresses via DM
- **Invoice:** Structured JSON invoice with amount, description, expiry, callback
- **Payment:** Standard DOGE transaction with OP_RETURN metadata
- **Receipt:** Callback to invoicing agent with txid + confirmation
- **Dispute:** Timeout-based expiry, no on-chain escrow (too complex for v1)

### 5.8 Notification System

All wallet events → Telegram notification to Dr. Castro.

**Notification Events:**

| Event | Priority | Content |
|-------|----------|---------|
| Incoming payment received | Normal | "📥 Received 100 DOGE from DAddr... (pending confirmation)" |
| Incoming payment confirmed | Low | "✅ 100 DOGE confirmed (6/6 blocks)" |
| Auto-send executed (micro/small) | Low | "📤 Auto-sent 5 DOGE to DAddr... — tip for data service" |
| Approval required (medium+) | High | "🐕 Approval needed: 500 DOGE to DAddr... [Approve] [Deny]" |
| Approval timeout auto-executed | Normal | "⏰ Auto-approved: 500 DOGE to DAddr... (5-min timeout)" |
| Send failed | High | "❌ Send failed: 50 DOGE to DAddr... — insufficient UTXOs" |
| Daily limit approaching (80%) | Normal | "⚠️ Daily spend at 4,000/5,000 DOGE (80%)" |
| Daily limit hit | High | "🛑 Daily limit reached: 5,000 DOGE. No more auto-sends today." |
| Wallet frozen/unfrozen | High | "🧊 Wallet FROZEN by owner" / "🔥 Wallet UNFROZEN" |
| Low balance alert | Normal | "📉 Balance below 100 DOGE (97.5 DOGE remaining)" |
| UTXO consolidation | Low | "🔧 Consolidated 47 UTXOs into 1 (saved future fees)" |

**Inline Buttons for Approvals:**
```typescript
interface ApprovalNotification {
  text: string;
  inlineButtons: [
    [
      { text: "✅ Approve", callbackData: `doge:approve:${approvalId}` },
      { text: "❌ Deny",    callbackData: `doge:deny:${approvalId}` }
    ],
    [
      { text: "⏸️ Freeze All", callbackData: `doge:freeze` }
    ]
  ];
}
```

### 5.9 Audit Trail

Every financial event is logged permanently. This is not optional.

```typescript
interface AuditEntry {
  id: string;              // UUID
  timestamp: string;       // ISO 8601
  type: "send" | "receive" | "approve" | "deny" | "freeze" | "unfreeze"
       | "consolidate" | "invoice_created" | "invoice_paid" | "key_rotation"
       | "address_generated" | "policy_change" | "error";
  txid?: string;           // On-chain transaction ID
  amount?: number;         // koinu
  address?: string;        // Counter-party address
  fee?: number;            // koinu
  tier?: string;           // Spending tier that applied
  reason?: string;         // Why this happened
  initiatedBy: "agent" | "owner" | "system" | "external";
  approvalId?: string;     // If it went through approval
  balanceBefore: number;   // koinu — balance snapshot
  balanceAfter: number;    // koinu — balance snapshot
  metadata?: Record<string, unknown>;  // Additional context
}
```

**Storage:** LanceDB table `doge_audit` at `~/.openclaw/doge/audit/`
- Embeddings: No (structured queries only — no semantic search needed)
- Retention: Forever (financial records)
- Export: `/wallet export` generates CSV with all audit entries

---

## 6. Plugin File Structure

```
~/.openclaw/extensions/doge-wallet/
├── openclaw.plugin.json      # Plugin manifest
├── package.json              # Dependencies
├── tsconfig.json
├── index.ts                  # Plugin entry — registers tools + commands + services
├── src/
│   ├── types.ts              # All TypeScript interfaces
│   ├── config.ts             # Config schema + validation
│   ├── errors.ts             # Custom error types
│   ├── keys/
│   │   ├── manager.ts        # HD wallet key management
│   │   ├── encryption.ts     # AES-256-GCM encrypt/decrypt
│   │   └── derivation.ts     # BIP44 path derivation for DOGE
│   ├── utxo/
│   │   ├── manager.ts        # UTXO tracking + refresh
│   │   ├── selection.ts      # Coin selection algorithms
│   │   └── consolidation.ts  # UTXO consolidation logic
│   ├── tx/
│   │   ├── builder.ts        # Transaction construction
│   │   ├── signer.ts         # ECDSA signing
│   │   ├── broadcaster.ts    # Network broadcast + retry
│   │   └── tracker.ts        # Confirmation tracking
│   ├── policy/
│   │   ├── engine.ts         # Spending policy evaluation
│   │   ├── approval.ts       # Pending approval queue
│   │   └── limits.ts         # Rate limiting (daily/hourly)
│   ├── api/
│   │   ├── provider.ts       # Abstract API provider interface
│   │   ├── blockcypher.ts    # BlockCypher implementation
│   │   ├── sochain.ts        # SoChain implementation
│   │   └── failover.ts       # Multi-provider failover logic
│   ├── protocol/
│   │   ├── invoice.ts        # Invoice creation + tracking
│   │   ├── discovery.ts      # Agent payment address discovery
│   │   └── a2a.ts            # Agent-to-agent payment protocol
│   ├── tools/
│   │   ├── balance.ts        # wallet_balance tool
│   │   ├── send.ts           # wallet_send tool
│   │   ├── history.ts        # wallet_history tool
│   │   ├── invoice.ts        # wallet_invoice tool
│   │   └── address.ts        # wallet_address tool
│   ├── commands/
│   │   ├── balance.ts        # /balance command
│   │   ├── send.ts           # /send command
│   │   ├── wallet.ts         # /wallet (dashboard + subcommands)
│   │   ├── approve.ts        # /approve command
│   │   └── deny.ts           # /deny command
│   ├── notifications.ts      # Telegram notification system
│   ├── audit.ts              # Audit trail logging
│   └── price.ts              # DOGE/USD price fetching (CoinGecko)
├── tests/
│   ├── keys.test.ts
│   ├── utxo.test.ts
│   ├── tx.test.ts
│   ├── policy.test.ts
│   ├── api.test.ts
│   └── protocol.test.ts
└── data/                     # Runtime data (gitignored)
    ├── keys/                 # Encrypted keystore
    ├── utxos.json            # Cached UTXO set
    ├── pending.json          # Pending approvals
    └── audit/                # LanceDB audit tables
```

---

## 7. Config Schema

```json
{
  "plugins": {
    "entries": {
      "doge-wallet": {
        "enabled": true,
        "config": {
          "network": "mainnet",
          "dataDir": "~/.openclaw/doge",

          "api": {
            "primary": "blockcypher",
            "fallback": "sochain",
            "blockcypher": {
              "baseUrl": "https://api.blockcypher.com/v1/doge/main",
              "apiToken": null
            },
            "sochain": {
              "baseUrl": "https://chain.so/api/v3",
              "apiKey": null
            },
            "priceApi": {
              "provider": "coingecko",
              "baseUrl": "https://api.coingecko.com/api/v3",
              "cacheTtlSeconds": 300
            }
          },

          "policy": {
            "enabled": true,
            "tiers": {
              "micro":  { "maxAmount": 10,    "approval": "auto" },
              "small":  { "maxAmount": 100,   "approval": "auto-logged" },
              "medium": { "maxAmount": 1000,  "approval": "notify-delay", "delayMinutes": 5 },
              "large":  { "maxAmount": 10000, "approval": "owner-required" },
              "sweep":  { "maxAmount": null,  "approval": "owner-confirm-code" }
            },
            "limits": {
              "dailyMax": 5000,
              "hourlyMax": 1000,
              "txCountDailyMax": 50,
              "cooldownSeconds": 10
            },
            "allowlist": [],
            "denylist": [],
            "freeze": false
          },

          "utxo": {
            "refreshIntervalSeconds": 120,
            "dustThreshold": 100000,
            "consolidationThreshold": 50,
            "minConfirmations": 1
          },

          "notifications": {
            "enabled": true,
            "channel": "telegram",
            "target": "8511108690",
            "lowBalanceAlert": 100,
            "dailyLimitWarningPercent": 80
          },

          "fees": {
            "strategy": "medium",
            "maxFeePerKb": 200000000,
            "fallbackFeePerKb": 100000000
          }
        }
      }
    }
  }
}
```

**Plugin Manifest (`openclaw.plugin.json`):**
```json
{
  "id": "doge-wallet",
  "name": "DOGE Wallet",
  "version": "0.1.0",
  "description": "Dogecoin wallet for OpenClaw agents — much send, very crypto, wow",
  "author": "Quackstro LLC",
  "license": "MIT",
  "configSchema": {
    "type": "object",
    "properties": {
      "network": { "type": "string", "enum": ["mainnet", "testnet"], "default": "mainnet" },
      "dataDir": { "type": "string", "default": "~/.openclaw/doge" },
      "api": { "type": "object" },
      "policy": { "type": "object" },
      "utxo": { "type": "object" },
      "notifications": { "type": "object" },
      "fees": { "type": "object" }
    }
  },
  "uiHints": {
    "api.blockcypher.apiToken": { "label": "BlockCypher API Token", "sensitive": true },
    "api.sochain.apiKey": { "label": "SoChain API Key", "sensitive": true }
  }
}
```

---

## 8. Security Model

### 8.1 Threat Model

| Threat | Impact | Likelihood | Mitigation |
|--------|--------|------------|------------|
| Server compromise (attacker gets shell) | Critical — access to encrypted keystore | Medium | AES-256-GCM encryption requires passphrase not stored on disk. Attacker gets ciphertext but not keys. |
| Memory dump / cold boot attack | Critical — plaintext keys in RAM | Low | Keys decrypted only during signing, immediately zeroed after. Short window. |
| API provider compromise (fake UTXOs) | High — trick wallet into double-spend | Low | Multi-provider verification. Cross-check UTXO data between providers before large sends. |
| Man-in-the-middle (API traffic) | High — intercept broadcast, steal tx | Low | HTTPS only. Certificate pinning for API providers. |
| Rogue agent behavior (AI jailbreak) | Medium — agent sends all funds | Medium | Spending policy engine + daily limits + owner approval for large amounts. Agent can't override policy. |
| Plugin code injection | Critical — arbitrary code execution | Low | OpenClaw plugins run in-process. Only install trusted code. Code review before deploy. |
| Passphrase brute-force | Critical — decrypt keystore | Low | scrypt N=2^20 makes each attempt ~1s. 12+ char passphrase = infeasible to brute-force. |
| UTXO replay / rebroadcast | Medium — rebroadcast old tx | Low | DOGE prevents double-spends at protocol level. Spent UTXOs can't be re-spent. |
| Backup mnemonic stolen | Critical — full fund theft | Medium | Mnemonic shown once, never stored digitally. Physical storage is user's responsibility. |

### 8.2 Security Controls

**Defense in Depth:**
```
Layer 1: Spending Policy Engine (rate limits, tiers, freeze)
Layer 2: Owner Approval (Telegram buttons for medium+ amounts)
Layer 3: Encrypted Key Storage (AES-256-GCM + scrypt)
Layer 4: UTXO Verification (multi-provider cross-check)
Layer 5: Audit Trail (every action logged, tamper-evident)
Layer 6: OS-level file permissions (0600/0700)
```

**Key Security Rules:**
1. Passphrase is NEVER written to disk, NEVER logged, NEVER sent over network
2. Decrypted seed exists in memory ONLY during signing, zeroed immediately after
3. Private keys derived per-transaction, never cached
4. All API calls over HTTPS only
5. No key material in logs, errors, or notifications
6. Transaction amounts in notifications but NEVER private keys or mnemonics
7. Emergency freeze stops ALL outbound transactions immediately

### 8.3 Key Rotation

| What | How Often | Process |
|------|-----------|---------|
| Passphrase | Every 90 days (reminder) | Re-encrypt seed with new passphrase. Old passphrase needed. |
| Receiving address | Every transaction or on-demand | Derive next index. No re-encryption needed. |
| API tokens | Every 6 months | Update config, restart gateway. |
| Full seed rotation | Never (by design) | Create new wallet, sweep funds, update address book. |

---

## 9. Agent-to-Agent Micro-Transaction Protocol

This is the primary use case. A standard protocol for AI agents to pay each other for services.

### 9.1 Discovery

How agents find each other's payment addresses.

**Method 1: Direct Exchange (DM-based)**
- Agent A asks Agent B: "What's your DOGE address?"
- Agent B responds with address
- Simple, no infrastructure needed
- Works for known agents in the same network

**Method 2: Well-Known Endpoint**
- Agent publishes `/.well-known/openclaw-pay.json` at their HTTP endpoint:

```json
{
  "version": "1.0",
  "agent": {
    "name": "Jarvis",
    "operator": "Quackstro LLC",
    "capabilities": ["image-gen", "code-review", "research"]
  },
  "payment": {
    "dogecoin": {
      "address": "DQ6dZtCmYL...R9xKe",
      "network": "mainnet",
      "invoiceEndpoint": "https://agent.quackstro.com/api/invoice"
    }
  },
  "pricing": {
    "image-gen": { "amount": 5, "currency": "DOGE", "unit": "per-image" },
    "code-review": { "amount": 50, "currency": "DOGE", "unit": "per-review" },
    "research": { "amount": 20, "currency": "DOGE", "unit": "per-query" }
  }
}
```

**Method 3: OpenClaw Agent Registry (Future)**
- Central registry where agents publish capabilities + payment addresses
- DNS-based: `_openclaw-pay.agent.quackstro.com` TXT record
- Not in v1 — too much infrastructure

### 9.2 Invoice Format

```typescript
interface DogeInvoice {
  // Header
  version: "1.0";
  invoiceId: string;          // UUID
  createdAt: string;          // ISO 8601
  expiresAt: string;          // ISO 8601

  // Payee (who's asking for money)
  payee: {
    name: string;             // Agent name
    address: string;          // DOGE address to pay
    operator?: string;        // Human/org operating the agent
  };

  // Payment details
  payment: {
    amount: number;           // DOGE amount
    currency: "DOGE";
    description: string;      // What this payment is for
    reference?: string;       // External reference ID
  };

  // Callback (optional)
  callback?: {
    url: string;              // POST to this URL when paid
    token?: string;           // Auth token for callback
  };

  // Metadata
  metadata?: {
    serviceType?: string;     // What service was rendered
    requestId?: string;       // ID of the original service request
    [key: string]: unknown;
  };

  // Verification
  signature?: string;         // ECDSA signature of invoice (optional, for verification)
}
```

**Invoice JSON Example:**
```json
{
  "version": "1.0",
  "invoiceId": "inv_7f3a9b2c-1234-5678-abcd-ef0123456789",
  "createdAt": "2026-02-03T00:00:00Z",
  "expiresAt": "2026-02-03T01:00:00Z",
  "payee": {
    "name": "DataBot",
    "address": "DDataB0tAddr3ss123456789abcdefgh",
    "operator": "DataCorp AI"
  },
  "payment": {
    "amount": 25,
    "currency": "DOGE",
    "description": "Scraped and summarized 50 web pages for research task",
    "reference": "task_abc123"
  },
  "callback": {
    "url": "https://databot.example.com/api/payment-callback",
    "token": "cb_secret_xyz"
  },
  "metadata": {
    "serviceType": "web-scraping",
    "pagesProcessed": 50,
    "requestId": "req_456def"
  }
}
```

### 9.3 Payment Flow

```
┌──────────┐                        ┌──────────┐
│ Agent A  │                        │ Agent B  │
│ (payer)  │                        │ (payee)  │
└────┬─────┘                        └────┬─────┘
     │                                   │
     │  1. REQUEST SERVICE               │
     │ ──────────────────────────────────>│
     │  "Please analyze this dataset"    │
     │                                   │
     │  2. SERVICE + INVOICE             │
     │ <──────────────────────────────────│
     │  "Here's the analysis + invoice   │
     │   for 25 DOGE"                    │
     │                                   │
     │  3. VALIDATE INVOICE              │
     │  ┌─────────────────────┐          │
     │  │ - Check amount      │          │
     │  │ - Check expiry      │          │
     │  │ - Check policy tier │          │
     │  │ - Check rate limits │          │
     │  └─────────────────────┘          │
     │                                   │
     │  4a. AUTO-APPROVE (≤100 DOGE)     │
     │  ─── OR ───                       │
     │  4b. REQUEST OWNER APPROVAL       │
     │  ┌──────────────┐                 │
     │  │ Telegram:    │                 │
     │  │ [Approve]    │                 │
     │  │ [Deny]       │                 │
     │  └──────────────┘                 │
     │                                   │
     │  5. CONSTRUCT + SIGN TX           │
     │  ┌─────────────────────┐          │
     │  │ Select UTXOs        │          │
     │  │ Build raw tx        │          │
     │  │ Sign with key       │          │
     │  │ Add OP_RETURN:      │          │
     │  │  "OC:inv_7f3a9b2c"  │          │
     │  └─────────────────────┘          │
     │                                   │
     │  6. BROADCAST TX                  │
     │ ─────── (DOGE network) ──────────>│
     │  txid: abc123...                  │
     │                                   │
     │  7. PAYMENT NOTIFICATION          │
     │ ──────────────────────────────────>│
     │  { txid, invoiceId, amount }      │
     │                                   │
     │  8. VERIFY ON-CHAIN               │
     │                 ┌─────────────────┤
     │                 │ Check txid      │
     │                 │ Verify amount   │
     │                 │ Wait for conf   │
     │                 └─────────────────┤
     │                                   │
     │  9. RECEIPT                        │
     │ <──────────────────────────────────│
     │  { invoiceId, txid, status: paid,│
     │    confirmedAt }                  │
     │                                   │
```

**OP_RETURN Metadata:**
- Each agent-to-agent tx includes an OP_RETURN output with the invoice ID
- Format: `OC:<invoiceId>` (max 80 bytes, well within DOGE's OP_RETURN limit)
- This links on-chain transactions to off-chain invoices permanently
- Cost: 0 DOGE (OP_RETURN outputs are unspendable, no value attached)

### 9.4 Payment Verification

When Agent B receives a payment notification:

```typescript
async function verifyPayment(notification: PaymentNotification): Promise<boolean> {
  // 1. Fetch transaction from blockchain
  const tx = await api.getTransaction(notification.txid);

  // 2. Check that at least one output pays our address
  const ourOutput = tx.outputs.find(o => o.address === ourAddress);
  if (!ourOutput) return false;

  // 3. Check amount matches invoice (within dust tolerance)
  const invoice = await getInvoice(notification.invoiceId);
  if (Math.abs(ourOutput.amount - invoice.payment.amount) > DUST_THRESHOLD) return false;

  // 4. Check OP_RETURN matches invoice ID
  const opReturn = tx.outputs.find(o => o.scriptType === "OP_RETURN");
  if (opReturn) {
    const data = decodeOpReturn(opReturn.script);
    if (data !== `OC:${invoice.invoiceId}`) {
      // Warning but not failure — OP_RETURN is optional
      logger.warn("OP_RETURN mismatch", { expected: invoice.invoiceId, got: data });
    }
  }

  // 5. Wait for minimum confirmations
  if (tx.confirmations < MIN_CONFIRMATIONS) {
    // Schedule re-check
    await scheduleVerification(notification, tx.confirmations);
    return false; // Not yet confirmed
  }

  // 6. Mark invoice as paid
  await markInvoicePaid(invoice.invoiceId, notification.txid);
  return true;
}
```

### 9.5 Dispute Resolution

**V1: Simple timeout-based:**
- Invoice expires after `expiresAt` — if not paid, service provider decides next steps
- If paid but service not rendered: human intervention (agents log complaint)
- No on-chain escrow (too complex, not worth it for micro-transactions)
- Trust-based: agents build reputation through transaction history

**V2 (Future): Reputation + Escrow:**
- Agent reputation scores based on transaction history
- Multi-sig escrow for large payments (>1000 DOGE)
- Dispute resolution agent (third-party AI mediator)

### 9.6 Callback Protocol

When payer sends payment, they POST to the callback URL:

```typescript
// POST to callback.url
interface PaymentCallback {
  invoiceId: string;
  txid: string;
  amount: number;        // DOGE sent
  fee: number;           // Fee paid
  timestamp: string;
  status: "broadcast" | "confirmed";
  confirmations: number;
}

// Response from payee
interface CallbackResponse {
  status: "accepted" | "rejected";
  message?: string;
}
```

---

## 10. API Provider Selection

### 10.1 Provider Comparison

| Feature | BlockCypher | SoChain (chain.so) | Blockchair |
|---------|-------------|---------------------|------------|
| **DOGE Support** | ✅ Full | ✅ Full + Testnet | ✅ Full |
| **Free Tier** | 200 req/hr (no key), 2000/hr (with key) | Requires API key | Requires API key |
| **UTXO Endpoint** | ✅ `/addrs/{addr}?unspentOnly=true` | ✅ `/api/v3/unspent_outputs/DOGE/{addr}` | ✅ |
| **Tx Broadcast** | ✅ `/txs/push` | ✅ `/api/v3/send_tx/DOGE` | ✅ |
| **Balance** | ✅ `/addrs/{addr}/balance` | ✅ `/api/v3/balance/DOGE/{addr}` | ✅ |
| **Tx Details** | ✅ `/txs/{txid}` | ✅ `/api/v3/transaction/DOGE/{txid}` | ✅ |
| **Fee Estimate** | ✅ (in chain info response) | ❌ Not directly | ❌ |
| **WebSocket** | ✅ (paid) | ❌ | ❌ |
| **Testnet** | ❌ No DOGE testnet | ✅ DOGETEST | ❌ |
| **Response Time** | ~50-100ms | ~5ms (claimed) | ~100-200ms |
| **Reliability** | High (enterprise) | High (since 2014) | High |
| **Pricing** | Free: 200/hr, $75/mo: 1M/day | Free with API key (limits TBD) | $33/mo: 30k req/day |

### 10.2 Recommendation

**Primary: BlockCypher**
- Base URL: `https://api.blockcypher.com/v1/doge/main`
- Reason: No API key needed for basic usage, good DOGE support, includes fee estimates, proven reliability
- Live-confirmed working (tested during research — returned real DOGE network data at block 6,069,516)
- Free tier (200 req/hr) sufficient for development; $75/mo plan for production

**Fallback: SoChain (chain.so)**
- Base URL: `https://chain.so/api/v3`
- Reason: DOGE testnet support (critical for development), fast response times, been around since 2014
- Requires API key (free tier available after signup)
- Has UTXO endpoint which includes full `tx_hex` (useful for offline signing)

**Price Data: CoinGecko**
- Base URL: `https://api.coingecko.com/api/v3`
- Endpoint: `/simple/price?ids=dogecoin&vs_currencies=usd`
- Free tier: 30 calls/min
- Cache price for 5 minutes (DOGE price doesn't need second-level accuracy)

### 10.3 Provider Interface

```typescript
interface DogeApiProvider {
  name: string;
  getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }>;
  getUtxos(address: string): Promise<UTXO[]>;
  getTransaction(txid: string): Promise<Transaction>;
  getTransactions(address: string, limit: number): Promise<Transaction[]>;
  broadcastTx(rawHex: string): Promise<{ txid: string }>;
  getNetworkInfo(): Promise<{ height: number; feeEstimate: FeeEstimate }>;
}
```

All provider-specific code lives behind this interface. Switching providers = new class, same interface.

---

## 11. Dependencies

### 11.1 npm Packages

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `bitcore-lib-doge` | `10.10.5` | Core DOGE library — address generation, tx building, signing | ~4MB |
| `bip39` | `3.1.0` | BIP39 mnemonic generation (24-word seed phrase) | ~331KB |
| `hdkey` | `2.1.0` | BIP32 HD key derivation | Small |
| `bs58check` | `^3.0.1` | Base58Check encoding for DOGE addresses | Small |
| `@noble/secp256k1` | `3.0.0` | Optional: audited secp256k1 if replacing elliptic | Small |
| — | — | `crypto` (Node.js built-in) — AES-256-GCM, scrypt, randomBytes | Built-in |

**Note on `bitcore-lib-doge`:**
- Maintained by BitPay (same team as `bitcore-lib` for Bitcoin)
- Latest publish: 2025 (version 10.10.5, built on Node 20.17.0)
- Pure JavaScript — no native bindings
- Handles: address generation, transaction construction, script building, ECDSA signing
- Does NOT have native TypeScript definitions — we'll create `.d.ts` declarations or use `@ts-ignore`

**Alternative considered: `dogecore-lib`**
- Version 0.14.0 — much older, unmaintained (Dogesight project)
- Dependencies pinned to ancient versions (bn.js@2.0.4, elliptic@3.0.3)
- **Not recommended** — use `bitcore-lib-doge` instead

**Alternative considered: Raw `bitcoinjs-lib` + DOGE params**
- `bitcoinjs-lib` v7.0.1 is modern, TypeScript-native
- Could work with DOGE by providing custom network parameters
- More work but cleaner TypeScript integration
- **Consider for v2** if `bitcore-lib-doge` TypeScript friction is too high

### 11.2 DOGE Network Parameters

```typescript
// For use with bitcoinjs-lib or manual construction
const DOGE_MAINNET = {
  messagePrefix: '\x19Dogecoin Signed Message:\n',
  bech32: '', // DOGE doesn't use bech32
  bip32: {
    public: 0x02facafd,   // dgub
    private: 0x02fac398,  // dgpv
  },
  pubKeyHash: 0x1e,       // D... addresses
  scriptHash: 0x16,       // 9... or A... addresses
  wif: 0x9e,              // Private key WIF prefix
};

const DOGE_TESTNET = {
  messagePrefix: '\x19Dogecoin Signed Message:\n',
  bech32: '',
  bip32: {
    public: 0x0432a9a8,   // tgub
    private: 0x0432a243,  // tgpv
  },
  pubKeyHash: 0x71,       // n... addresses
  scriptHash: 0xc4,
  wif: 0xf1,
};
```

---

## 12. Build Phases

### Phase 0: Foundation + Read-Only (Days 1-2)
- [ ] Create plugin directory structure
- [ ] Write `openclaw.plugin.json` manifest
- [ ] Implement BlockCypher + SoChain API provider layer (read-only)
- [ ] Implement failover logic between providers
- [ ] Implement price fetching (CoinGecko)
- [ ] Register `/balance` command (shows "no wallet configured" until init)
- [ ] Write provider tests (mock + integration)
- [ ] Test: `curl https://api.blockcypher.com/v1/doge/main` → parse response
- **Deliverable:** Plugin loads, API layer works, can query blockchain read-only

### Phase 1: Key Management + Wallet Init (Days 3-4)
- [ ] Implement BIP39 mnemonic generation
- [ ] Implement BIP44 HD key derivation for DOGE (m/44'/3'/0'/...)
- [ ] Implement AES-256-GCM encryption with scrypt KDF
- [ ] Implement encrypted keystore read/write
- [ ] Register `/wallet init` command — generates wallet, shows mnemonic ONCE
- [ ] Register `/wallet recover` command — restore from mnemonic
- [ ] Register `/wallet address` command — derive + show receiving address
- [ ] Security: file permissions enforcement (0600/0700)
- [ ] Write key management tests (encryption roundtrip, derivation vectors)
- **Deliverable:** Wallet can be created, encrypted, stored, recovered. Addresses can be generated.

### Phase 2: UTXO Management + Balance (Days 5-6)
- [ ] Implement UTXO fetching from API providers
- [ ] Implement local UTXO cache (JSON file)
- [ ] Implement coin selection algorithm (branch-and-bound + largest-first)
- [ ] Implement UTXO refresh cron job (every 2 minutes)
- [ ] Connect `/balance` command to real wallet data
- [ ] Register `wallet_balance` agent tool
- [ ] Register `wallet_address` agent tool
- [ ] Write UTXO selection tests (edge cases: exact match, dust, insufficient)
- **Deliverable:** Agent can check balance, generate addresses. UTXOs tracked.

### Phase 3: Transaction Builder + Sending (Days 7-9)
- [ ] Implement transaction construction (P2PKH)
- [ ] Implement ECDSA signing with derived keys
- [ ] Implement fee estimation
- [ ] Implement broadcast to BlockCypher + SoChain
- [ ] Implement confirmation tracking (poll until 6 confirmations)
- [ ] Implement spending policy engine (all tiers)
- [ ] Implement pending approval queue
- [ ] Register `/send` command
- [ ] Register `wallet_send` agent tool
- [ ] Register `/approve` and `/deny` commands
- [ ] Telegram inline buttons for approval
- [ ] Audit trail logging for all sends
- [ ] Write transaction tests (testnet integration)
- **Deliverable:** Agent can send DOGE with policy enforcement and owner approval.

### Phase 4: Notifications + History + Polish (Days 10-11)
- [ ] Implement full notification system (all events from 5.8)
- [ ] Implement incoming payment detection (UTXO watcher)
- [ ] Register `wallet_history` agent tool
- [ ] Register `/wallet` dashboard command
- [ ] Implement `/wallet export` (CSV export)
- [ ] Implement `/wallet freeze` and `/wallet unfreeze`
- [ ] Rate limiting enforcement (daily/hourly)
- [ ] Low balance alerts
- [ ] UTXO consolidation logic
- [ ] Implement price-aware display (DOGE + USD)
- **Deliverable:** Full wallet with notifications, history, export. Production-ready for single agent.

### Phase 5: Agent-to-Agent Protocol (Days 12-14)
- [ ] Implement invoice creation + tracking
- [ ] Register `wallet_invoice` agent tool
- [ ] Implement OP_RETURN metadata in transactions
- [ ] Implement payment callback protocol
- [ ] Implement payment verification (payee side)
- [ ] Implement `.well-known/openclaw-pay.json` discovery
- [ ] Implement invoice expiry + cleanup
- [ ] Write protocol tests (mock two-agent payment)
- **Deliverable:** Two OpenClaw agents can discover each other, invoice, pay, and verify.

### Phase 6: Hardening + Mainnet (Days 15-17)
- [ ] Full testnet integration testing
- [ ] Security audit (key handling, memory zeroing, error paths)
- [ ] Load testing (many small transactions)
- [ ] Edge case testing (network failures, API outages, concurrent sends)
- [ ] Documentation (README, setup guide, security notes)
- [ ] Dr. Castro review + approval
- [ ] Switch to mainnet with real DOGE
- **Deliverable:** Battle-tested, mainnet-ready wallet.

---

## 13. Token/Cost Budget

### 13.1 API Costs

| Service | Free Tier | Production Tier | Our Usage Est. |
|---------|-----------|----------------|---------------|
| BlockCypher | 200 req/hr | $75/mo (1M req/day) | ~500-1000 req/day → Free tier OK initially |
| SoChain | Free with API key | TBD | Fallback only — ~50 req/day |
| CoinGecko | 30 req/min | Free tier sufficient | ~288 req/day (5-min cache) |

**Monthly API cost estimate:** $0-75/month (free tier is sufficient for moderate usage)

### 13.2 Transaction Costs

| Operation | Fee (DOGE) | Fee (USD) | Frequency |
|-----------|-----------|-----------|-----------|
| Typical send (1-in, 2-out) | ~0.23 DOGE | ~$0.025 | Per transaction |
| Complex send (5-in, 2-out) | ~0.60 DOGE | ~$0.065 | Occasional |
| UTXO consolidation | ~1.0 DOGE | ~$0.11 | Monthly |

**Monthly tx fee estimate:** 100 transactions/month × 0.3 DOGE = **~30 DOGE (~$3.24/month)**

### 13.3 LLM Token Costs

The wallet plugin itself uses minimal LLM tokens — most operations are deterministic. The agent tools are invoked by the agent during conversations, using existing session tokens.

| Operation | Token Cost | Notes |
|-----------|-----------|-------|
| Agent calling `wallet_send` | ~200 tokens (tool call) | Part of normal conversation |
| Agent calling `wallet_balance` | ~100 tokens | Part of normal conversation |
| Invoice generation | ~300 tokens | Part of A2A conversation |

**Additional LLM cost from wallet:** Negligible (~$0.50/month)

### 13.4 Total Monthly Cost Estimate

| Component | Cost |
|-----------|------|
| API providers | $0 (free tier) |
| Transaction fees | ~$3.24 |
| LLM tokens | ~$0.50 |
| **Total** | **~$3.74/month** |

---

## 14. Risk Mitigation

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | Private key theft | Low | Critical | AES-256-GCM encryption, passphrase not on disk, file perms, memory zeroing |
| 2 | Agent spends too much | Medium | High | Spending tiers, daily limits, owner approval for medium+, emergency freeze |
| 3 | API provider goes down | Medium | Medium | Multi-provider failover (BlockCypher + SoChain). Refuse to send if both down. |
| 4 | DOGE price crashes | Medium | Medium | USD-denominated limits as optional. Policy tiers adjustable at any time. |
| 5 | DOGE price moons | Medium | Low | Tier amounts are in DOGE, not USD. Adjust manually if needed. |
| 6 | Double-spend attempt | Low | High | Wait for confirmations before trusting. Multi-provider UTXO verification. |
| 7 | Mnemonic lost | Medium | Critical | Clear warning during setup. Suggest physical backup. No recovery without it. |
| 8 | UTXO dust accumulation | Medium | Low | Dust threshold enforcement, periodic consolidation. |
| 9 | Agent-to-agent protocol abuse | Medium | Medium | Rate limiting, allowlists, reputation tracking (v2). |
| 10 | Regulatory scrutiny | Low | High | Keep good records (audit trail), stay under de minimis thresholds, consult counsel. |
| 11 | Plugin breaks on OpenClaw update | Medium | Medium | Pin plugin API versions, test on updates before deploy. |
| 12 | BlockCypher free tier rate limits | Medium | Low | Cache aggressively, use SoChain fallback. Upgrade to paid if needed. |

---

## 15. Open Questions for Dr. Castro

1. **Passphrase delivery:** How should the wallet passphrase be provided?
   - Option A: Entered once via Telegram, held in memory only during session (more secure, less convenient)
   - Option B: Stored encrypted in a separate file with OS keyring (more convenient, slightly less secure)
   - Option C: Environment variable (simplest, moderate security)

2. **Testnet first?** Should Phase 0-4 use DOGE testnet, then switch to mainnet in Phase 5?
   - Recommended: Yes, testnet via SoChain (DOGETEST) for all development

3. **Initial funding:** How much DOGE to seed the wallet with? Suggested: 1,000 DOGE (~$108) as initial petty cash

4. **Spending tier amounts:** Are the default tiers (10/100/1,000/10,000 DOGE) reasonable for your use case?

5. **Agent-to-agent priority:** Should Phase 5 (A2A protocol) come before Phase 4 (notifications/polish)?

6. **Multi-agent support:** Should one wallet serve multiple OpenClaw instances, or one wallet per agent?

7. **Backup strategy:** Should the plugin support encrypted cloud backup of the keystore (e.g., to a private git repo)?

8. **Notification channel:** Use main Telegram chat or separate thread/bot for wallet notifications?

9. **`bitcore-lib-doge` vs `bitcoinjs-lib` + custom params:** BitPay's library is proven but JS-only. `bitcoinjs-lib` is TypeScript-native but needs DOGE parameter injection. Preference?

10. **Regulatory counsel:** Should we consult a crypto-savvy attorney re: money transmitter implications before going live?

---

## 16. Future: Multi-Chain Expansion

The plugin architecture is designed for future multi-chain support.

### 16.1 Abstraction Layer

```typescript
// Core wallet interface — same for any chain
interface ChainWallet {
  getBalance(): Promise<WalletBalance>;
  send(address: string, amount: number, reason: string): Promise<SendResult>;
  getHistory(limit: number): Promise<Transaction[]>;
  generateAddress(): Promise<string>;
  createInvoice(amount: number, desc: string): Promise<Invoice>;
}

// DOGE implementation
class DogeWallet implements ChainWallet { ... }

// Future implementations
class SolanaWallet implements ChainWallet { ... }
class EthWallet implements ChainWallet { ... }
```

### 16.2 Planned Chains

| Chain | Priority | Reason | Complexity |
|-------|----------|--------|------------|
| **DOGE** | ✅ Now | Meme-first, micro-transactions, low fees | Medium (UTXO model) |
| **SOL** | Future | Fast, cheap, good DeFi tooling, account model | High (Solana SDK) |
| **ETH (Base L2)** | Future | EVM ecosystem, stablecoins, Coinbase alignment | High (gas estimation, EIP-1559) |
| **LTC** | Future | Same codebase as DOGE (Litecoin fork) | Low (reuse DOGE code) |
| **BTC** | Future | The OG. Store of value. | Medium (reuse DOGE code) |

### 16.3 Config Evolution

```json
{
  "plugins": {
    "entries": {
      "crypto-wallet": {
        "config": {
          "chains": {
            "doge": { "enabled": true, "network": "mainnet", ... },
            "sol":  { "enabled": false, "network": "mainnet-beta", ... },
            "eth":  { "enabled": false, "network": "base-mainnet", ... }
          },
          "defaultChain": "doge",
          "policy": { ... }
        }
      }
    }
  }
}
```

### 16.4 Cross-Chain Agent Payments (V3+)

- Agent A has DOGE, Agent B wants SOL
- Integrated DEX swap (Jupiter for SOL, Uniswap for ETH)
- Atomic cross-chain invoices: "Pay 100 DOGE or equivalent in SOL"
- Way future — focus on DOGE-to-DOGE first

---

## Appendix A: Dogecoin Network Reference

| Parameter | Mainnet | Testnet |
|-----------|---------|---------|
| Coin name | Dogecoin (DOGE) | Dogecoin Testnet |
| BIP44 coin type | 3 | 1 |
| Address prefix (P2PKH) | `D` (0x1e) | `n` (0x71) |
| Address prefix (P2SH) | `9`/`A` (0x16) | `2` (0xc4) |
| WIF prefix | 0x9e | 0xf1 |
| Block time | ~1 minute | ~1 minute |
| Block reward | 10,000 DOGE (fixed) | 10,000 DOGE |
| Max supply | Unlimited (inflationary) | Unlimited |
| Min relay fee | 1 DOGE/KB | 1 DOGE/KB |
| Dust threshold | 0.001 DOGE (100,000 koinu) | Same |
| OP_RETURN max | 80 bytes | 80 bytes |
| Base unit | koinu (1 DOGE = 100,000,000 koinu) | Same |
| Current block height | ~6,069,516 (Feb 2026) | — |
| Confirmations (safe) | 6 (~6 minutes) | 1 |

## Appendix B: API Quick Reference

**BlockCypher — DOGE Mainnet:**
```
Base: https://api.blockcypher.com/v1/doge/main

GET  /                                    # Chain info + fee estimates
GET  /addrs/{addr}/balance                # Address balance
GET  /addrs/{addr}?unspentOnly=true       # UTXOs
GET  /txs/{txid}                          # Transaction details
POST /txs/push  { "tx": "<hex>" }         # Broadcast
GET  /addrs/{addr}/full?limit=10          # Full address info + txs
```

**SoChain — DOGE (Mainnet + Testnet):**
```
Base: https://chain.so/api/v3
Header: API-KEY: <your-key>

GET  /balance/DOGE/{addr}                 # Balance
GET  /unspent_outputs/DOGE/{addr}/{page}  # UTXOs (paginated)
GET  /transactions/DOGE/{addr}/{page}     # Transactions
POST /send_tx/DOGE                        # Broadcast
GET  /transaction/DOGE/{txid}             # Tx details
GET  /address_summary/DOGE/{addr}         # Address stats

# Testnet: replace DOGE with DOGETEST
```

**CoinGecko — Price:**
```
GET https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd
→ { "dogecoin": { "usd": 0.107842 } }
```

---

*Much design. Very comprehensive. Wow.* 🐕
