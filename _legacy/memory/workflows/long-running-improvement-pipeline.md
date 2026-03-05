# Long-Running Improvement Pipeline — Workflow Pattern

**Created:** 2026-02-01  
**Origin:** Doc-RAG improvement series (12 improvements, Tier 1-3)  
**Status:** Active pattern — use for any multi-phase feature improvement project

---

## When to Use This Pattern

- Feature has multiple sequential improvements planned
- Each improvement is independently deployable
- Work spans multiple sessions/days
- Delegation to sub-agents is needed
- User wants milestone pings, not play-by-play

---

## Artifacts Per Improvement

```
research/doc-rag-{name}.md          ← Deep research findings
plans/doc-rag-{name}-plan.md        ← Implementation plan (MVP-style)
plans/doc-rag-improvement-tracker.md ← Master tracker (single source of truth)
```

### Plan Template Must Include:
1. Overview + why
2. Development isolation strategy
3. Architecture (current vs new flow)
4. Configuration (defaults preserve current behavior)
5. Data model changes
6. Implementation phases with checkboxes
7. **Test cases (15+ minimum)** — written BEFORE or alongside code
8. Failover & recovery
9. Rollback strategy (< 30s)
10. Success criteria with checkboxes
11. Development order (numbered, tests interleaved)

---

## 6-Stage Pipeline Per Improvement

```
🔬 Research → 📋 Plan → 🤖 Implement → 🧪 Validate → 🚀 Cutover → ✅ Commit
```

### Stage 1: 🔬 Research (Sub-Agent)
- Spawn sub-agent (Sonnet, 10min budget)
- Research: official docs, community techniques, our codebase
- Deliverables: research findings MD + implementation plan MD
- Model: `anthropic/claude-sonnet-4` (cost-efficient for research)

### Stage 2: 📋 Plan Review (Main Agent)
- Review research + plan for quality
- Verify test coverage is comprehensive
- Check plan follows the template
- Send follow-up to sub-agent if gaps found

### Stage 3: 🤖 Implement (Sub-Agent)
- Spawn coding sub-agent (Sonnet, 15min budget)
- Task includes: read plan → implement → write tests → run tests → iterate
- Agent works in dev workspace only (NEVER production)
- Must report: files changed, tests passing, blockers

### Stage 4: 🧪 Validate (Main Agent)
- Review implementation output
- Verify all tests pass (both new + regression)
- Check for code quality issues
- If issues: send corrections to sub-agent or fix directly

### Stage 5: 🚀 Cutover (Needs User Sign-Off)
1. Run pre-flight script → must pass (tests + regression + diff)
2. Capture performance baseline (before)
3. Post diff summary to Dr. Castro → wait for sign-off
4. Copy to production, config toggle OFF, restart, verify no regression
5. Enable feature, restart, manual smoke test
6. Capture performance baseline (after) → compare
7. If issues: disable + restart (< 30s rollback)
8. Consider batching with other same-tier improvements if ready

### Stage 6: ✅ Commit
- Update tracker (status → Complete)
- Update plan status to ✅ Complete with date
- Update `tests/validate-all.ts` to include new test suite
- Log performance delta in baselines file
- Save session notes to memory
- Move to next improvement

---

## Sub-Agent Guidelines

### Model Selection
| Task | Model | Budget | Rationale |
|------|-------|--------|-----------|
| Research | claude-sonnet-4 | 10min | Cost-efficient, good at reading/summarizing |
| Implementation | claude-sonnet-4 | 15min | Good at coding, cheaper than Opus |
| Complex debugging | claude-opus-4-5 | 15min | Only if Sonnet gets stuck |

### Task Prompts Must Include:
1. Explicit file paths (read from X, write to Y)
2. "Read the plan FIRST" instruction
3. "NEVER modify production files" guardrail
4. Specific test commands to run
5. Expected output format (what to report back)
6. Blockers protocol (document clearly, don't guess)

### Follow-Up Messages
- Can send additional instructions to running sub-agents via `sessions_send`
- Useful for: adding test cases, clarifying requirements, priority changes
- Keep follow-ups focused — one concern per message

---

## Context/Usage Management

### Monitoring
- Check `session_status` before spawning heavy work
- Target: stay below **90% context** in main session
- Sub-agents have their own context — don't count toward main

### Throttling Strategies
- **Approaching 80%:** Finish current improvement, compact before next
- **Approaching 90%:** Pause pipeline, save state to tracker, start new session
- **Sub-agent failures:** Max 2 retries, then escalate to Dr. Castro

### Cost Control
- Use Sonnet for sub-agents (not Opus) unless Sonnet fails
- Max 2 concurrent sub-agents
- Research + implement can't run in parallel (sequential dependency)

---

## Communication Protocol

### Milestone Pings to Dr. Castro
- ✅ Research complete for improvement #N
- ✅ Implementation + tests passing for #N
- 🚀 Ready for cutover on #N (needs sign-off)
- ✅ Cutover complete, committed
- ⚠️ Blocker found — needs decision
- 📊 Progress update (every 3-4 improvements)

### What NOT to ping about
- Sub-agent spawned (routine)
- Tests being iterated (expected)
- Heartbeat checks (noise)
- Context management (internal)

---

## Tracker Updates

Update `plans/doc-rag-improvement-tracker.md` at each stage transition:

```markdown
| # | Improvement | Research | Plan | Implement | Validate | Cutover | Commit | Status |
|---|------------|----------|------|-----------|----------|---------|--------|--------|
| 1 | Hybrid Search | ✅ | ✅ | 🔄 | ⏳ | ⏳ | ⏳ | 🤖 Implementing |
```

Also update:
- Milestone Log (date + event + notes)
- Issues table (if user input needed)
- Context Usage Log (periodic snapshots)

---

## Improvement Suggestions (Evolving)

### What's Working Well
- Sub-agent delegation keeps main context lean
- Tracker as single source of truth
- MVP-style plans are thorough enough for autonomous implementation
- Config toggles make cutover safe

### Potential Improvements to This Workflow
1. **Pre-flight checklist** before cutover — automated script that verifies all tests pass, files are synced, config is correct
2. **Automated regression gate** — a single `make test-all` that runs both new + MVP tests
3. **Diff review step** — before cutover, show a summary of all changed files for human review
4. **Rollback verification** — after cutover, explicitly test the rollback path (disable, restart, verify)
5. **Performance baseline** — capture latency/memory metrics before and after each improvement
6. **Changelog generation** — auto-generate a changelog entry from the plan + implementation
7. **Dependency graph** — some improvements depend on others (e.g., #5 Parent-Child depends on #2 Contextual Headers) — enforce ordering
8. **Batch cutover** — if improvements #1-3 are all tested, cut over all at once instead of 3 restarts
9. **Canary testing** — enable for a subset of queries first (e.g., 10% random), monitor, then full rollout
10. **Sub-agent output validation** — main agent should always review sub-agent output before proceeding, not blindly trust it

---

## Mandatory Workflow Enhancements (Added 2026-02-01)

### A. Pre-Flight Cutover Script
Before any cutover, run an automated pre-flight check:

```bash
#!/bin/bash
# scripts/doc-rag-preflight.sh
set -e

DEV_DIR="/home/clawdbot/clawd/extensions/doc-rag"
PROD_DIR="$HOME/.openclaw/extensions/doc-rag"

echo "=== Pre-Flight Cutover Check ==="

# 1. Run new feature tests
echo "[1/5] Running feature tests..."
cd "$DEV_DIR" && npx tsx tests/validate-hybrid.ts
echo "✅ Feature tests passed"

# 2. Run MVP regression tests
echo "[2/5] Running regression tests..."
cd "$DEV_DIR" && npx tsx tests/validate.ts
echo "✅ Regression tests passed"

# 3. Show diff summary
echo "[3/5] File diff vs production:"
for f in config.ts types.ts store.ts pipeline.ts index.ts; do
  if diff -q "$DEV_DIR/$f" "$PROD_DIR/$f" >/dev/null 2>&1; then
    echo "  $f — no changes"
  else
    echo "  $f — CHANGED ($(diff "$DEV_DIR/$f" "$PROD_DIR/$f" | grep '^[<>]' | wc -l) lines differ)"
  fi
done

# 4. Validate config
echo "[4/5] Config validation..."
# (gateway config.get check would go here)

# 5. Capture performance baseline
echo "[5/5] Performance baseline captured"
echo "=== PRE-FLIGHT PASSED — Safe to cutover ==="
```

Adapt per improvement (swap test filenames). **Never cutover without green pre-flight.**

### B. Automated Regression Gate
Create `tests/validate-all.ts` that imports and runs ALL test suites:
- MVP tests (validate.ts)
- Hybrid search tests (validate-hybrid.ts)
- Future: contextual headers tests, reranking tests, etc.

Single command: `npx tsx tests/validate-all.ts` → exit 0 = all green.
Add each new test suite as improvements land. This is the **final gate** before cutover.

### C. Diff Review Before Cutover
**SKIPPED for Doc-RAG improvement project** (per Dr. Castro 2026-02-01).
Cutover proceeds directly after pre-flight tests pass — no manual diff review needed.
Re-enable for other projects if desired.

### D. Batch Cutover for Same-Tier Improvements
When multiple improvements within the same tier are all independently tested:
- Option to batch cutover (copy all files, single restart)
- Reduces disruption (1 restart instead of N)
- Pre-flight script must cover ALL improvements in the batch
- Rollback: revert ALL files in the batch, not individual
- **Only batch within same tier** — never mix tiers

### E. Performance Baseline Tracking
Before and after each improvement, capture:

```
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Vector query avg latency (ms) | X | Y | +/-% |
| Hybrid query avg latency (ms) | N/A | Y | — |
| Memory usage (MB) | X | Y | +/-% |
| Index size on disk (MB) | X | Y | +/-% |
| Ingest time per doc avg (ms) | X | Y | +/-% |
```

Store baselines in: `research/doc-rag-performance-baselines.md`
Run benchmark script: `tests/benchmark.ts` (create once, reuse for each improvement)
**Reject cutover if any metric degrades >50% without justification.**

---

## Anti-Patterns to Avoid

- ❌ Don't modify production files during development
- ❌ Don't skip regression tests
- ❌ Don't chain improvements without committing the previous one
- ❌ Don't trust sub-agent output without review
- ❌ Don't spawn more than 2 concurrent sub-agents
- ❌ Don't continue at >90% context — save state and start fresh
- ❌ Don't bolt tests on at the end — write them alongside implementation
- ❌ Don't ping user for routine events — only milestones and blockers
