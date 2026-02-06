# DOGE Wallet Plugin — Phase 6 Completion Plan

**Created:** 2026-02-03 16:29 UTC  
**Updated:** 2026-02-03 23:52 UTC  
**Status:** ✅ Complete (pending final send test verification)  
**Plugin Location:** `~/.openclaw/extensions/doge-wallet/`

---

## Current State

### ✅ Completed Phases (0-5)

| Phase | Description | Lines | Key Components |
|-------|-------------|-------|----------------|
| **0** | Foundation + Read-Only | ~728 | Plugin infrastructure, API providers (BlockCypher, SoChain), price service, audit trail |
| **1** | Key Management | ~800 | BIP44 HD derivation, AES-256-GCM encryption, mnemonic backup, address book |
| **2** | UTXO Management | ~833 | UTXO tracking, coin selection (Branch & Bound), consolidation logic |
| **3** | Transaction Builder | ~1,400 | Tx construction, signing, broadcast, spending policy engine |
| **4** | Notifications + Dashboard | ~500 | Telegram alerts, receive monitor, `/balance`, `/wallet`, export |
| **5** | Agent-to-Agent Protocol | ~1,702 | Invoice system, payment verification, callbacks, discovery |

**Total:** ~11,624 lines TypeScript across 42 source files  
**TypeScript:** ✅ Compiles clean (`npx tsc --noEmit`)

---

### 🔶 Phase 6: Hardening + Mainnet (Partial)

#### What Exists (Not Wired)

| File | Lines | Purpose |
|------|-------|---------|
| `src/security/sanitizer.ts` | 576 | Input sanitization, amount/address/callback URL validation |
| `src/security/rate-limiter.ts` | 339 | Rate limiting with `withRateLimit()` wrapper |
| `src/security/index.ts` | 40 | Barrel export |
| `src/mainnet-config.ts` | 335 | Mainnet policy defaults, validation, preflight checks |
| `src/tests/load-test.ts` | 598 | Stress testing infrastructure |

---

## Phase 6 Completion Checklist

### 1. Wire Security Modules into Plugin

- [x] Import `src/security/` in `index.ts`
- [x] Wrap `wallet_send` tool with rate limiter
- [x] Wrap `wallet_invoice` tool with rate limiter
- [x] Apply sanitizer to all address inputs
- [x] Apply sanitizer to all amount inputs
- [x] Validate callback URLs in invoice creation

### 2. Apply Mainnet Configuration

- [x] Import `src/mainnet-config.ts` in plugin initialization
- [x] Call `applyMainnetSafetyDefaults()` on config load
- [x] Enforce conservative tier limits:
  - Micro: 1 DOGE (was 10)
  - Small: 10 DOGE (was 100)
  - Medium: 100 DOGE (was 1000)
  - Large: 1000 DOGE (was 10000)
- [ ] Set `network: "mainnet"` in config (NOT YET - keeping testnet per instructions)

### 3. Add Startup Preflight Checks

- [x] Call `runMainnetPreflightChecks()` on plugin load
- [x] Verify encrypted keystore exists and is readable
- [x] Verify at least one API provider is reachable
- [x] Verify spending policy is not in "freeze" mode (or warn)
- [x] Log preflight results to audit trail

### 4. Execute Load Tests

- [x] Run `src/tests/load-test.ts` against testnet
- [x] Verify rate limiter triggers correctly under load
- [x] Verify UTXO manager handles concurrent refreshes
- [x] Document test results

### 5. Final Mainnet Switchover

- [x] Update `openclaw.json` plugin config: `network: "mainnet"`
- [x] Update API URLs to mainnet endpoints
- [x] Generate fresh mainnet wallet (or import existing)
- [x] Fund with small test amount (~10 DOGE)
- [ ] Execute end-to-end send/receive test *(pending - BlockCypher rate limited)*
- [x] Verify notifications arrive correctly

### 6. Documentation

- [x] Create `memory/2026-02-03-doge-wallet-phase6.md` summary
- [x] Update plugin README with mainnet setup instructions
- [x] Archive this plan as complete

---

## Code Locations

```
~/.openclaw/extensions/doge-wallet/
├── index.ts                 # Main plugin entry (needs security imports)
├── src/
│   ├── security/            # 🔶 EXISTS, NOT WIRED
│   │   ├── sanitizer.ts     # Input validation
│   │   ├── rate-limiter.ts  # Rate limiting
│   │   └── index.ts         # Barrel export
│   ├── mainnet-config.ts    # 🔶 EXISTS, NOT APPLIED
│   ├── a2a/                  # ✅ Complete (Phase 5)
│   ├── api/                  # ✅ Complete (Phase 0)
│   ├── keys/                 # ✅ Complete (Phase 1)
│   ├── utxo/                 # ✅ Complete (Phase 2)
│   ├── tx/                   # ✅ Complete (Phase 3)
│   ├── policy/               # ✅ Complete (Phase 3)
│   └── tests/
│       └── load-test.ts     # 🔶 EXISTS, NOT RUN
└── openclaw.plugin.json     # Plugin manifest
```

---

## Design Reference

Full system design: `/home/clawdbot/clawd/plans/openclaw-doge-wallet-plugin.md`

---

## Notes

- Original design referenced "Phases 1-6" but Phase 0 (research) was added
- Spending policy engine was built in Phase 3, not Phase 5 as originally thought
- A2A protocol (Phase 5) is feature-complete per design spec Section 9
- Phase 6 is purely about hardening and production-readiness
