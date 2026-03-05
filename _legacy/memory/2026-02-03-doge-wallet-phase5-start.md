# DOGE Wallet — Phase 5 Kickoff

**Date:** 2026-02-03 ~09:43 UTC
**Status:** 🚧 In Progress (sub-agent spawned)

## Context
Dr. Castro asked if Phase 5 completed. It had not been started — Phases 0-4 were complete but Phase 5 (Agent-to-Agent Protocol) was untouched.

## Sub-Agent Spawned
- **Label:** `doge-wallet-phase5`
- **Session:** `agent:main:subagent:ddf2cd37-8cec-4af8-a8d2-2336270c04d6`
- **Task:** Build A2A micro-transaction protocol

## Phase 5 Scope
Files to create:
- `src/a2a/invoice.ts` — Invoice creation + tracking
- `src/a2a/verification.ts` — Payment verification (payee side)
- `src/a2a/callback.ts` — Payment callback protocol
- `src/a2a/discovery.ts` — `.well-known/openclaw-pay.json` generation
- `src/a2a/expiry.ts` — Invoice expiry + cleanup

Updates:
- `src/tx/builder.ts` — Add OP_RETURN support (`OC:<invoiceId>` format)
- `index.ts` — Wire `wallet_invoice` tool + `/wallet invoice` commands

## Deliverable
Two OpenClaw agents can discover each other, create invoices, pay, and verify payments on-chain.

## Previous Phases (Complete)
- Phase 0: Foundation + Read-Only ✅
- Phase 1: Key Management + Wallet Init ✅
- Phase 2: UTXO Management + Balance ✅
- Phase 3: Transaction Builder + Sending ✅
- Phase 4: Notifications + Dashboard ✅

## Remaining After Phase 5
- Phase 6: Hardening + Mainnet (security audit, load testing, mainnet switch)
