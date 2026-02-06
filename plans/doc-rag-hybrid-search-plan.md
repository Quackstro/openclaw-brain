# 🔍 Doc-RAG Hybrid Search — Implementation Plan

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** 📋 Ready for Implementation  
**Depends on:** Doc-RAG MVP (✅ Complete)  

---

## 1. Overview

Add **hybrid search** to the doc-rag plugin by combining the existing vector search (cosine similarity) with BM25 full-text search, fused using **Reciprocal Rank Fusion (RRF)**. This improves retrieval quality by leveraging both semantic understanding (vector) and exact keyword matching (BM25).

### Why Hybrid Search?

| Query Type | Vector-Only | Hybrid |
|------------|-------------|--------|
| "What are the termination clauses?" | ✅ Good (semantic) | ✅ Good |
| "Find invoice #INV-2026-0342" | ❌ Poor (no exact match) | ✅ Exact match via BM25 |
| "section 4.2.1 liability" | ❌ Poor (numbers lost in embedding) | ✅ BM25 finds exact terms |
| "What does the contract say about responsibility?" | ✅ Good (synonym mapping) | ✅ Good |
| "Dr. Martinez's recommendations" | ❌ Fair (names embed poorly) | ✅ BM25 matches exact name |

### Key Constraints
- **Zero regression** — disabled by default; current vector-only behavior unchanged
- **No new dependencies** — LanceDB 0.23.0 already has FTS + RRF support
- **Config-driven** — enable/disable without code changes, restart only
- **VPS-friendly** — FTS index adds ~50-100MB for max 25K chunks

---

## 2. Development Isolation Strategy

Development follows the **same isolation model** as the MVP plan (Section 2 of `doc-rag-mvp.md`). The live plugin is never modified until all tests pass.

### 2.1 Development Workspace

```
Development (safe):     /home/clawdbot/clawd/extensions/doc-rag/
Production (live):      ~/.openclaw/extensions/doc-rag/
```

However, since the MVP is already deployed and running, the approach is:

1. **Create a development copy** of the plugin in `/home/clawdbot/clawd/extensions/doc-rag/`
2. **All changes made in the dev copy** — never touch `~/.openclaw/extensions/doc-rag/` during development
3. **Standalone tests run against the dev copy** using isolated temp directories
4. **Cutover:** copy modified files to production, restart gateway

### 2.2 Files That Change

Only these files in the production plugin need modification:

| File | Change Type | Risk |
|------|------------|------|
| `store.ts` | Add `hybridSearchChunks()` method | Medium — new method, existing code untouched |
| `pipeline.ts` | Wire hybrid search into `query()` | Low — conditional branch on config |
| `config.ts` | Add `retrieval.hybrid` config section | Low — additive, defaults preserve behavior |
| `types.ts` | Add `HybridSearchOptions` type | None — additive |
| `index.ts` | No changes needed | None |
| `package.json` | No changes needed | None |

### 2.3 Config Toggle Safety

```json5
{
  // Default: hybrid is DISABLED
  "retrieval": {
    "hybrid": {
      "enabled": false  // ← stays false until explicitly enabled
    }
  }
}
```

When `enabled: false`:
- FTS index is **never created**
- `pipeline.query()` uses **vector-only** search (existing `store.searchChunks()`)
- Zero overhead, zero behavior change
- **Exactly the same as current production**

### 2.4 Rollback Strategy

Disable hybrid search in < 30 seconds:

```bash
# 1. Set retrieval.hybrid.enabled: false in openclaw.json
# 2. Restart gateway
sudo supervisorctl restart openclaw
```

The FTS index remains on disk (inert when hybrid is disabled). To clean up:
```bash
# Optional: drop FTS index (run via CLI or agent)
# Or just leave it — it doesn't affect vector-only queries
```

---

## 3. Architecture

### 3.1 Current Flow (Vector-Only)

```
User query → pipeline.query()
  │
  ├─ 1. embeddings.embed(queryText) → queryVector
  │
  ├─ 2. store.searchChunks(queryVector, limit, {tags})
  │     └─ chunksTable.vectorSearch(queryVector)
  │        .where(tagFilter)
  │        .limit(limit * 3)
  │        .toArray()
  │     └─ Convert _distance → score = 1/(1+distance)
  │
  └─ 3. Enrich with doc names → return results
```

### 3.2 New Flow (Hybrid Search)

```
User query → pipeline.query()
  │
  ├─ 1. embeddings.embed(queryText) → queryVector
  │
  ├─ 2. IF hybrid.enabled:
  │     │
  │     │  store.hybridSearchChunks(queryVector, queryText, limit, {tags})
  │     │  │
  │     │  ├─ a. Ensure FTS index exists (lazy creation)
  │     │  │
  │     │  ├─ b. chunksTable
  │     │  │     .vectorSearch(queryVector)
  │     │  │     .fullTextSearch(queryText, { columns: "text" })
  │     │  │     .where(tagFilter)
  │     │  │     .rerank(rrfReranker)    // ← RRF fusion
  │     │  │     .limit(limit)
  │     │  │     .toArray()
  │     │  │
  │     │  └─ c. Convert _relevance_score → normalized score
  │     │
  │     ELSE:
  │     │  store.searchChunks(queryVector, limit, {tags})  // existing path
  │     │
  └─ 3. Enrich with doc names → return results
```

### 3.3 FTS Index Lifecycle

```
Plugin startup (hybrid enabled)
  │
  ├─ Lazy: FTS index created on first hybrid search call
  │        (not on startup — avoids blocking gateway init)
  │
  ├─ doc_ingest completes → rebuild FTS index
  │        (includes newly added chunks)
  │
  ├─ doc_delete completes → optionally rebuild FTS index
  │        (or let next search handle stale data)
  │
  └─ Manual rebuild via CLI: `openclaw docrag rebuild-fts`
```

---

## 4. Configuration

### 4.1 New Config Section

Added under the existing config schema, with defaults that preserve current behavior:

```json5
{
  "retrieval": {
    "hybrid": {
      "enabled": false,           // Master toggle (default: OFF — vector-only)
      "k": 60,                    // RRF constant (default 60, from original paper)
      "candidateMultiplier": 3,   // Fetch limit * multiplier candidates per retriever
      "ftsOptions": {
        "baseTokenizer": "simple",
        "language": "English",
        "stem": true,
        "removeStopWords": true,
        "lowercase": true,
        "asciiFolding": true,
        "withPosition": true
      }
    }
  }
}
```

### 4.2 Config Schema Addition (`config.ts`)

```typescript
export const HybridFtsOptionsSchema = Type.Object({
  baseTokenizer: Type.Optional(
    Type.String({ description: "FTS tokenizer", default: "simple" }),
  ),
  language: Type.Optional(
    Type.String({ description: "Language for stemming/stop words", default: "English" }),
  ),
  stem: Type.Optional(
    Type.Boolean({ description: "Apply stemming", default: true }),
  ),
  removeStopWords: Type.Optional(
    Type.Boolean({ description: "Remove stop words", default: true }),
  ),
  lowercase: Type.Optional(
    Type.Boolean({ description: "Lowercase tokens", default: true }),
  ),
  asciiFolding: Type.Optional(
    Type.Boolean({ description: "Fold accented chars to ASCII", default: true }),
  ),
  withPosition: Type.Optional(
    Type.Boolean({ description: "Store positions for phrase queries", default: true }),
  ),
});

export const HybridConfigSchema = Type.Object({
  enabled: Type.Optional(
    Type.Boolean({ description: "Enable hybrid search (vector + FTS + RRF)", default: false }),
  ),
  k: Type.Optional(
    Type.Number({ description: "RRF constant (default 60)", default: 60 }),
  ),
  candidateMultiplier: Type.Optional(
    Type.Number({ description: "Candidate multiplier per retriever", default: 3 }),
  ),
  ftsOptions: Type.Optional(HybridFtsOptionsSchema),
});

export const RetrievalConfigSchema = Type.Object({
  hybrid: Type.Optional(HybridConfigSchema),
});
```

### 4.3 Resolved Config Interface

```typescript
export interface DocRagConfig {
  // ... existing fields ...
  retrieval: {
    hybrid: {
      enabled: boolean;            // default: false
      k: number;                   // default: 60
      candidateMultiplier: number; // default: 3
      ftsOptions: {
        baseTokenizer: string;     // default: "simple"
        language: string;          // default: "English"
        stem: boolean;             // default: true
        removeStopWords: boolean;  // default: true
        lowercase: boolean;        // default: true
        asciiFolding: boolean;     // default: true
        withPosition: boolean;     // default: true
      };
    };
  };
}
```

---

## 5. Data Model Changes

### 5.1 New Index on `doc_chunks` Table

| Change | Details |
|--------|---------|
| New FTS index | On `text` column of `doc_chunks` table |
| Index type | LanceDB FTS (Tantivy-based BM25) |
| Index name | `text_idx` (default naming convention) |
| Creation | Lazy — created on first hybrid search, rebuilt after ingestion |
| Size estimate | ~50-100MB for 25K chunks |

### 5.2 No Schema Changes

The existing `doc_chunks` table schema is sufficient. No new columns needed. The FTS index is a secondary index on the existing `text` column.

### 5.3 No Changes to `doc_meta` Table

The metadata table is unaffected.

---

## 6. Implementation Phases

Each phase follows **test-driven development**: tests are written **before or alongside** the implementation. Every phase ends with `npx tsx tests/validate-hybrid.ts` and iteration until green. The test harness is designed to be **incrementally runnable** — early tests run even before later phases are implemented (later tests are skipped gracefully).

### Phase 1: Test Harness Scaffold + Config Schema
**Files:** `tests/validate-hybrid.ts`, `tests/fixtures/generate-hybrid.ts`, `config.ts`

- [ ] **Write test scaffold first** (`tests/validate-hybrid.ts`):
  - Runner framework with pass/fail/skip reporting and exit code
  - Isolated temp directory lifecycle (create on start, delete on exit via `finally`)
  - Helper to create DocStore + DocRagPipeline with test config
  - Helper to generate embeddings (uses real OpenAI — same as MVP tests)
  - Placeholder test cases for all 25 tests (marked `SKIP` until implementation exists)
- [ ] **Write fixture generator** (`tests/fixtures/generate-hybrid.ts`):
  - Invoice PDF with exact numbers: `INV-2026-0342`, `$14,750.00`, `2026-01-15`
  - Personnel PDF with names: `Dr. Elena Martinez`, `Department: NEURO-4421`
  - Legal DOCX with section references: `Section 4.2.1`, `Article VII`
  - Short-text document (2 sentences, ~30 words — edge case)
  - Long-text document (50+ pages, 200+ chunks — stress test)
  - Unicode document with accented names: `José García`, `Müller GmbH`, `日本語テスト`
- [ ] **Implement config extension** (`config.ts`):
  - Add `RetrievalConfigSchema`, `HybridConfigSchema`, `HybridFtsOptionsSchema`
  - Add `retrieval` field to `DocRagConfigSchema` and `DocRagConfig` interface
  - Implement parsing with defaults (`enabled: false`, `k: 60`, etc.)
- [ ] **Write and run config tests** (tests 1–2):
  - Test 1: Config parses with no `retrieval` section → defaults applied, `enabled: false`
  - Test 2: Config parses with full `retrieval.hybrid` section → all values respected
- [ ] **Run:** `npx tsx tests/validate-hybrid.ts` → tests 1–2 pass, rest skipped
- [ ] **Also run MVP tests** to confirm no config regression: `npx tsx tests/validate.ts` → all 30 green

### Phase 2: FTS Index Management + Unit Tests
**File:** `store.ts`

- [ ] **Write FTS index lifecycle tests first** (tests 3–6):
  - Test 3: `ensureFtsIndex()` creates index on `text` column when none exists
  - Test 4: `rebuildFtsIndex()` replaces existing index without error
  - Test 5: `dropFtsIndex()` removes the index; `listIndices()` confirms absence
  - Test 6: `ensureFtsIndex()` on empty table (0 chunks) → succeeds without crash
- [ ] **Implement FTS index management** in `store.ts`:
  - Add `private ftsIndexCreated: boolean = false` flag
  - Add `private rrfReranker: InstanceType<typeof rerankers.RRFReranker> | null = null`
  - Implement `ensureFtsIndex(ftsOptions)`:
    - Check `this.ftsIndexCreated` fast path
    - Check `chunksTable.listIndices()` for existing FTS index
    - If not found: `chunksTable.createIndex("text", { config: Index.fts(ftsOptions) })`
    - Set `this.ftsIndexCreated = true`
  - Implement `rebuildFtsIndex(ftsOptions)`:
    - `chunksTable.createIndex("text", { config: Index.fts(ftsOptions), replace: true })`
  - Implement `dropFtsIndex()`:
    - `chunksTable.dropIndex("text_idx")`
    - Set `this.ftsIndexCreated = false`
- [ ] **Run:** `npx tsx tests/validate-hybrid.ts` → tests 1–6 pass

### Phase 3: Hybrid Search Method + Core Tests
**File:** `store.ts`

- [ ] **Write hybrid search core tests first** (tests 7–10):
  - Test 7: Hybrid search for exact invoice number → found in results
  - Test 8: Hybrid search for semantic paraphrase → found in results
  - Test 9: Hybrid search returns empty array for unrelated query → no crash
  - Test 10: Hybrid search with empty queryText → falls back to vector-only
- [ ] **Implement `hybridSearchChunks()`** in `store.ts`:
  ```typescript
  async hybridSearchChunks(
    vector: number[],
    queryText: string,
    limit: number,
    options?: {
      docId?: string;
      tags?: string[];
      minScore?: number;
      k?: number;
      candidateMultiplier?: number;
      ftsOptions?: FtsOptionsConfig;
    },
  ): Promise<ChunkSearchResult[]>
  ```
  - Lazy FTS index creation via `ensureFtsIndex()`
  - Cached `RRFReranker` via `getOrCreateReranker(k)`
  - Build WHERE clause (same pattern as `searchChunks()`)
  - Execute: `.vectorSearch(vector).fullTextSearch(queryText, { columns: "text" }).where(clause).rerank(rrfReranker).limit(limit).toArray()`
  - Map `_relevance_score` (or equivalent) → `ChunkSearchResult[]`
  - Fallback: if queryText is empty/whitespace, delegate to `searchChunks()`
  - Fallback: catch FTS errors → log warning, delegate to `searchChunks()`
- [ ] **Run:** `npx tsx tests/validate-hybrid.ts` → tests 1–10 pass

### Phase 4: Pipeline Wiring + Integration Tests
**File:** `pipeline.ts`

- [ ] **Write integration tests first** (tests 11–14):
  - Test 11: Full pipeline — ingest invoice doc → hybrid query for exact invoice number → correct doc returned
  - Test 12: Full pipeline — ingest legal doc → hybrid query for section reference → found
  - Test 13: Full pipeline — ingest two docs with different tags → hybrid query with tag filter → only matching doc returned
  - Test 14: Full pipeline — ingest doc → hybrid query with docId filter → results only from that doc
- [ ] **Wire hybrid search into `pipeline.ts`**:
  - Branch `query()` on `this.config.retrieval.hybrid.enabled`
  - Pass raw `query` text alongside `queryVector` to `hybridSearchChunks()`
  - After `ingest()` succeeds: rebuild FTS index if hybrid enabled
  - After `delete()` succeeds: rebuild FTS index if hybrid enabled
- [ ] **Run:** `npx tsx tests/validate-hybrid.ts` → tests 1–14 pass

### Phase 5: Regression, Edge Cases, and Performance Tests

- [ ] **Write regression tests** (tests 15–16):
  - Test 15: With `hybrid.enabled: false`, vector-only search returns identical results to `searchChunks()` — scores compared numerically
  - Test 16: With `hybrid.enabled: false`, no FTS index is ever created — verify via `listIndices()`
- [ ] **Write edge case tests** (tests 17–20):
  - Test 17: Special characters in query (`"section (4.2) 'liability' & damages / costs"`) → no crash, returns results
  - Test 18: Unicode query (`"José García recommendations"`) → matches chunk with that name
  - Test 19: Very long query (500+ characters) → completes within 10s, returns results
  - Test 20: Short-text document (2 sentences, ~30 words) → hybrid search still returns it when relevant
- [ ] **Write FTS lifecycle tests** (tests 21–23):
  - Test 21: Ingest doc A → enable hybrid → query doc A → works (lazy FTS index created)
  - Test 22: Ingest doc A → enable hybrid → query → works → ingest doc B → query doc B → works (FTS rebuild captures new data)
  - Test 23: Simulate FTS index failure (drop index mid-test) → hybrid query falls back to vector-only → no crash, results still returned
- [ ] **Write performance tests** (tests 24–25):
  - Test 24: Ingest 5 docs (~50 chunks) → measure vector-only latency vs hybrid latency → hybrid ≤ 3x vector-only
  - Test 25: Hybrid search with large limit (50) → completes within 5s
- [ ] **Run:** `npx tsx tests/validate-hybrid.ts` → all 25 tests pass
- [ ] **Run MVP regression:** `npx tsx tests/validate.ts` → all 30 original tests still pass

### Phase 6: Controlled Cutover (gateway integration)

| Step | Action | Risk | Rollback |
|------|--------|------|----------|
| 1 | All 25 hybrid tests pass + all 30 MVP tests pass | None | N/A |
| 2 | Back up production plugin: `cp -r ~/.openclaw/extensions/doc-rag/ ~/backup-doc-rag/` | None | N/A |
| 3 | Copy modified files to `~/.openclaw/extensions/doc-rag/` | Low | Restore from backup |
| 4 | Add `retrieval.hybrid.enabled: false` to config | None | Remove the line |
| 5 | Restart gateway — verify no regression (hybrid still off) | Very Low | Restore old files, restart |
| 6 | Run quick smoke test via Telegram: upload doc, query → same behavior as before | Very Low | Restore + restart |
| 7 | Set `retrieval.hybrid.enabled: true` in config | Medium | Set `false`, restart |
| 8 | Restart gateway — hybrid search active | Medium | Set `false`, restart (< 30s) |
| 9 | Manual Telegram test: query exact terms, names, numbers | Live | Set `false`, restart |
| 10 | Confirm improvement → leave enabled | Production | Set `false`, restart if issues |

---

## 7. Standalone Test Harness

### 7.1 Design

The test harness (`tests/validate-hybrid.ts`) follows the **exact same pattern** as the MVP's `tests/validate.ts`:

```bash
# Run from the plugin directory — no gateway needed
cd /home/clawdbot/clawd/extensions/doc-rag
npx tsx tests/validate-hybrid.ts
```

The harness:
- **Imports modules directly** (store, pipeline, config) — **not** via the plugin API
- Creates its **own LanceDB instance** and embedding client in an **isolated temp directory**
- Generates all fixture documents **programmatically** (no binary files in repo)
- Runs **25 test cases** with clear pass/fail/skip output
- **Exit code 0** = all pass, **exit code 1** = any failures
- Cleans up temp directory on exit (including on failure, via `finally` block)

### 7.2 Test Runner Framework

```typescript
// tests/validate-hybrid.ts

interface TestCase {
  id: number;
  name: string;
  category: "config" | "fts-index" | "hybrid-core" | "integration" | "regression" | "edge-case" | "lifecycle" | "performance";
  phase: number;       // Minimum phase that must be implemented for this test to run
  fn: () => Promise<void>;
}

const results: { id: number; name: string; status: "PASS" | "FAIL" | "SKIP"; error?: string; durationMs: number }[] = [];

async function runTests(cases: TestCase[]) {
  for (const tc of cases) {
    const start = Date.now();
    try {
      await tc.fn();
      results.push({ id: tc.id, name: tc.name, status: "PASS", durationMs: Date.now() - start });
      console.log(`  ✅ #${tc.id} ${tc.name} (${Date.now() - start}ms)`);
    } catch (err: any) {
      if (err.message === "SKIP") {
        results.push({ id: tc.id, name: tc.name, status: "SKIP", durationMs: 0 });
        console.log(`  ⏭️  #${tc.id} ${tc.name} (skipped)`);
      } else {
        results.push({ id: tc.id, name: tc.name, status: "FAIL", error: err.message, durationMs: Date.now() - start });
        console.error(`  ❌ #${tc.id} ${tc.name}: ${err.message}`);
      }
    }
  }

  // Summary
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped / ${results.length} total`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(`  ❌ #${r.id} ${r.name}: ${r.error}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}
```

### 7.3 Isolated Test Environment

```typescript
// Created fresh for each test run
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "docrag-hybrid-test-"));
const testDbPath = path.join(testDir, "lancedb");
const testUploadsDir = path.join(testDir, "uploads");
const testFixturesDir = path.join(testDir, "fixtures");

// Cleaned up on exit
try {
  await runTests(allTests);
} finally {
  await fs.rm(testDir, { recursive: true, force: true });
}
```

### 7.4 Test Helpers

```typescript
/** Create a pipeline with hybrid enabled or disabled */
function createTestPipeline(opts: { hybridEnabled: boolean; k?: number }): DocRagPipeline {
  const config: DocRagConfig = {
    ...baseTestConfig,
    retrieval: {
      hybrid: {
        enabled: opts.hybridEnabled,
        k: opts.k ?? 60,
        candidateMultiplier: 3,
        ftsOptions: {
          baseTokenizer: "simple",
          language: "English",
          stem: true,
          removeStopWords: true,
          lowercase: true,
          asciiFolding: true,
          withPosition: true,
        },
      },
    },
  };
  const store = new DocStore(testDbPath, embProvider.dim);
  return new DocRagPipeline(store, embProvider, config, testUploadsDir);
}

/** Assert that results contain a chunk with the given substring */
function assertContainsText(results: QueryResultItem[], text: string, msg?: string) {
  const found = results.some(r => r.text.includes(text));
  if (!found) throw new Error(msg ?? `Expected results to contain "${text}" but it was not found`);
}

/** Assert that all results come from the given docId */
function assertAllFromDoc(results: QueryResultItem[], docId: string) {
  const foreign = results.filter(r => r.docId !== docId);
  if (foreign.length > 0) throw new Error(`Expected all results from doc ${docId}, found ${foreign.length} from other docs`);
}
```

---

## 8. Test Cases (25 Cases)

### Category A: Config Parsing (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 1 | **Config defaults** — Parse config with no `retrieval` section → `retrieval.hybrid.enabled` is `false`, `k` is `60`, all FTS options have defaults | 1 | Backward-compatible config; zero-impact default |
| 2 | **Config custom values** — Parse config with `retrieval.hybrid: { enabled: true, k: 80, candidateMultiplier: 5 }` → all values correctly resolved | 1 | Custom config honored |

### Category B: FTS Index Lifecycle (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 3 | **FTS index creation** — Add 10 chunks to table → `ensureFtsIndex()` → `listIndices()` shows FTS index on `text` column | 2 | Index.fts() works on our schema |
| 4 | **FTS index rebuild** — Create index → add more chunks → `rebuildFtsIndex()` → no error; index listed | 2 | Replace-mode rebuild is safe |
| 5 | **FTS index drop** — Create index → `dropFtsIndex()` → `listIndices()` shows no FTS index | 2 | Clean removal |
| 6 | **FTS index on empty table** — Table with 0 chunks → `ensureFtsIndex()` → succeeds without crash | 2 | Empty-table edge case |

### Category C: Hybrid Search Core (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 7 | **Exact term match** — Ingest invoice doc containing "INV-2026-0342" → hybrid search for "INV-2026-0342" → result found; chunk text includes the invoice number | 3 | BM25 finds exact keywords that embeddings miss |
| 8 | **Semantic paraphrase match** — Ingest doc about "liability and duties" → hybrid search for "responsibility and obligation" → result found | 3 | Vector search still contributes to hybrid results |
| 9 | **No match returns empty** — Hybrid search for "xylophone quantum marshmallow" → empty results array, no crash | 3 | Graceful handling of zero results |
| 10 | **Empty query text fallback** — `hybridSearchChunks(vector, "", 5)` → falls back to vector-only search → returns results (non-empty) | 3 | Empty string doesn't break FTS; graceful degradation |

### Category D: Pipeline Integration (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 11 | **End-to-end ingest + hybrid query (exact)** — `pipeline.ingest(invoiceDoc)` → `pipeline.query({ query: "INV-2026-0342" })` → result from invoice doc | 4 | Full pipeline wiring; FTS index rebuilt after ingest |
| 12 | **End-to-end ingest + hybrid query (section ref)** — `pipeline.ingest(legalDoc)` → `pipeline.query({ query: "Section 4.2.1" })` → result from legal doc | 4 | Structured references found via BM25 |
| 13 | **Tag filtering with hybrid** — Ingest doc A (tags: `["finance"]`) and doc B (tags: `["legal"]`) → hybrid query with `tags: ["legal"]` → results only from doc B | 4 | WHERE clause works with hybrid chain |
| 14 | **DocId filtering with hybrid** — Ingest docs A and B → hybrid query with `docId: A.id` → all results from doc A only | 4 | docId filter compatible with hybrid |

### Category E: Regression Tests (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 15 | **Disabled = identical to vector-only** — Ingest doc → query with `hybrid.enabled: false` → query with direct `searchChunks()` → **both return identical docIds and scores** (numeric comparison, ε=0.001) | 5 | Zero regression when disabled |
| 16 | **Disabled = no FTS index created** — Full ingest + query cycle with `hybrid.enabled: false` → `listIndices()` shows **no** FTS index on `text` column | 5 | No side effects when disabled |

### Category F: Edge Cases (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 17 | **Special characters** — Query `"section (4.2) 'liability' & damages / costs [ref:7]"` → no crash; returns relevant results if matching doc exists | 5 | FTS parser handles punctuation/special chars |
| 18 | **Unicode and accented characters** — Ingest doc with "José García" and "Müller GmbH" → hybrid query "José García" → found; query "Mueller" → found if asciiFolding enabled | 5 | Unicode handling; ASCII folding works |
| 19 | **Very long query** — Query with 500+ characters (long paragraph) → completes within 10 seconds → no OOM or timeout | 5 | No pathological behavior on long input |
| 20 | **Very short document** — Ingest doc with only 2 sentences (~30 words, 1 chunk) → hybrid query → that chunk is returned when relevant | 5 | Small documents aren't lost in ranking |

### Category G: FTS Lifecycle & Recovery (3 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 21 | **Lazy index creation** — Ingest 3 docs with hybrid disabled → enable hybrid → first query triggers FTS index creation → returns results | 5 | FTS index built on-demand for existing data |
| 22 | **Index incorporates new data** — Enable hybrid → ingest doc A → query A → found → ingest doc B → query B → found (FTS rebuilt after ingest) | 5 | New data is searchable after ingest |
| 23 | **Graceful fallback on FTS failure** — Drop FTS index mid-test → hybrid query → falls back to vector-only → still returns results (with log warning) | 5 | System degrades gracefully, not catastrophically |

### Category H: Performance (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 24 | **Latency comparison** — Ingest 5 docs (~50 chunks) → time 10 vector-only queries → time 10 hybrid queries → hybrid avg latency ≤ 3× vector-only avg | 5 | Acceptable performance overhead |
| 25 | **Large limit** — Hybrid query with `limit: 50` on ~50 chunks → completes within 5 seconds → returns up to 50 results | 5 | No degradation with high limit values |

### 8.1 Fixture Documents

Generated programmatically in `tests/fixtures/generate-hybrid.ts` (same pattern as MVP's `generate.ts` — no binary files in repo):

| Fixture | Format | Content | Purpose |
|---------|--------|---------|---------|
| `test-invoice.pdf` | PDF (`pdf-lib`) | 2-page invoice: "Invoice #INV-2026-0342", "$14,750.00", "Due: 2026-02-15", payee "Acme Corp", line items with product codes | Exact keyword/number search |
| `test-personnel.pdf` | PDF (`pdf-lib`) | 3-page personnel report: "Dr. Elena Martinez, Dept: NEURO-4421", "Dr. James Chen, Dept: CARDIO-1187", performance ratings | Name and code search |
| `test-legal.docx` | DOCX (`docx`) | 5-page contract: "Section 4.2.1 Limitation of Liability", "Article VII Termination", specific clause numbers | Section reference search |
| `test-short.pdf` | PDF (`pdf-lib`) | 1 page, 2 sentences: "The quick brown fox. Meeting at 3pm on Tuesday." (~30 words) | Short-document edge case |
| `test-long.pdf` | PDF (`pdf-lib`) | 50 pages of generated technical content (repeated blocks with unique identifiers per page) | Stress test / performance |
| `test-unicode.pdf` | PDF (`pdf-lib`) | 2 pages: "Report by José García and Heinrich Müller GmbH. Client: 田中太郎. Budget: €50,000." | Unicode / accent handling |

**Also reuses MVP fixtures** (financial report, legal doc, spreadsheet, presentation) for integration and regression tests.

---

## 9. Failover & Recovery

### 9.1 FTS Index Corruption

**Detection:** Hybrid search throws an error during `fullTextSearch()` execution.

**Recovery:**
```typescript
// In hybridSearchChunks(), catch FTS errors:
try {
  results = await hybridQuery.toArray();
} catch (err) {
  console.error(`[doc-rag] Hybrid search failed, falling back to vector-only: ${err}`);
  // Fall back to vector-only search
  results = await this.searchChunks(vector, limit, options);
  // Schedule FTS index rebuild
  this.ftsIndexCreated = false;
}
```

### 9.2 FTS Index Missing

If the FTS index doesn't exist (first run, or after manual cleanup):
- `ensureFtsIndex()` checks `listIndices()` and creates if needed
- Transparent to the user — first query may be slightly slower

### 9.3 Manual Index Rebuild

Via CLI (to be added):
```bash
openclaw docrag rebuild-fts
```

Via agent:
```
"Rebuild the FTS index for doc-rag"
→ Agent calls pipeline method to rebuild
```

### 9.4 Complete Recovery

If all else fails:
1. Set `retrieval.hybrid.enabled: false` in config
2. Restart gateway (< 30 seconds)
3. System reverts to vector-only search
4. Investigate and fix at leisure
5. Re-enable when ready

---

## 10. Rollback Strategy

### Instant Rollback (< 30 seconds)

```bash
# 1. Edit config: set retrieval.hybrid.enabled to false
# 2. Restart
sudo supervisorctl restart openclaw
```

**Effect:** All queries immediately use vector-only search. FTS index sits idle on disk.

### Full Rollback (remove all hybrid code)

```bash
# 1. Restore original store.ts, pipeline.ts, config.ts from backup
cp /home/clawdbot/clawd/backup/doc-rag/*.ts ~/.openclaw/extensions/doc-rag/

# 2. Remove config section
# Delete retrieval.hybrid from openclaw.json

# 3. Restart
sudo supervisorctl restart openclaw

# 4. Optional: drop FTS index (it's inert, but clean up disk)
# This can be done later via the store
```

---

## 11. Validation & Pass/Fail Criteria

### 11.1 Automated Validation

The implementation is considered **ready for cutover** when both test suites pass:

```bash
# Hybrid search tests (25 tests)
cd /home/clawdbot/clawd/extensions/doc-rag
npx tsx tests/validate-hybrid.ts
# Expected: 25 passed, 0 failed, 0 skipped
# Exit code: 0

# MVP regression tests (30 tests)  
npx tsx tests/validate.ts
# Expected: 30 passed, 0 failed, 0 skipped
# Exit code: 0
```

**Gate rule:** Both exit code 0 before ANY production files are touched.

### 11.2 Pass Criteria (all must be checked)

**Test harness:**
- [ ] All 25 hybrid search tests pass (`validate-hybrid.ts` exits 0)
- [ ] All 30 MVP tests pass (`validate.ts` exits 0) — confirms zero regression
- [ ] Test harness runs fully standalone — no gateway, no production data
- [ ] Test harness cleans up temp directories on exit (including on failure)
- [ ] Test harness produces clear, machine-parseable output (test #, name, PASS/FAIL, duration)

**Functional correctness:**
- [ ] Exact term queries (invoice numbers, names, codes) return correct results via hybrid
- [ ] Semantic queries (paraphrases, synonyms) maintain same or better quality vs vector-only
- [ ] Tag filtering works correctly with hybrid search — no tag leakage
- [ ] DocId filtering works correctly with hybrid search
- [ ] Empty/irrelevant queries return empty array, no crash

**Configuration:**
- [ ] `retrieval.hybrid.enabled: false` → pure vector-only behavior, identical scores to current system
- [ ] `retrieval.hybrid.enabled: false` → no FTS index created (verified via `listIndices()`)
- [ ] `retrieval.hybrid.enabled: true` → hybrid search active with RRF fusion
- [ ] All FTS options configurable (`stem`, `removeStopWords`, `language`, etc.)
- [ ] Config with no `retrieval` section → defaults applied, no crash

**Resilience:**
- [ ] FTS index failure → graceful fallback to vector-only with error log
- [ ] FTS index missing → lazy creation on first hybrid query
- [ ] FTS index rebuilt after each `doc_ingest` when hybrid enabled
- [ ] Special characters, unicode, and very long queries handled without crash

**Performance:**
- [ ] Hybrid search latency ≤ 3× vector-only for ~50 chunks
- [ ] Large limit (50) completes within 5 seconds

**Environment safety:**
- [ ] Rollback to vector-only achievable in < 30 seconds (disable + restart)
- [ ] No production data touched during development
- [ ] Production backup taken before cutover

### 11.3 Fail Criteria (any one blocks cutover)

- ❌ Any hybrid test fails
- ❌ Any MVP regression test fails after code changes
- ❌ Hybrid search throws unhandled exception for any valid input
- ❌ `enabled: false` produces different results than current production
- ❌ Tag/docId filtering leaks results from wrong documents
- ❌ FTS index failure causes query to throw instead of falling back
- ❌ Hybrid latency > 5× vector-only for same dataset

---

## 12. Development Order (Test-Driven)

All development happens in `/home/clawdbot/clawd/extensions/doc-rag/` (see Section 2 — Development Isolation Strategy). The live gateway is **never touched** until Step 18. Each implementation step is immediately followed by a test step. The agent runs `npx tsx tests/validate-hybrid.ts` after every change and iterates until green.

### Phase 1: Scaffold + Config (Steps 1–5)

```
 1. Copy current production plugin to dev workspace:
    cp -r ~/.openclaw/extensions/doc-rag/ /home/clawdbot/clawd/extensions/doc-rag/

 2. Write test harness scaffold (tests/validate-hybrid.ts):
    - Runner framework with pass/fail/skip reporting
    - Isolated temp directory lifecycle (mkdtemp + rm in finally)
    - Helpers: createTestPipeline(), assertContainsText(), assertAllFromDoc()
    - All 25 test cases as stubs (marked SKIP)
    - Exit code 0 = all pass/skip, 1 = any fail

 3. Write fixture generator (tests/fixtures/generate-hybrid.ts):
    - Invoice PDF, Personnel PDF, Legal DOCX, Short PDF, Long PDF, Unicode PDF
    - All generated programmatically with pdf-lib, docx (dev deps already installed)

 4. Implement config extension (config.ts):
    - Add RetrievalConfigSchema, HybridConfigSchema, HybridFtsOptionsSchema
    - Add retrieval section to DocRagConfig interface + parse function
    - Defaults: enabled=false, k=60, candidateMultiplier=3

 5. UN-SKIP config tests (#1, #2) → run validate-hybrid → fix → green
    - Test #1: Config defaults (no retrieval section → enabled=false, k=60)
    - Test #2: Config custom values parsed correctly
    ALSO run MVP regression: npx tsx tests/validate.ts → all 30 still green
```

### Phase 2: FTS Index Management (Steps 6–8)

```
 6. UN-SKIP FTS index tests (#3, #4, #5, #6) as stubs that will fail:
    - These tests exercise ensureFtsIndex, rebuildFtsIndex, dropFtsIndex
    - Run validate-hybrid → tests 1-2 pass, 3-6 FAIL, 7-25 SKIP

 7. Implement FTS index methods in store.ts:
    - Import Index, rerankers from @lancedb/lancedb
    - Add ftsIndexCreated flag + rrfReranker cache
    - ensureFtsIndex(ftsOptions): check listIndices(), create if missing
    - rebuildFtsIndex(ftsOptions): createIndex with replace=true
    - dropFtsIndex(): dropIndex("text_idx"), reset flag

 8. Run validate-hybrid → tests 1-6 pass, 7-25 SKIP
    Fix any failures, iterate until 1-6 green
```

### Phase 3: Hybrid Search Method (Steps 9–11)

```
 9. UN-SKIP hybrid core tests (#7, #8, #9, #10):
    - These tests call hybridSearchChunks() directly on the store
    - Run validate-hybrid → tests 1-6 pass, 7-10 FAIL, 11-25 SKIP

10. Implement hybridSearchChunks() in store.ts:
    - Lazy FTS index creation via ensureFtsIndex()
    - Cached RRFReranker via getOrCreateReranker(k)
    - WHERE clause builder (same as searchChunks)
    - Hybrid query: .vectorSearch().fullTextSearch().where().rerank().limit().toArray()
    - Score mapping from _relevance_score (or fallback)
    - Fallback: empty queryText → delegate to searchChunks()
    - Fallback: catch FTS errors → log, delegate to searchChunks()

11. Run validate-hybrid → tests 1-10 pass, 11-25 SKIP
    Fix any failures, iterate until 1-10 green
```

### Phase 4: Pipeline Wiring (Steps 12–14)

```
12. UN-SKIP integration tests (#11, #12, #13, #14):
    - These call pipeline.ingest() then pipeline.query() with hybrid enabled
    - Run validate-hybrid → tests 1-10 pass, 11-14 FAIL, 15-25 SKIP

13. Wire hybrid search into pipeline.ts:
    - Branch query() on config.retrieval.hybrid.enabled
    - Pass raw queryText to hybridSearchChunks()
    - After ingest(): rebuildFtsIndex() if hybrid enabled
    - After delete(): rebuildFtsIndex() if hybrid enabled

14. Run validate-hybrid → tests 1-14 pass, 15-25 SKIP
    Fix any failures, iterate until 1-14 green
```

### Phase 5: Regression + Edge Cases + Performance (Steps 15–17)

```
15. UN-SKIP all remaining tests (#15-#25):
    - Regression: #15, #16 (disabled mode identical to vector-only)
    - Edge cases: #17, #18, #19, #20 (special chars, unicode, long query, short doc)
    - FTS lifecycle: #21, #22, #23 (lazy create, rebuild, fallback)
    - Performance: #24, #25 (latency comparison, large limit)
    - Run validate-hybrid → some may fail

16. Fix all failures, iterate until tests 1-25 all green:
    - This may require adjustments to score mapping, error handling, edge case guards
    - Performance test #24 may require tuning candidateMultiplier

17. FINAL VALIDATION — both suites must pass:
    a. npx tsx tests/validate-hybrid.ts → 25 passed, 0 failed, 0 skipped (exit 0)
    b. npx tsx tests/validate.ts         → 30 passed, 0 failed, 0 skipped (exit 0)
    Both exit codes must be 0 before proceeding to cutover
```

### Phase 6: Controlled Cutover (Steps 18–23)

```
18. Back up production plugin:
    cp -r ~/.openclaw/extensions/doc-rag/ ~/backup-doc-rag-pre-hybrid/

19. Copy modified files to production:
    cp store.ts pipeline.ts config.ts types.ts → ~/.openclaw/extensions/doc-rag/

20. Add retrieval.hybrid config to openclaw.json (enabled: false)
    Restart gateway → verify no regression via Telegram (quick smoke test)

21. Set retrieval.hybrid.enabled: true in config
    Restart gateway → hybrid search active

22. Manual Telegram tests:
    - Upload an invoice → query for the invoice number → verify exact match
    - Query a semantic question → verify relevant results
    - Query with tags → verify filtering works

23. Confirm working → leave enabled in production
    If any issues: set enabled: false, restart (< 30 seconds)
```

---

## 13. File Diff Summary

### `config.ts` — Additions

```diff
+ // New schemas
+ export const HybridFtsOptionsSchema = Type.Object({ ... });
+ export const HybridConfigSchema = Type.Object({ ... });
+ export const RetrievalConfigSchema = Type.Object({ ... });

  // DocRagConfigSchema — add retrieval field
+ retrieval: Type.Optional(RetrievalConfigSchema),

  // DocRagConfig interface — add retrieval section
+ retrieval: {
+   hybrid: {
+     enabled: boolean;
+     k: number;
+     candidateMultiplier: number;
+     ftsOptions: { ... };
+   };
+ };

  // Config parser — add retrieval parsing
+ const retRaw = obj(cfg.retrieval);
+ const hybRaw = obj(retRaw.hybrid);
+ const ftsRaw = obj(hybRaw.ftsOptions);
```

### `store.ts` — Additions

```diff
+ import { Index, rerankers } from "@lancedb/lancedb";
+ import type { FtsOptions } from "@lancedb/lancedb/dist/indices";

  class DocStore {
+   private ftsIndexCreated = false;
+   private rrfReranker: InstanceType<typeof rerankers.RRFReranker> | null = null;

+   async ensureFtsIndex(ftsOptions?: Partial<FtsOptions>): Promise<void> { ... }
+   async rebuildFtsIndex(ftsOptions?: Partial<FtsOptions>): Promise<void> { ... }
+   async dropFtsIndex(): Promise<void> { ... }

+   async hybridSearchChunks(
+     vector: number[],
+     queryText: string,
+     limit: number,
+     options?: { ... },
+   ): Promise<ChunkSearchResult[]> { ... }
  }
```

### `pipeline.ts` — Modifications

```diff
  async query(params: QueryParams): Promise<QueryResult> {
    const queryVector = await this.embeddings.embed(query);
    
-   const searchResults = await this.store.searchChunks(queryVector, limit, { ... });
+   let searchResults: ChunkSearchResult[];
+   if (this.config.retrieval.hybrid.enabled) {
+     searchResults = await this.store.hybridSearchChunks(
+       queryVector, query, limit, { ... }
+     );
+   } else {
+     searchResults = await this.store.searchChunks(queryVector, limit, { ... });
+   }

  async ingest(params: IngestParams): Promise<IngestResult> {
    // ... existing code ...
+   // Rebuild FTS index after ingestion
+   if (this.config.retrieval.hybrid.enabled) {
+     await this.store.rebuildFtsIndex(this.config.retrieval.hybrid.ftsOptions);
+   }
```

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FTS index creation slow on large dataset | Medium | Lazy creation (first query), async rebuild after ingest |
| FTS index stale after ingestion | Low | Rebuild after each ingest; un-indexed data still searched without `fastSearch()` |
| RRF scores not comparable to vector-only scores | Low | Document that score range changes when hybrid enabled; don't compare across modes |
| WHERE clause incompatible with hybrid chain | Medium | Validated in type signatures; test in Phase 5 |
| Memory increase from FTS index | Low | ~50-100MB for 25K chunks; within VPS budget |
| FTS index corrupt after crash | Low | Graceful fallback to vector-only; rebuild on next startup |
| Hybrid slower than vector-only | Medium | Acceptable up to 2x; candidateMultiplier tunable |
| Special characters in query break FTS | Low | Test in Phase 5; LanceDB handles escaping internally |

---

## 15. Future Enhancements (Post Hybrid Search)

- **Weighted hybrid** — add `vectorWeight` / `textWeight` params for linear combination alternative to RRF
- **Query analysis** — auto-detect if query is keyword-heavy or semantic, adjust strategy
- **Per-query hybrid toggle** — allow `doc_query` to accept `searchMode: "vector" | "fts" | "hybrid"` parameter
- **FTS-only search** — expose pure BM25 search as an option for exact lookups
- **Phrase queries** — expose `PhraseQuery` for exact phrase matching
- **Fuzzy matching** — expose `MatchQuery` fuzziness for typo tolerance
- **Multi-column FTS** — index `section` column alongside `text` (when LanceDB supports multi-column)
- **Index health monitoring** — report FTS index staleness in `doc_status`
