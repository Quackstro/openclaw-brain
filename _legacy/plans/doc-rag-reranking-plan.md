# 🔄 Doc-RAG Reranking — Implementation Plan

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** 📋 Ready for Implementation  
**Depends on:** Doc-RAG Hybrid Search (✅ Complete)

---

## 1. Overview

Add a **reranking step** to the doc-rag query pipeline. After initial retrieval (vector-only or hybrid), a larger candidate set is fetched and then re-scored using an LLM (gpt-4o-mini via GitHub Models) or local cross-encoder to produce more relevant final results.

### Why Reranking?

| Scenario | Without Reranking | With Reranking |
|----------|-------------------|----------------|
| Query: "What is the termination clause?" with 5 passages about termination, 3 about general clauses mixed in | Returns all 8 ranked by embedding distance — clause descriptions may outrank the actual termination clause | LLM understands intent — promotes the passage that actually answers "what is the termination clause?" |
| Query: "Dr. Martinez's findings on patient outcomes" | Embedding finds passages about "findings" and "patient outcomes" but may rank a generic methods section higher | LLM identifies the specific passage attributing findings to Dr. Martinez |
| Query about a concept using different terminology than the document | Vector search finds related passages but may miss the most relevant one | LLM recognizes semantic equivalence, promotes the best answer |
| Hybrid search returns BM25 + vector candidates with RRF fusion | RRF is a statistical fusion — doesn't understand content | LLM scores each candidate on actual relevance to the query |

### Key Constraints
- **Zero regression** — disabled by default; current search behavior unchanged
- **No new heavy dependencies** — LLM reranking uses existing HTTP infrastructure; cross-encoder deferred to future
- **Config-driven** — enable/disable without code changes, restart only
- **Graceful degradation** — if reranker fails or times out, return un-reranked results
- **VPS-friendly** — LLM reranking adds ~1-3s latency but no local memory/CPU burden

---

## 2. Development Isolation Strategy

Development follows the **same isolation model** as the Hybrid Search plan. The live plugin is never modified until all tests pass.

### 2.1 Development Workspace

```
Development (safe):     /home/clawdbot/clawd/extensions/doc-rag/
Production (live):      ~/.openclaw/extensions/doc-rag/
```

1. **Development copy** of the plugin already exists at `/home/clawdbot/clawd/extensions/doc-rag/` (from hybrid search work)
2. **All changes made in the dev copy** — never touch `~/.openclaw/extensions/doc-rag/` during development
3. **Standalone tests run against the dev copy** using isolated temp directories
4. **Cutover:** copy modified files to production, restart gateway

### 2.2 Files That Change

| File | Change Type | Risk |
|------|------------|------|
| `reranker.ts` | **New file** — LLM reranker module | None — additive |
| `pipeline.ts` | Wire reranking into `query()` | Low — conditional branch after search |
| `config.ts` | Add `retrieval.reranking` config section | Low — additive, defaults preserve behavior |
| `types.ts` | Add reranker-related types | None — additive |
| `openclaw.plugin.json` | Add `retrieval.reranking` to configSchema | Low — additive |
| `store.ts` | No changes needed | None |
| `index.ts` | No changes needed | None |
| `package.json` | No changes needed | None |

### 2.3 Config Toggle Safety

```json5
{
  "retrieval": {
    "hybrid": { "enabled": true },  // existing
    "reranking": {
      "enabled": false  // ← stays false until explicitly enabled
    }
  }
}
```

When `enabled: false`:
- No reranking step is executed
- No LLM API calls are made
- `pipeline.query()` returns search results directly (existing behavior)
- Zero overhead, zero behavior change

### 2.4 Rollback Strategy

Disable reranking in < 30 seconds:

```bash
# 1. Set retrieval.reranking.enabled: false in openclaw.json
# 2. Restart gateway
sudo supervisorctl restart openclaw
```

---

## 3. Architecture

### 3.1 Current Flow (No Reranking)

```
User query → pipeline.query()
  │
  ├─ 1. embeddings.embed(queryText) → queryVector
  │
  ├─ 2. Search (vector-only or hybrid) → limit results
  │
  └─ 3. Enrich with doc names → return results
```

### 3.2 New Flow (With Reranking)

```
User query → pipeline.query()
  │
  ├─ 1. embeddings.embed(queryText) → queryVector
  │
  ├─ 2. Search (vector-only or hybrid)
  │     └─ Fetch candidateCount results (e.g., 20) instead of limit (e.g., 5)
  │
  ├─ 3. IF reranking.enabled:
  │     │
  │     │  reranker.rerank(queryText, candidates, limit)
  │     │  │
  │     │  ├─ a. Build prompt with query + all candidate passages
  │     │  │
  │     │  ├─ b. Call LLM (gpt-4o-mini via GitHub Models)
  │     │  │     POST https://models.inference.ai.azure.com/chat/completions
  │     │  │     { model: "gpt-4o-mini", messages: [...], temperature: 0 }
  │     │  │
  │     │  ├─ c. Parse JSON response → relevance scores per passage
  │     │  │
  │     │  ├─ d. Sort by relevance score (descending)
  │     │  │
  │     │  └─ e. Return top-K results with reranked scores
  │     │
  │     ON FAILURE (timeout, parse error, API error):
  │     │  Log warning, return un-reranked candidates (first limit results)
  │     │
  └─ 4. Enrich with doc names → return results
```

### 3.3 Reranker Module (`reranker.ts`)

```typescript
// reranker.ts — new file

export interface RerankerConfig {
  method: "llm" | "cross-encoder";
  llm: {
    model: string;
    baseURL: string;
    apiKey: string;
  };
  timeoutMs: number;
}

export interface RerankedResult {
  originalIndex: number;
  relevanceScore: number;
}

export interface Reranker {
  rerank(query: string, passages: string[], limit: number): Promise<RerankedResult[]>;
}

export class LLMReranker implements Reranker {
  constructor(private config: RerankerConfig) {}

  async rerank(query: string, passages: string[], limit: number): Promise<RerankedResult[]> {
    // 1. Build batch scoring prompt
    // 2. Call LLM with timeout
    // 3. Parse JSON response
    // 4. Sort by score, return top limit
    // 5. On failure: return indices 0..limit-1 with original scores
  }
}
```

### 3.4 Integration Point in pipeline.ts

```typescript
// In pipeline.query():

// Determine how many candidates to fetch
const fetchLimit = rerankingEnabled
  ? config.retrieval.reranking.candidateCount  // e.g., 20
  : limit;                                      // e.g., 5

// Search (vector-only or hybrid)
let searchResults = await this.search(queryVector, query, fetchLimit, ...);

// Rerank if enabled
if (rerankingEnabled && searchResults.length > 0) {
  try {
    searchResults = await this.rerankResults(query, searchResults, limit);
  } catch (err) {
    console.error(`[doc-rag] Reranking failed, returning un-reranked results: ${err}`);
    searchResults = searchResults.slice(0, limit);
  }
}
```

---

## 4. Configuration

### 4.1 New Config Section

Added under the existing `retrieval` section, with defaults that preserve current behavior:

```json5
{
  "retrieval": {
    "hybrid": { /* existing */ },
    "reranking": {
      "enabled": false,                // Master toggle (default: OFF)
      "method": "llm",                 // "llm" or "cross-encoder" (start with LLM)
      "candidateCount": 20,            // Fetch this many candidates for reranking
      "llm": {
        "model": "gpt-4o-mini",        // GitHub Models LLM
        "baseURL": "https://models.inference.ai.azure.com",
        "apiKey": "${GITHUB_TOKEN}"     // Reuse embedding key (env var interpolation)
      },
      "timeoutMs": 5000                // Abort reranking after this timeout
    }
  }
}
```

### 4.2 Config Schema Addition (`config.ts`)

```typescript
export const RerankingLlmConfigSchema = Type.Object({
  model: Type.Optional(
    Type.String({ description: "LLM model for reranking", default: "gpt-4o-mini" }),
  ),
  baseURL: Type.Optional(
    Type.String({
      description: "Base URL for LLM API",
      default: "https://models.inference.ai.azure.com",
    }),
  ),
  apiKey: Type.Optional(
    Type.String({
      description: "API key for LLM (supports ${ENV_VAR} interpolation). Defaults to embedding.apiKey.",
    }),
  ),
});

export const RerankingConfigSchema = Type.Object({
  enabled: Type.Optional(
    Type.Boolean({ description: "Enable post-retrieval reranking", default: false }),
  ),
  method: Type.Optional(
    Type.String({
      description: "Reranking method: 'llm' or 'cross-encoder'",
      default: "llm",
    }),
  ),
  candidateCount: Type.Optional(
    Type.Number({ description: "Number of candidates to fetch before reranking", default: 20 }),
  ),
  llm: Type.Optional(RerankingLlmConfigSchema),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Reranking timeout in milliseconds", default: 5000 }),
  ),
});
```

### 4.3 Resolved Config Interface

```typescript
export interface DocRagConfig {
  // ... existing fields ...
  retrieval?: {
    hybrid: { /* existing */ };
    reranking?: {
      enabled: boolean;              // default: false
      method: "llm" | "cross-encoder";  // default: "llm"
      candidateCount: number;        // default: 20
      llm: {
        model: string;               // default: "gpt-4o-mini"
        baseURL: string;             // default: "https://models.inference.ai.azure.com"
        apiKey: string;              // default: same as embedding.apiKey
      };
      timeoutMs: number;             // default: 5000
    };
  };
}
```

### 4.4 Plugin Manifest Update (`openclaw.plugin.json`)

Add under `configSchema.properties.retrieval.properties`:

```json
"reranking": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enabled": { "type": "boolean" },
    "method": {
      "type": "string",
      "enum": ["llm", "cross-encoder"]
    },
    "candidateCount": { "type": "number" },
    "llm": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "model": { "type": "string" },
        "baseURL": { "type": "string" },
        "apiKey": { "type": "string" }
      }
    },
    "timeoutMs": { "type": "number" }
  }
}
```

---

## 5. LLM Reranking Prompt Design

### 5.1 Batch Scoring Prompt

```
You are a relevance scoring system. For each passage below, rate its relevance to the query on a scale of 0.0 to 10.0.

Consider:
- Does the passage directly answer or address the query?
- Semantic meaning matters more than keyword overlap.
- A passage that contains the exact information requested scores highest.
- A passage that is topically related but doesn't answer the query scores lower.

Query: {query}

Passages:
[1] {passage_1_text}
---
[2] {passage_2_text}
---
...
[N] {passage_N_text}

Return ONLY a JSON array of objects, each with "index" (1-based integer) and "score" (float 0.0-10.0).
Example: [{"index":1,"score":8.5},{"index":2,"score":3.0}]
```

### 5.2 Prompt Token Budget

- System/instruction: ~120 tokens
- Query: ~10-50 tokens
- Per passage: ~200 tokens average (our chunks are ~500 tokens max, ~200 avg)
- 20 passages: ~4000 tokens
- Separators/formatting: ~100 tokens
- **Total input: ~4300 tokens**
- **Output: ~200 tokens** (JSON array with 20 entries)
- **Total: ~4500 tokens per reranking call**

### 5.3 Response Parsing

```typescript
function parseRerankResponse(response: string): { index: number; score: number }[] {
  // Extract JSON from response (may have markdown code fences)
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in reranking response");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("Response is not an array");

  return parsed.map((item: any) => ({
    index: Number(item.index),
    score: Number(item.score),
  }));
}
```

---

## 6. Implementation Phases

Each phase follows **test-driven development**: tests are written **before or alongside** the implementation. Every phase ends with `npx tsx tests/validate-reranking.ts` and iteration until green.

### Phase 1: Test Harness Scaffold + Config Schema
**Files:** `tests/validate-reranking.ts`, `config.ts`, `types.ts`, `openclaw.plugin.json`

- [ ] **Write test scaffold** (`tests/validate-reranking.ts`):
  - Runner framework matching hybrid search test harness pattern
  - Isolated temp directory lifecycle (create on start, delete on exit)
  - Helpers: createTestPipeline(), mock LLM server (for unit tests), real LLM tests
  - Placeholder test cases for all 16+ tests (marked `SKIP` until implementation exists)
- [ ] **Implement config extension** (`config.ts`):
  - Add `RerankingConfigSchema`, `RerankingLlmConfigSchema`
  - Add `reranking` field to `RetrievalConfigSchema` and `DocRagConfig` interface
  - Implement parsing with defaults (`enabled: false`, `method: "llm"`, `candidateCount: 20`, etc.)
  - If `reranking.llm.apiKey` is not set, default to `embedding.apiKey`
- [ ] **Update types** (`types.ts`):
  - Add `RerankResult` type
- [ ] **Update plugin manifest** (`openclaw.plugin.json`):
  - Add `reranking` section under `retrieval.properties`
- [ ] **Write and run config tests** (tests 1–3):
  - Test 1: Config parses with no `retrieval.reranking` section → defaults applied, `enabled: false`
  - Test 2: Config parses with full `retrieval.reranking` section → all values respected
  - Test 3: Config with `reranking.llm.apiKey` unset → inherits from `embedding.apiKey`
- [ ] **Run:** `npx tsx tests/validate-reranking.ts` → tests 1–3 pass, rest skipped
- [ ] **Also run existing tests** to confirm no regression:
  - `npx tsx tests/validate-hybrid.ts` → all 25 green
  - `npx tsx tests/validate.ts` → all 30 green

### Phase 2: LLM Reranker Module
**File:** `reranker.ts` (new)

- [ ] **Write reranker unit tests first** (tests 4–7):
  - Test 4: `LLMReranker.rerank()` with mock HTTP → returns correctly scored & sorted results
  - Test 5: `LLMReranker.rerank()` with malformed LLM response → throws parseable error
  - Test 6: `LLMReranker.rerank()` timeout → throws timeout error within timeoutMs
  - Test 7: `LLMReranker.rerank()` with single passage → returns that passage
- [ ] **Implement `reranker.ts`**:
  - `LLMReranker` class with constructor taking `RerankerConfig`
  - `rerank(query, passages, limit)` method:
    - Build batch scoring prompt
    - Call LLM API via `fetch()` with `AbortController` timeout
    - Parse JSON response
    - Sort by score descending, return top `limit` results
  - Response parser with JSON extraction (handles markdown code fences)
  - Proper error types for timeout, parse failure, API error
- [ ] **Run:** `npx tsx tests/validate-reranking.ts` → tests 1–7 pass

### Phase 3: Pipeline Integration
**File:** `pipeline.ts`

- [ ] **Write integration tests first** (tests 8–11):
  - Test 8: Full pipeline — ingest doc → query with reranking enabled → results returned (using real LLM)
  - Test 9: Reranking disabled → search returns same results as current behavior
  - Test 10: Reranking enabled with tag filter → only tagged doc results, reranked
  - Test 11: Reranking enabled with docId filter → only that doc's results, reranked
- [ ] **Wire reranking into `pipeline.ts`**:
  - Determine `fetchLimit` = reranking enabled ? candidateCount : limit
  - After search: if reranking enabled, call reranker
  - Wrap in try/catch — on failure, log and return un-reranked results (first `limit`)
  - Lazy-create `LLMReranker` instance (cached on pipeline)
- [ ] **Run:** `npx tsx tests/validate-reranking.ts` → tests 1–11 pass

### Phase 4: Resilience, Edge Cases, and Performance
**Tests 12–16+**

- [ ] **Graceful fallback tests** (tests 12–13):
  - Test 12: Reranker API returns error → fallback to un-reranked results, no crash
  - Test 13: Reranker times out (simulated slow response) → fallback within timeoutMs
- [ ] **Edge case tests** (tests 14–15):
  - Test 14: Empty search results + reranking enabled → returns empty array, no reranker call
  - Test 15: Single search result + reranking enabled → returns that result (no need to rerank, or reranks gracefully)
- [ ] **Quality validation test** (test 16):
  - Test 16: Ingest doc with known best passage → query with reranking → best passage ranked #1 (or top-3)
- [ ] **Compatibility tests** (tests 17–18):
  - Test 17: Reranking works with vector-only search mode (hybrid disabled)
  - Test 18: Reranking works with hybrid search mode (hybrid enabled)
- [ ] **Run:** all tests pass

---

## 7. Test Cases (18 Cases)

### Category A: Config Parsing (3 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 1 | **Config defaults** — Parse config with no `retrieval.reranking` section → `reranking.enabled` is `false`, `method` is `"llm"`, `candidateCount` is `20`, `timeoutMs` is `5000` | 1 | Backward-compatible config; zero-impact default |
| 2 | **Config custom values** — Parse config with `retrieval.reranking: { enabled: true, method: "llm", candidateCount: 30, timeoutMs: 3000 }` → all values correctly resolved | 1 | Custom config honored |
| 3 | **API key inheritance** — Parse config with `reranking.llm.apiKey` unset → `reranking.llm.apiKey` defaults to `embedding.apiKey` value | 1 | No duplicate key configuration needed |

### Category B: LLM Reranker Unit Tests (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 4 | **Reranker happy path** — Call `LLMReranker.rerank()` with real LLM (GitHub Models gpt-4o-mini), 5 passages of varying relevance → returns passages sorted by relevance score, most relevant first | 2 | Core reranking logic works end-to-end |
| 5 | **Reranker malformed response** — Mock LLM returns non-JSON text → `rerank()` throws parse error with descriptive message | 2 | Response parsing is robust |
| 6 | **Reranker timeout** — Call LLM with 100ms timeout → rerank throws within ~100ms (not hanging for default timeout) | 2 | AbortController timeout works |
| 7 | **Single passage** — `rerank()` with 1 passage → returns that passage with a score (no crash) | 2 | Edge case: minimum input |

### Category C: Pipeline Integration (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 8 | **End-to-end reranking** — Ingest document → `pipeline.query()` with reranking enabled → returns results with reranking applied (scores are LLM-derived, not distance-based) | 3 | Full pipeline wiring |
| 9 | **Disabled = no change** — Ingest doc → query with `reranking.enabled: false` → results identical to no-reranking pipeline (same scores, same order) | 3 | Zero regression when disabled |
| 10 | **Tag filter + reranking** — Ingest doc A (tags: `["finance"]`) and doc B (tags: `["legal"]`) → reranking query with `tags: ["legal"]` → results only from doc B, reranked | 3 | Tag filtering works before reranking |
| 11 | **DocId filter + reranking** — Ingest docs A and B → reranking query with `docId: A.id` → all results from doc A only, reranked | 3 | DocId filter compatible with reranking |

### Category D: Resilience & Fallback (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 12 | **API error fallback** — Configure reranker with invalid API key → query with reranking enabled → returns un-reranked results (no crash), log contains warning | 4 | Graceful degradation on API failure |
| 13 | **Timeout fallback** — Configure reranker with 100ms timeout → query → returns un-reranked results within reasonable time (not hanging) | 4 | Timeout triggers fallback, not hang |

### Category E: Edge Cases (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 14 | **Empty results** — Query that matches nothing + reranking enabled → returns empty array, reranker is never called | 4 | No wasted API calls on empty results |
| 15 | **Single result** — Query returning exactly 1 result + reranking enabled → returns that 1 result (reranker may or may not be called, but result is correct) | 4 | Single result edge case |

### Category F: Quality & Compatibility (3 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 16 | **Reranking improves ordering** — Ingest doc with one clearly best passage and several tangentially related passages → query → with reranking, best passage is rank #1 (or top-2); without reranking, best passage may be lower | 4 | Reranking actually improves quality |
| 17 | **Works with vector-only search** — Disable hybrid, enable reranking → query → results returned correctly | 4 | Reranking independent of search mode |
| 18 | **Works with hybrid search** — Enable both hybrid and reranking → query → results returned correctly | 4 | Both features compose correctly |

---

## 8. Failover & Recovery

### 8.1 LLM API Error

**Detection:** HTTP error, non-200 status, network failure.

**Recovery:**
```typescript
try {
  rerankedResults = await this.reranker.rerank(query, passages, limit);
} catch (err) {
  console.error(`[doc-rag] Reranking failed, returning un-reranked results: ${err}`);
  // Return first `limit` results from original search (un-reranked)
  return searchResults.slice(0, limit);
}
```

### 8.2 LLM Response Parse Failure

**Detection:** JSON.parse fails, missing fields, wrong types.

**Recovery:** Same as API error — fallback to un-reranked results with warning log.

### 8.3 Timeout

**Detection:** `AbortController` signal triggers after `timeoutMs`.

**Recovery:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

try {
  const response = await fetch(url, { signal: controller.signal, ... });
  // ...
} catch (err) {
  if (err.name === 'AbortError') {
    console.warn(`[doc-rag] Reranking timed out after ${this.config.timeoutMs}ms`);
  }
  throw err; // Caught by pipeline fallback
} finally {
  clearTimeout(timeoutId);
}
```

### 8.4 Rate Limiting

**Detection:** HTTP 429 response from GitHub Models.

**Recovery:** Treat as API error → fallback to un-reranked results. No retry (to avoid compounding latency).

### 8.5 Complete Recovery

If reranking consistently fails:
1. Set `retrieval.reranking.enabled: false` in config
2. Restart gateway (< 30 seconds)
3. System reverts to search-only (no reranking step)
4. Investigate and fix at leisure
5. Re-enable when ready

---

## 9. Rollback Strategy

### Instant Rollback (< 30 seconds)

```bash
# 1. Edit config: set retrieval.reranking.enabled to false
# 2. Restart
sudo supervisorctl restart openclaw
```

**Effect:** All queries skip reranking. Search results returned directly.

### Full Rollback (remove reranking code)

```bash
# 1. Restore original pipeline.ts and config.ts from backup
cp /home/clawdbot/clawd/backup/doc-rag/{pipeline,config}.ts ~/.openclaw/extensions/doc-rag/

# 2. Remove reranker.ts (new file)
rm ~/.openclaw/extensions/doc-rag/reranker.ts

# 3. Remove config section from openclaw.json
# Delete retrieval.reranking from config

# 4. Restart
sudo supervisorctl restart openclaw
```

---

## 10. Success Criteria

### 10.1 Automated Validation

The implementation is considered **ready for cutover** when all test suites pass:

```bash
# Reranking tests (18 tests)
cd /home/clawdbot/clawd/extensions/doc-rag
npx tsx tests/validate-reranking.ts
# Expected: 18 passed, 0 failed, 0 skipped
# Exit code: 0

# Hybrid search regression (25 tests)
npx tsx tests/validate-hybrid.ts
# Expected: 25 passed, 0 failed, 0 skipped
# Exit code: 0

# MVP regression (30 tests)
npx tsx tests/validate.ts
# Expected: 30 passed, 0 failed, 0 skipped
# Exit code: 0
```

**Gate rule:** All three suites exit code 0 before ANY production files are touched.

### 10.2 Pass Criteria (all must be checked)

**Test harness:**
- [ ] All 18 reranking tests pass (`validate-reranking.ts` exits 0)
- [ ] All 25 hybrid tests pass (`validate-hybrid.ts` exits 0) — confirms zero regression
- [ ] All 30 MVP tests pass (`validate.ts` exits 0) — confirms zero regression
- [ ] Test harness runs fully standalone — no gateway, no production data
- [ ] Test harness cleans up temp directories on exit (including on failure)

**Functional correctness:**
- [ ] Reranking produces correctly ordered results (LLM-scored)
- [ ] Reranking disabled → identical behavior to current system
- [ ] Tag and docId filtering work correctly with reranking
- [ ] Empty/single results handled without errors

**Resilience:**
- [ ] LLM API failure → graceful fallback to un-reranked results
- [ ] Timeout → fallback within configured timeoutMs
- [ ] Malformed LLM response → fallback with descriptive warning log
- [ ] Invalid API key → fallback (no crash)

**Configuration:**
- [ ] `retrieval.reranking.enabled: false` → zero overhead, zero behavior change
- [ ] `retrieval.reranking.enabled: true` → reranking active
- [ ] `retrieval.reranking.llm.apiKey` inherits from `embedding.apiKey` when unset
- [ ] All config fields have sensible defaults
- [ ] `openclaw.plugin.json` configSchema includes `retrieval.reranking`

**Quality:**
- [ ] At least one test demonstrates reranking improving passage ordering
- [ ] Reranking works with both vector-only and hybrid search modes

**Performance:**
- [ ] Reranking adds ≤ 5s latency (within timeoutMs)
- [ ] No unnecessary reranker calls (empty results, disabled)

### 10.3 Fail Criteria (any one blocks cutover)

- ❌ Any reranking test fails
- ❌ Any hybrid or MVP regression test fails after code changes
- ❌ Reranker failure causes query to throw instead of falling back
- ❌ `enabled: false` produces different results than current production
- ❌ Tag/docId filtering leaks results from wrong documents
- ❌ Reranking timeout causes query to hang beyond timeoutMs + buffer

---

## 11. Development Order (Test-Driven)

All development happens in `/home/clawdbot/clawd/extensions/doc-rag/` (see Section 2). The live gateway is **never touched** until Step 16.

### Phase 1: Scaffold + Config (Steps 1–5)

```
 1. Update dev workspace with latest production files:
    cp -r ~/.openclaw/extensions/doc-rag/ /home/clawdbot/clawd/extensions/doc-rag/
    (Only if production has changes since hybrid search cutover)

 2. Write test harness scaffold (tests/validate-reranking.ts):
    - Runner framework matching hybrid search pattern
    - Isolated temp directory lifecycle
    - All 18 test cases as stubs (marked SKIP)
    - Exit code 0 = all pass/skip, 1 = any fail

 3. Implement config extension (config.ts):
    - Add RerankingConfigSchema, RerankingLlmConfigSchema
    - Add reranking section to RetrievalConfigSchema + DocRagConfig interface
    - Implement parsing with defaults (enabled=false, method="llm", candidateCount=20)
    - API key inheritance: if reranking.llm.apiKey unset, use embedding.apiKey

 4. Update types.ts:
    - Add RerankResult type: { index: number; score: number }
    - Add RerankerProvider interface (optional, for future cross-encoder)

 5. Update openclaw.plugin.json:
    - Add retrieval.reranking section to configSchema.properties.retrieval.properties

 6. UN-SKIP config tests (#1, #2, #3) → run validate-reranking → fix → green
    ALSO run regression: validate-hybrid (25) + validate.ts (30) → all green
```

### Phase 2: LLM Reranker Module (Steps 7–10)

```
 7. UN-SKIP reranker unit tests (#4, #5, #6, #7):
    - These test the LLMReranker class directly
    - Run validate-reranking → tests 1-3 pass, 4-7 FAIL, 8-18 SKIP

 8. Create reranker.ts:
    - LLMReranker class implementing Reranker interface
    - buildPrompt(query, passages): builds batch scoring prompt
    - callLLM(prompt): fetch with AbortController timeout
    - parseResponse(text): extract JSON array, validate structure
    - rerank(query, passages, limit): orchestrates the above

 9. Wire up error handling:
    - TimeoutError (AbortController)
    - ParseError (malformed JSON)
    - ApiError (non-200 status)
    - All errors have descriptive messages for logging

10. Run validate-reranking → tests 1-7 pass, 8-18 SKIP
    Fix any failures, iterate until 1-7 green
```

### Phase 3: Pipeline Integration (Steps 11–14)

```
11. UN-SKIP integration tests (#8, #9, #10, #11):
    - These call pipeline.ingest() then pipeline.query() with reranking enabled
    - Run validate-reranking → tests 1-7 pass, 8-11 FAIL, 12-18 SKIP

12. Wire reranking into pipeline.ts:
    - Add rerankingConfig to pipeline constructor / config resolution
    - In query(): determine fetchLimit (candidateCount vs limit)
    - After search: if reranking.enabled and results.length > 0, call reranker
    - Try/catch: on failure, log warning and return un-reranked results
    - Lazy-create LLMReranker (cached as private field)

13. Handle score mapping:
    - After reranking, replace ChunkSearchResult.score with LLM relevance score
    - Normalize scores to 0..1 range (divide by 10) for consistency
    - Preserve chunk reference (docId, text, etc.)

14. Run validate-reranking → tests 1-11 pass, 12-18 SKIP
    Fix any failures, iterate until 1-11 green
```

### Phase 4: Resilience + Edge Cases + Quality (Steps 15–17)

```
15. UN-SKIP all remaining tests (#12-#18):
    - Resilience: #12, #13 (API error, timeout fallback)
    - Edge cases: #14, #15 (empty results, single result)
    - Quality: #16 (reranking improves ordering)
    - Compatibility: #17, #18 (vector-only, hybrid)
    - Run validate-reranking → some may fail

16. Fix all failures, iterate until tests 1-18 all green:
    - Adjust fallback logic, error handling, edge case guards
    - Quality test #16 may need careful fixture design

17. FINAL VALIDATION — all three suites must pass:
    a. npx tsx tests/validate-reranking.ts → 18 passed, 0 failed (exit 0)
    b. npx tsx tests/validate-hybrid.ts   → 25 passed, 0 failed (exit 0)
    c. npx tsx tests/validate.ts          → 30 passed, 0 failed (exit 0)
    All exit codes must be 0 before proceeding to cutover
```

### Phase 5: Controlled Cutover (Steps 18–23)

```
18. Back up production plugin:
    cp -r ~/.openclaw/extensions/doc-rag/ ~/backup-doc-rag-pre-reranking/

19. Copy modified + new files to production:
    cp reranker.ts pipeline.ts config.ts types.ts openclaw.plugin.json \
       → ~/.openclaw/extensions/doc-rag/

20. Add retrieval.reranking config to openclaw.json (enabled: false)
    Restart gateway → verify no regression via Telegram (quick smoke test)

21. Set retrieval.reranking.enabled: true in config
    Restart gateway → reranking active

22. Manual Telegram tests:
    - Upload a document → query → verify results are returned
    - Query a specific topic → verify top result is relevant
    - Query with tags → verify filtering + reranking works

23. Confirm working → leave enabled in production
    If any issues: set enabled: false, restart (< 30 seconds)
```

---

## 12. File Diff Summary

### `reranker.ts` — New File

```typescript
/**
 * Reranker module for the doc-rag plugin.
 *
 * Provides LLM-based reranking of search results.
 * Uses batch scoring (all passages in one LLM call) for efficiency.
 */

export interface RerankerConfig {
  method: "llm" | "cross-encoder";
  llm: { model: string; baseURL: string; apiKey: string };
  timeoutMs: number;
}

export interface RerankResult {
  index: number;      // 0-based index into original array
  score: number;      // LLM relevance score (0-10)
}

export class LLMReranker {
  constructor(private config: RerankerConfig) {}

  async rerank(query: string, passages: string[], limit: number): Promise<RerankResult[]> {
    if (passages.length === 0) return [];
    if (passages.length === 1) return [{ index: 0, score: 10 }];

    const prompt = this.buildPrompt(query, passages);
    const responseText = await this.callLLM(prompt);
    const scores = this.parseResponse(responseText, passages.length);

    // Sort by score descending, take top limit
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  private buildPrompt(query: string, passages: string[]): string { /* ... */ }
  private async callLLM(prompt: string): Promise<string> { /* ... */ }
  private parseResponse(text: string, expectedCount: number): RerankResult[] { /* ... */ }
}
```

### `config.ts` — Additions

```diff
+ // New schemas
+ export const RerankingLlmConfigSchema = Type.Object({ ... });
+ export const RerankingConfigSchema = Type.Object({ ... });

  // RetrievalConfigSchema — add reranking field
  export const RetrievalConfigSchema = Type.Object({
    hybrid: Type.Optional(HybridConfigSchema),
+   reranking: Type.Optional(RerankingConfigSchema),
  });

  // DocRagConfig interface — add reranking section
  retrieval?: {
    hybrid: { ... };
+   reranking?: {
+     enabled: boolean;
+     method: "llm" | "cross-encoder";
+     candidateCount: number;
+     llm: { model: string; baseURL: string; apiKey: string };
+     timeoutMs: number;
+   };
  };

  // Config parser — add reranking parsing
+ const rerankRaw = obj(retRaw.reranking);
+ const rerankLlmRaw = obj(rerankRaw.llm);
```

### `pipeline.ts` — Modifications

```diff
+ import { LLMReranker } from "./reranker.js";

  export class DocRagPipeline {
+   private reranker: LLMReranker | null = null;

    async query(params: QueryParams): Promise<QueryResult> {
      const queryVector = await this.embeddings.embed(query);

+     // Determine fetch limit — more candidates if reranking enabled
+     const rerankCfg = this.config.retrieval?.reranking;
+     const fetchLimit = (rerankCfg?.enabled)
+       ? rerankCfg.candidateCount
+       : limit;

-     // Search
-     let searchResults = await ...(queryVector, limit, ...);
+     // Search (fetch more candidates if reranking)
+     let searchResults = await ...(queryVector, fetchLimit, ...);

+     // Rerank if enabled
+     if (rerankCfg?.enabled && searchResults.length > 0) {
+       try {
+         searchResults = await this.rerankResults(query, searchResults, limit);
+       } catch (err) {
+         console.error(`[doc-rag] Reranking failed: ${err}`);
+         searchResults = searchResults.slice(0, limit);
+       }
+     }

      // Enrich with doc names ...
    }

+   private async rerankResults(
+     query: string,
+     results: ChunkSearchResult[],
+     limit: number,
+   ): Promise<ChunkSearchResult[]> {
+     if (!this.reranker) {
+       this.reranker = new LLMReranker(this.config.retrieval!.reranking!);
+     }
+     const passages = results.map(r => r.chunk.text);
+     const reranked = await this.reranker.rerank(query, passages, limit);
+     return reranked.map(r => ({
+       chunk: results[r.index].chunk,
+       score: r.score / 10,  // Normalize to 0..1
+     }));
+   }
  }
```

### `openclaw.plugin.json` — Additions

```diff
  "retrieval": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "hybrid": { ... },
+     "reranking": {
+       "type": "object",
+       "additionalProperties": false,
+       "properties": {
+         "enabled": { "type": "boolean" },
+         "method": { "type": "string", "enum": ["llm", "cross-encoder"] },
+         "candidateCount": { "type": "number" },
+         "llm": {
+           "type": "object",
+           "additionalProperties": false,
+           "properties": {
+             "model": { "type": "string" },
+             "baseURL": { "type": "string" },
+             "apiKey": { "type": "string" }
+           }
+         },
+         "timeoutMs": { "type": "number" }
+       }
+     }
    }
  }
```

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM adds 1-3s latency to every query | Medium | Disabled by default; acceptable for doc Q&A use case; timeout configurable |
| LLM returns unparseable response | Medium | Robust JSON extraction (handles code fences); fallback to un-reranked |
| GitHub Models rate limits | Low | Free tier generous; one call per query; fallback on 429 |
| LLM hallucinates scores (all 10s, or random) | Low | Temperature=0 reduces randomness; quality test validates improvement |
| API key exposed in config | Low | Supports `${ENV_VAR}` interpolation; same pattern as embedding key |
| Reranking makes irrelevant results appear relevant | Very Low | Reranking only reorders existing results — doesn't introduce new ones |
| Network failure during reranking | Medium | Timeout + fallback; graceful degradation guaranteed |
| Token budget exceeded for large passages | Low | Passages are chunks (~500 tokens max); 20 passages = ~4500 tokens total |

---

## 14. Future Enhancements (Post Reranking v1)

- **Local cross-encoder** — Add `cross-encoder` method using `@huggingface/transformers` with `Xenova/ms-marco-MiniLM-L-6-v2` for zero-latency, zero-cost reranking
- **Adaptive reranking** — Only rerank when initial search scores are close (if top result score >> rest, skip reranking)
- **Caching** — Cache reranking results for repeated/similar queries
- **Confidence threshold** — Only return results above a minimum reranked score
- **Per-query toggle** — Allow `doc_query` to accept `rerank: true/false` parameter for per-query control
- **Score blending** — Combine initial search score with reranking score (weighted average) for more robust ranking
- **Token usage tracking** — Log tokens used per reranking call for cost monitoring
- **Multi-model fallback** — Try gpt-4o-mini first, fall back to a cheaper model if rate-limited
