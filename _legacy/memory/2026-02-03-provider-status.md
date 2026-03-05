# Provider Status Note

**Date:** 2026-02-03 ~09:40 UTC

## Current Auth Profiles
- `anthropic:claude-cli` — OAuth, active (expires Feb 4)
- `anthropic:manual` — Token, active (last good)

## Issue Flagged
At 03:40 UTC, a cron job failed due to rate limiting on Anthropic. The fallback models (`github-copilot/claude-sonnet-4.5`, `github-copilot/gpt-5.2`) have **no API key configured**.

**Impact:** When Anthropic hits rate limits, there's nowhere to fall back to.

**Fix options:**
1. Configure GitHub Copilot auth: `openclaw agents add main`
2. Add a different fallback provider
3. Wait for Anthropic cooldown (usually 1-5 min)

The rate limit cleared on its own by 04:40 UTC. No action taken yet on configuring fallbacks.
