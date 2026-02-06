# Quackstro Protocol — Major Design Session

**Date:** 2026-02-05
**Status:** ✅ Comprehensive spec update complete

## Key Decisions Made

### 1. Configurable Settlement Modes (both available in v1)
- **Direct HTLC** (default): Atomic per-call settlement using hash time-locked contracts. Provider generates secret S, consumer locks funds to H(S), provider reveals S to claim. Refund after timeout if provider doesn't deliver.
- **Payment Channel** (opt-in): 2-of-2 multisig funded by consumer. Off-chain commitment txs shift balance per call. Near-instant. Best for high-frequency consumers.
- **Post-payment fallback**: For micro amounts (< 1 DOGE) where HTLC overhead > payment. Trust-based, reputation-gated.

### 2. Provider Configures, Consumer Chooses
- Provider advertises supported modes in SERVICE_ADVERTISE flags + .well-known manifest
- Consumer picks mode based on usage pattern (one-off vs. frequent)
- No negotiation protocol — it's a menu

### 3. MCP Tool Integration Vision
- A2A crypto transactions replace API keys/OAuth for MCP tool usage
- Payment IS authorization — no auth, pay per use
- Agents advertise MCP tools with pricing in discovery manifest
- Composable agent economy: chains of micropayments across tool providers

## Spec Updates (quackstro-protocol-spec.md)
- Section 9.1: Replaced Post-Payment/Escrow with Direct HTLC + Payment Channel + Post-payment fallback
- Section 5.4.1: Updated SERVICE_ADVERTISE flags (bit 0: supports_direct_htlc, bit 5: supports_payment_channel, bit 6: accepts_post_payment)
- Section 5.3: Added message types 0x0A-0x0D (HTLC_OFFER, HTLC_CLAIM, CHANNEL_OPEN, CHANNEL_CLOSE)
- Section 15.1: Added MCP Tool Integration as future extension
- Renumbered future extensions (15.1-15.8)
- Version bumped to v0.1.1

### 4. Confirmation Policy — Provider-Configurable
- Provider sets confirmation tiers in `.well-known` manifest
- Default tiers: 0-conf < 10 DOGE, 1-conf < 50, 3-conf < 500, 6-conf above
- Reputation discount: trusted agents (score ≥ 600) get 1 fewer confirmation per tier
- DOGE's lack of default RBF makes 0-conf safer than BTC
- Added as §9.2 in the spec

### 5. Dual Discovery — MCP Extension + .well-known Manifest
- Both layers available, consumer uses either or both
- MCP tool metadata gets a lightweight `quackstro` field (skill_code, price, settlement, address)
- `.well-known/quackstro.json` is source of truth (full config, confirmation policy, channel params, all tools)
- On-chain SERVICE_ADVERTISE bootstraps for agents without HTTP endpoints
- Fallback chain: on-chain → .well-known → MCP metadata
- Added as §6.2 in the spec

## Open Design Questions (remaining)
- ~~Prepaid vs. post-paid~~ → RESOLVED: configurable (HTLC + channel + post-pay)
- ~~Leverage blockchain contracts?~~ → RESOLVED: HTLCs for atomic settlement
- ~~Make both options available?~~ → RESOLVED: yes, provider-configurable
- ~~Confirmation speed / 0-conf thresholds~~ → RESOLVED: provider-configurable tiers
- ~~Discovery protocol (MCP vs. manifest)~~ → RESOLVED: both (dual layer)
- ~~Refunds/disputes for HTLC failures~~ → RESOLVED: tiered dispute resolution
  - < 1 DOGE: accept + rate (reputation only)
  - 1-100 DOGE: delivery hash commitment (cryptographic proof of fraud)
  - > 100 DOGE: 2-of-3 arbiter escrow (fund recovery possible)
- ~~Rate cards (flat per-call, per-token, tiered)~~ → RESOLVED: all models supported
  - 6 pricing units (per-request, per-KB, per-hour, per-1k-tokens, flat-rate, negotiable)
  - Volume discounts with configurable tiers + reset periods
  - Dynamic pricing (demand-responsive, load-based)
  - Composite pricing (multi-dimension, quote-based)
  - On-chain carries base price; .well-known has full rate card; sideload for quotes

### 6. Payment Channel — Time-Decaying Model
- Each new commitment tx has a shorter timelock than the previous
- Latest commitment always unlocks first → old states can't beat it
- No revocation keys, no watchtowers needed
- Provider just needs to check chain before channel expiry
- Max calls per channel = TTL / timelock_gap (e.g., 1440/10 = 144)
- Cooperative close (happy path): both sign final settlement, no timelocks
- Channel renewal: atomic close-old + open-new in single tx

## All Original Open Questions RESOLVED ✅

## Deep Dive Topics
1. ~~Payment Channel state management~~ → RESOLVED: time-decaying model
2. ~~HTLC Script implementation~~ → RESOLVED: full implementation in spec
   - HASH160 (RIPEMD160(SHA256)), 32-byte secret, CLTV absolute timelock
   - Consumer overfunds (fee buffer ~0.01 DOGE), P2SH + OP_RETURN same tx
   - Redeem script: 103 bytes, P2SH version byte 0x16
   - Full TypeScript reference: buildHTLCRedeemScript, createHTLC, buildClaimScriptSig, buildRefundScriptSig
   - New message types: HTLC_OFFER (0x0A) 76-byte payload, HTLC_CLAIM (0x0B)
3. ~~Agent tool chaining (composability)~~ → RESOLVED: Orchestrator model (option B)
   - Orchestrators wrap multiple sub-agent tools into composite tools
   - Consumer sees one tool, one HTLC, one price
   - Orchestrator pays sub-agents from own wallet (working capital)
   - Working capital requirement = skin in the game
   - New flag: bit 7 is_composite_tool in SERVICE_ADVERTISE
   - Optional pipeline_transparency in .well-known manifest
   - Chained HTLCs (atomic multi-hop) deferred to v2 (§15.8)
4. ~~Arbiter protocol~~ → RESOLVED: full protocol in spec
   - Discovery: hybrid (on-chain registry + provider pre-approves)
   - Selection: provider pre-approves 3-5, consumer picks (fast); fallback to consumer proposal (slow)
   - Evidence: hash-anchored (on-chain) + selective disclosure (sideload to arbiter)
   - Fees: retainer (0.5%) + dispute bonus (1.5%), loser pays
   - Collusion: reputation + caps (100-500 DOGE by reputation tier); accept limits, split large txs
5. ~~Privacy layer~~ → RESOLVED: A + B + E for v1
   - Accept base transparency (blockchain is public)
   - Fresh addresses per session (HD wallet rotation, recommended best practice)
   - Payment channels provide built-in privacy (only open/close visible, not individual calls)
   - Timing obfuscation as optional practice
   - Stealth addresses + CoinJoin deferred to v2
6. ~~Security model update (HTLC/channel attack vectors)~~ → RESOLVED: all 7 attacks documented
   - HTLC Griefing: require sideload request first (B)
   - Preimage Withholding: accept + protocol norm (A + C)
   - Fee Sniping: adequate fees + claim early (A + B)
   - Stale State Broadcast: provider responsibility + honest about risk (A + D)
   - Channel Exhaustion: per-call disputes + reputation-gated channels (A + C)
   - Non-Cooperative Close: accept + track in reputation (A + C)
   - Eclipse Attack: multiple APIs + confirmation depth (A + B)

## ALL DEEP DIVE TOPICS COMPLETE ✅

## Edge Cases & Operations (Round 2)
1. ~~Agent Lifecycle~~ → RESOLVED
   - Bootstrap: E + A + B (organic growth + post-payment from trusted + competitive pricing)
   - Key Rotation: new message type KEY_ROTATION (0x0F), reputation transfers
   - Graceful Shutdown: checklist + AGENT_RETIRED message (0x10) with reason codes
   - Recovery: documented for network hiccup, missed claim, disk failure, key compromise
2. ~~Network Partitions / Reorgs~~ → RESOLVED: B + D
   - Tiered confirmation thresholds for secret reveal (1/3/6 confs by value)
   - Reorg monitoring + re-broadcast if orphaned
   - Channel close requires 6 confirmations, monitor for competing commits
   - Network partition detection via multi-API comparison
3. ~~Multi-Currency Future~~ → RESOLVED: A (DOGE-only, no abstraction)
   - No premature multi-chain abstraction
   - Refactor later if/when needed
   - v1 is DOGE, simple and focused
4. ~~Testnet Strategy~~ → RESOLVED: B (scripted test suite)
   - Automated scripts against DOGE testnet
   - 4 phases: unit tests → regtest → testnet integration → mainnet dry run
   - Test scenarios: HTLC flows, channel lifecycle, discovery, arbiter
   - CI/CD integration for regression catching
5. ~~Reference Implementation Roadmap~~ → RESOLVED: approved 4-phase plan
   - Q1: Discovery + Handshake (talk)
   - Q2: Direct HTLC (transact)
   - Q3: Payment Channels (scale)
   - Q4: Reputation + Arbiter (trust)
   - Each phase: 2-4 weeks, builds on previous
6. ~~SDK/Library Design~~ → RESOLVED: C + Both
   - Core + plugins architecture (@quackstro/core, /htlc, /channel, /sideload, /arbiter, /reputation)
   - Imperative API for actions, event-driven for reactions
   - Pick what you need — providers can start minimal and add features
7. ~~Fee Economics Deep Dive~~ → RESOLVED: A (document in spec)
   - Full cost tables per operation
   - Break-even analysis for Direct HTLC vs channels
   - Mode selection guide (crossover at ~2 calls)
   - Pricing recommendations by service type
   - Added as §12.3 in spec
8. ~~Market Dynamics~~ → RESOLVED: A (protocol-neutral)
   - No artificial price floors or caps
   - Let market forces determine pricing
   - Natural floor exists from tx costs
   - Quality providers differentiate on reputation/speed
9. ~~Versioning & Upgrades~~ → RESOLVED: A (forever support)
   - v1 agents work indefinitely
   - New message types use reserved codes (0x11+)
   - New fields use reserved bytes in existing messages
   - Breaking changes require version bump (v2)
   - De facto deprecation only when usage drops to zero
10. ~~Governance~~ → RESOLVED: A → D
   - For now: Quackstro LLC decides (fast, accountable)
   - Later: Transition to QIP process (Quackstro Improvement Proposals)
   - No tokens or on-chain voting — keep it simple

## ALL 10 EDGE CASES & OPERATIONS TOPICS COMPLETE ✅

## Spec Review & Fixes (Evening Session)

Dr. Castro requested background agent review of the spec. Found 34 issues total.

### HIGH Priority Fixes (8 issues, all resolved):
- H1-H2: Encrypted data size math — reduced sideload_token to 8 bytes (19 plaintext + 16 GCM tag = 35 bytes ✓)
- H3-H5: Added formal payload specs for HTLC_OFFER (0x0A), HTLC_CLAIM (0x0B), CHANNEL_OPEN (0x0C), CHANNEL_CLOSE (0x0D), KEY_ROTATION (0x0F), AGENT_RETIRED (0x10)
- H6: Added computed reference registry addresses (general, compute, data, content, identity)
- H7: Clarified SERVICE_REQUEST is optional (skip for known providers, use for bidding)
- H8: Moved KEY_ROTATION/AGENT_RETIRED specs to §5.4.14/15, §11.7 references them

### MEDIUM Priority Fixes (15 issues, all resolved):
- M1: IV management — counter-based derivation
- M2: Arbiter protocol — clarified v1 is off-chain
- M3: IPFS CID — hash reference scheme
- M4: Volume/privacy tradeoff documented
- M5: Post-payment signaling is implicit
- M6: Commitment script punishment mechanism explained
- M7: txid comparison — big-endian 256-bit
- M8: Session ID collision — resolved by tuple
- M9: Rejections via sideload, 0x0E reserved
- M10: Block-based timeouts authoritative
- M11: DELIVERY_RECEIPT dual uses clarified
- M12: Sideload token purpose documented
- M13: Composite flag already fixed
- M14: HTLC vs arbiter dispute types clarified
- M15: JSON schema URL placeholder added

### LOW Priority (11 issues, not addressed yet)
- Governance process, reputation decay, fee buffer guidance, minor documentation

## Registry Addresses (Reference)
```
general:  DG7EBGqYFaWnaYeH9QQNEWeT6xY2DqVCzE
compute:  DMiK6hDKciWj4NG9Pi7m9dtATduM46sdsT
data:     D9mT3x5tsg7UYtxvjs9YwN8HN6EPiroSF6
content:  DFhMUCFGhiv7Fd5fA1nvceDwTzPW8zpMi8
identity: DLtg8eRLc4BCZsb18GAvYmDRZC1PDyyJSi
```

## Spec Stats
- File: /home/clawdbot/clawd/plans/quackstro-protocol-spec.md
- Size: ~4,900 lines (grew from ~2,400 today)
- Review: /home/clawdbot/clawd/plans/quackstro-protocol-review.md

## Implementation Roadmap (Approved)
- Q1: Discovery + Handshake (2-3 weeks)
- Q2: Direct HTLC (2-3 weeks)
- Q3: Payment Channels (3-4 weeks)
- Q4: Reputation + Arbiter (3-4 weeks)

## Also Today
- DOGE wallet test self-sends #1, #2, #3 all successful
- Final balance: ~8.16 DOGE

---
**Session End (Final):** ALL review items resolved.

### Final Review Status (34/34 issues fixed):
- HIGH (8/8): Encrypted data math, payload specs, registry addresses, clarifications
- MEDIUM (15/15): IV management, arbiter protocol, volume/privacy, scripts, versioning
- LOW (11/11): Governance, reputation decay, fee buffer, examples, labels, rate limits
- NEW (4/4): Token size consistency, example updates

### Key Final Fixes:
- All sideload_token references updated to 8 bytes (was inconsistent)
- ">95% of channels" softened to "vast majority of channels"
- Review document fully updated with resolution notes

**Spec is implementation-ready for Q1 reference implementation work.** 🦆
