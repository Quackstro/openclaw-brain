# Sub-agent Announce Delivery Fix

**Date:** 2026-02-01
**Issue:** Sub-agent announce messages arrive as internal system events with no delivery context. Agent responses to announces don't route to Telegram.

**Root cause:** OpenClaw only routes responses to Telegram when the triggering message came FROM Telegram. Announce messages are internal → response has no `deliveryContext` → never reaches user.

**Fix:** After processing any sub-agent announce, explicitly use the `message` tool to send the summary to Telegram (`target: telegram:8511108690`).

**Code reference:** `src/agents/tools/sessions-announce-target.ts` — resolves where the announce is delivered TO the main session, but doesn't affect how the main session's response routes out.

**Documented in:** AGENTS.md
