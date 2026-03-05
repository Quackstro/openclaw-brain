# 📊 Doc-RAG Improvement Tracker

**Started:** 2026-02-01  
**Owner:** Jarvis (delegated by Dr. Castro)  
**Master Plan:** `plans/doc-rag-improvements.md`

---

## Workflow Per Improvement

```
Research → Plan → Implement → Validate → Cutover → Commit
   🔬        📋       🤖         🧪         🚀        ✅
```

Each improvement follows the doc-rag-mvp pattern:
- Development isolation (no live gateway impact)
- Standalone test harness
- Failover/rollback strategy
- Controlled cutover with < 30s rollback
- Manual verification before commit

---

## Usage Monitor

- **Threshold:** Stay below 90% context capacity
- **Action if approaching:** Pause, compact, throttle sub-agents
- **Sub-agent budget:** Max 2 concurrent

---

## Tier 1 — High Impact, Low Effort

| # | Improvement | Research | Plan | Implement | Validate | Cutover | Commit | Status |
|---|------------|----------|------|-----------|----------|---------|--------|--------|
| 1 | Hybrid Search (BM25 + Vector) | ✅ Done | ✅ Done | ✅ Done | ✅ 17/17 | ✅ Live | ✅ | ✅ Complete |
| 2 | Contextual Chunk Headers | ✅ Done | ✅ Done | 🔄 In Progress | ⏳ | ⏳ | ⏳ | 🤖 Implementing |
| 3 | Reranking | ✅ Done | ✅ Done | ⏳ | ⏳ | ⏳ | ⏳ | Queued (after #2) |
| 4 | Chunk-Level Citations | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |

## Tier 2 — Medium Impact, Medium Effort

| # | Improvement | Research | Plan | Implement | Validate | Cutover | Commit | Status |
|---|------------|----------|------|-----------|----------|---------|--------|--------|
| 5 | Parent-Child Chunking | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 6 | HyDE | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 7 | Semantic Chunking | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 8 | Document Summary Index | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 9 | Query Expansion | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |

## Tier 3 — Nice to Have

| # | Improvement | Research | Plan | Implement | Validate | Cutover | Commit | Status |
|---|------------|----------|------|-----------|----------|---------|--------|--------|
| 10 | Local Embeddings | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 11 | Table-Aware Chunking | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |
| 12 | Feedback Loop | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | Queued |

---

## Milestone Log

| Date | Milestone | Notes |
|------|-----------|-------|
| 2026-02-01 | Project kickoff | Tracker created, Hybrid Search research started |
| 2026-02-01 | Hybrid Search research complete | Research + plan delivered. LanceDB 0.23.0 has native FTS+RRF — no upgrade needed. Only 3 files to modify. |
| 2026-02-01 | Hybrid Search implemented | 17/17 tests pass, 0 regressions. |
| 2026-02-01 | Hybrid Search cutover | Config schema fix (additionalProperties:false was stripping retrieval key). Now live with hybrid.enabled: true. |

---

## Issues Requiring Dr. Castro's Input

| Date | Issue | Status |
|------|-------|--------|
| — | — | — |

---

## Context Usage Log

| Timestamp | Context % | Action Taken |
|-----------|-----------|-------------|
| 2026-02-01 02:27 | 46% | Starting research phase |
