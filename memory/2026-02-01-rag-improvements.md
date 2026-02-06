# Session: 2026-02-01

## Doc-RAG Improvement Pipeline

### Completed
- **Improvement #1: Hybrid Search** — ✅ Live
  - Research + plan + implement + cutover all done in one session
  - 17/17 tests pass, hybrid enabled in production
  - Bug found: `openclaw.plugin.json` has `additionalProperties: false` — new config keys MUST be added to the manifest schema or they get stripped on restart
  - Files changed: config.ts (+83), store.ts (+217), pipeline.ts (+40/-5), openclaw.plugin.json (added retrieval schema)

### In Progress
- **#2 Contextual Chunk Headers** — research running
- **#3 Reranking** — research running in parallel
- Implementation will be sequential (per Dr. Castro): #2 first, then #3

### Workflow
- Full pipeline pattern documented in `memory/workflows/long-running-improvement-pipeline.md`
- Tracker at `plans/doc-rag-improvement-tracker.md`
- Diff review skipped for this project (per Dr. Castro)
- Added mandatory: pre-flight script, regression gate, performance baselines, batch cutover option

### Key Lesson
- Plugin manifest `configSchema` with `additionalProperties: false` silently strips unknown config keys on gateway restart
- ALWAYS update manifest schema when adding new config sections
