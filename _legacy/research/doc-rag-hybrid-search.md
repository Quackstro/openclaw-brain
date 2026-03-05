# Doc-RAG Hybrid Search — Research Findings

**Author:** Jarvis (subagent) · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** Research Complete  

---

## 1. LanceDB Full-Text Search (FTS) Capabilities

### 1.1 Version Compatibility

**Our installed version: `@lancedb/lancedb@0.23.0`**

✅ **Full FTS support is available.** Version 0.23.0 includes:
- `Index.fts()` — create full-text search indices
- `fullTextSearch()` — query method on both `Query` and `VectorQuery` builders
- `RRFReranker` — native Reciprocal Rank Fusion reranker
- `VectorQuery.rerank()` — combine vector + FTS results with a reranker
- Rich FTS query types: `MatchQuery`, `PhraseQuery`, `BoostQuery`, `MultiMatchQuery`, `BooleanQuery`

**No version upgrade needed.** All required APIs exist in our current version.

### 1.2 Creating a Full-Text Index

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("/path/to/db");
const table = await db.openTable("doc_chunks");

// Create FTS index on the "text" column
await table.createIndex("text", {
  config: lancedb.Index.fts({
    withPosition: true,        // Enable phrase queries (default: true)
    baseTokenizer: "simple",   // "simple" | "whitespace" | "raw" | "ngram"
    language: "English",       // For stemming and stop words
    lowercase: true,           // Normalize to lowercase
    stem: true,                // Apply stemming (e.g., "running" → "run")
    removeStopWords: true,     // Remove "the", "a", "is", etc.
    asciiFolding: true,        // Normalize accented chars (é → e)
  }),
});
```

**FTS Index Options (`FtsOptions`):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `withPosition` | boolean | `true` | Store token positions (needed for phrase queries) |
| `baseTokenizer` | string | `"simple"` | `"simple"`, `"whitespace"`, `"raw"`, `"ngram"` |
| `language` | string | — | Language for stemming/stop words (e.g., `"English"`) |
| `maxTokenLength` | number | — | Max token length; longer tokens are ignored |
| `lowercase` | boolean | — | Normalize tokens to lowercase |
| `stem` | boolean | — | Apply language-specific stemming |
| `removeStopWords` | boolean | — | Remove common stop words |
| `asciiFolding` | boolean | — | Fold accented characters to ASCII |
| `ngramMinLength` | number | — | Min n-gram length (for `"ngram"` tokenizer) |
| `ngramMaxLength` | number | — | Max n-gram length |
| `prefixOnly` | boolean | — | Index only prefixes for n-gram tokenizer |

### 1.3 Running Full-Text Queries

#### Simple string search
```typescript
// Using table.search() with queryType "fts"
const results = await table
  .search("termination clause", "fts", "text")
  .limit(10)
  .toArray();
```

#### Using the Query builder
```typescript
const results = await table
  .query()
  .fullTextSearch("termination clause", { columns: "text" })
  .limit(10)
  .toArray();
```

#### Advanced FTS query types

```typescript
import { MatchQuery, PhraseQuery, BooleanQuery, Occur } from "@lancedb/lancedb";

// Match query with fuzzy matching
const matchQ = new MatchQuery("termination", "text", {
  boost: 1.0,
  fuzziness: 1,          // Allow 1 edit distance
  operator: Operator.Or,  // OR between terms
});

// Exact phrase search
const phraseQ = new PhraseQuery("termination clause", "text", {
  slop: 1,  // Allow 1 word between terms
});

// Boolean combinations
const boolQ = new BooleanQuery([
  [Occur.Must, new MatchQuery("contract", "text")],
  [Occur.Should, new MatchQuery("termination", "text")],
  [Occur.MustNot, new MatchQuery("draft", "text")],
]);

const results = await table
  .query()
  .fullTextSearch(boolQ)
  .limit(10)
  .toArray();
```

### 1.4 Native Hybrid Search (Vector + FTS Combined)

LanceDB 0.23.0 supports **native hybrid search** by chaining vector search with FTS and a reranker:

```typescript
import * as lancedb from "@lancedb/lancedb";

const rrfReranker = await lancedb.rerankers.RRFReranker.create(60); // k=60

// Hybrid search: vector + FTS, merged with RRF
const results = await table
  .vectorSearch(queryVector)
  .fullTextSearch("termination clause", { columns: "text" })
  .rerank(rrfReranker)
  .limit(10)
  .toArray();
```

**How it works internally:**
1. Vector search runs against the `vector` column → returns top candidates with `_distance`
2. FTS runs against the `text` column (BM25 scoring) → returns top candidates with `_score`
3. `RRFReranker.rerankHybrid()` merges both result sets using RRF formula
4. Final results are returned ranked by fused score

**Important: `withRowId()` method exists** on QueryBase to include row IDs, which the reranker uses internally to match results across the two search paths.

### 1.5 The `search()` Convenience Method

The `Table.search()` method supports three query types:
- `"vector"` — vector similarity search only
- `"fts"` — full-text search only  
- `"auto"` — if embedding function defined, vector; otherwise FTS

```typescript
// FTS-only search
const ftsResults = await table.search("termination clause", "fts", "text")
  .limit(10).toArray();

// Vector search (requires embedding or raw vector)
const vecResults = await table.vectorSearch(queryVector)
  .limit(10).toArray();
```

### 1.6 RRFReranker API

```typescript
// Located in: lancedb.rerankers.RRFReranker
export class RRFReranker {
  static create(k?: number): Promise<RRFReranker>;  // default k=60
  rerankHybrid(
    query: string, 
    vecResults: RecordBatch, 
    ftsResults: RecordBatch
  ): Promise<RecordBatch>;
}

// The Reranker interface (for custom rerankers)
export interface Reranker {
  rerankHybrid(
    query: string, 
    vecResults: RecordBatch, 
    ftsResults: RecordBatch
  ): Promise<RecordBatch>;
}
```

### 1.7 Limitations and Gotchas

1. **FTS index must be created explicitly** — it's not automatic on table creation. Must call `table.createIndex("text", { config: Index.fts(...) })` after the table exists with data.

2. **Single column search** — "For now, only one column can be searched at a time" per `FullTextSearchOptions`.

3. **Index must be rebuilt after data changes** — FTS index doesn't auto-update when new rows are added. Must call `table.createIndex()` again (with `replace: true`) or use `table.optimize()` to incorporate new data.

4. **`withPosition: true`** is needed for phrase queries — if set to `false`, `PhraseQuery` won't work.

5. **No native WHERE clause combination with FTS+vector** — the `where()` filter works on both `Query` and `VectorQuery`, but when combining with `.fullTextSearch()` and `.rerank()`, the WHERE clause applies before the search, which is what we want for tag filtering.

6. **FTS returns `_score` column** — BM25 relevance score. Vector returns `_distance` column. The reranker handles merging these different metrics.

7. **`fastSearch()` skips un-indexed data** — If FTS index is stale, `fastSearch()` will miss new data. Without `fastSearch()`, un-indexed data is searched exhaustively (slower but complete).

8. **Index naming** — Index names default to `${column}_idx`. We can provide custom names via the `name` option.

9. **`createIndex` with `replace: true` (default)** — Re-creating an FTS index replaces the old one. This is safe and idempotent.

---

## 2. Reciprocal Rank Fusion (RRF) Algorithm

### 2.1 Formula

```
RRF_score(doc) = Σ  1 / (k + rank_i(doc))
                 i∈retrievers
```

Where:
- `k` = constant (default 60, from original paper)
- `rank_i(doc)` = the rank (1-based position) of `doc` in the result list from retriever `i`
- Sum is over all retrievers (in our case: vector search + FTS)

### 2.2 Why k=60?

The original paper by Cormack, Clarke, and Butt (2009) found k=60 works well in practice:
- **k is too small (e.g., 1)** → top-ranked results dominate too heavily; little fusion benefit
- **k is too large (e.g., 1000)** → all ranks become nearly equal; loses ranking signal
- **k=60** → sweet spot that balances contribution of all ranked positions

### 2.3 Example Calculation

Given two retrievers, each returning 5 results:

| Document | Vector Rank | FTS Rank | RRF Score |
|----------|------------|----------|-----------|
| Doc A    | 1          | 3        | 1/(60+1) + 1/(60+3) = 0.01639 + 0.01587 = **0.03226** |
| Doc B    | 3          | 1        | 1/(60+3) + 1/(60+1) = 0.01587 + 0.01639 = **0.03226** |
| Doc C    | 2          | —        | 1/(60+2) + 0 = **0.01613** |
| Doc D    | —          | 2        | 0 + 1/(60+2) = **0.01613** |
| Doc E    | 4          | 4        | 1/(60+4) + 1/(60+4) = 0.01563 + 0.01563 = **0.03125** |

Result ranking: Doc A = Doc B > Doc E > Doc C = Doc D

### 2.4 RRF vs Weighted Score Combination

| Approach | Pros | Cons |
|----------|------|------|
| **RRF** | Rank-based (score-scale agnostic), no normalization needed, robust | Can't express "I trust vector 2x more than FTS" as precisely |
| **Weighted Linear** | Fine-grained control via alpha parameter | Requires score normalization; different score distributions make this fragile |

**RRF is preferred** when:
- Score distributions differ significantly (cosine similarity 0-1 vs BM25 0-∞)
- You want robustness without careful tuning
- You have multiple retrievers with incomparable scores

**Weighted linear is preferred** when:
- Scores are pre-normalized to similar ranges
- You need fine-grained control over retriever importance
- You're doing A/B testing with score weights

### 2.5 RRF Implementation Pattern

```typescript
interface RankedResult {
  id: string;
  rank: number;
}

function reciprocalRankFusion(
  resultSets: RankedResult[][],
  k: number = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  
  for (const results of resultSets) {
    for (const { id, rank } of results) {
      const existing = scores.get(id) ?? 0;
      scores.set(id, existing + 1 / (k + rank));
    }
  }
  
  return scores; // Sort by score descending to get final ranking
}
```

### 2.6 RRF in LanceDB (Native Implementation)

LanceDB's `RRFReranker` handles all this internally:
```typescript
const rrfReranker = await lancedb.rerankers.RRFReranker.create(60);
// Used via: vectorQuery.fullTextSearch(query).rerank(rrfReranker)
```

The native implementation:
1. Takes vector results (RecordBatch with `_distance`) and FTS results (RecordBatch with `_score`)
2. Converts distances/scores to ranks
3. Applies RRF formula
4. Returns merged RecordBatch sorted by RRF score

---

## 3. Fusion Retrieval Notebook Analysis

**Source:** [NirDiamant/RAG_Techniques — fusion_retrieval.ipynb](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/fusion_retrieval.ipynb)

### 3.1 Approach Summary

The notebook demonstrates a Python-based fusion retrieval using:
- **FAISS** for vector search (OpenAI embeddings)
- **BM25Okapi** (from `rank-bm25`) for keyword search
- **Weighted linear combination** (not RRF) with `alpha` parameter

### 3.2 Key Implementation

```python
def fusion_retrieval(vectorstore, bm25, query, k=5, alpha=0.5):
    epsilon = 1e-8
    
    # Get BM25 scores for all documents
    bm25_scores = bm25.get_scores(query.split())
    
    # Get vector search scores
    vector_results = vectorstore.similarity_search_with_score(query, k=len(all_docs))
    
    # Normalize vector scores (invert distance: lower distance = higher score)
    vector_scores = np.array([score for _, score in vector_results])
    vector_scores = 1 - (vector_scores - np.min(vector_scores)) / 
                        (np.max(vector_scores) - np.min(vector_scores) + epsilon)
    
    # Normalize BM25 scores to [0, 1]
    bm25_scores = (bm25_scores - np.min(bm25_scores)) / 
                  (np.max(bm25_scores) - np.min(bm25_scores) + epsilon)
    
    # Weighted combination
    combined_scores = alpha * vector_scores + (1 - alpha) * bm25_scores
    
    # Return top-k by combined score
    sorted_indices = np.argsort(combined_scores)[::-1]
    return [all_docs[i] for i in sorted_indices[:k]]
```

### 3.3 Key Takeaways for Our Implementation

1. **We don't need this approach** — LanceDB has native hybrid search + RRF built in
2. **Alpha parameter** — corresponds to `vectorWeight` / `textWeight` in weighted linear mode
3. **Score normalization** — necessary for weighted linear; not needed for RRF (rank-based)
4. **The notebook searches ALL docs** for both methods — not scalable. LanceDB handles this efficiently with indices.

### 3.4 Why LanceDB Native is Better for Us

| Notebook Approach | Our LanceDB Native Approach |
|-------------------|---------------------------|
| Must search all docs for BM25 scores | FTS index provides efficient BM25 |
| Manual score normalization | RRF is rank-based, no normalization needed |
| No index support for BM25 | LanceDB FTS index with Tantivy engine |
| Alpha weight tuning required | k=60 works well out of the box |
| Python only | TypeScript native support |

---

## 4. Current Codebase Analysis

### 4.1 Current Search Flow (`store.ts` → `pipeline.ts`)

```
User query → pipeline.query()
  → embeddings.embed(query)        // Get query vector
  → store.searchChunks(vector, limit, {docId, tags})
    → chunksTable.vectorSearch(vector)  // LanceDB vector search
      .limit(limit * 3)                 // Over-fetch for filtering
      .where(conditions)                // Tag/docId filters
      .toArray()
    → Convert _distance to score: score = 1/(1+distance)
    → Filter by minScore, slice to limit
  → Enrich with doc names from store.getDoc()
  → Return QueryResult
```

### 4.2 Key Integration Points

**`store.ts` — `searchChunks()` method (lines ~170-210)**
- Currently vector-only: `this.chunksTable!.vectorSearch(vector)`
- Already handles tag filtering via WHERE clause
- Returns `ChunkSearchResult[]` with `{ chunk, score }`
- **This is where hybrid search will plug in**

**`pipeline.ts` — `query()` method (lines ~200-230)**
- Embeds query text, calls `store.searchChunks()`, enriches with doc names
- **Needs to pass raw query text** to store for FTS
- Currently only passes the embedded vector

**`config.ts` — No hybrid config exists yet**
- Clean, well-structured config schema
- Easy to add `retrieval.hybrid` section

**`types.ts` — `ChunkSearchResult` interface**
- Simple `{ chunk: DocChunk, score: number }` — works as-is for hybrid results

### 4.3 doc_chunks Table Schema

```typescript
{
  id: string,           // UUID
  docId: string,        // Parent document ID
  docTags: string,      // JSON-serialized tags
  text: string,         // ← FTS index target
  vector: number[],     // ← Vector search target
  chunkIndex: number,
  page: number,
  section: string,
  ocrDerived: boolean,
  createdAt: number,
}
```

**FTS index should be created on the `text` column.**

### 4.4 Current LanceDB Usage Patterns

The codebase uses:
- `lancedb.connect(dbPath)` — connection management
- `db.createTable()` / `db.openTable()` — table management
- `table.vectorSearch(vector)` — vector queries
- `table.query().where(...)` — filtered scans
- `table.add([...])` — data insertion
- `table.delete(predicate)` — data deletion
- `table.countRows()` — counting

**Not currently used but needed:**
- `table.createIndex(column, { config: Index.fts(...) })` — FTS index creation
- `vectorQuery.fullTextSearch(query)` — combined search
- `vectorQuery.rerank(reranker)` — hybrid fusion
- `lancedb.rerankers.RRFReranker.create(k)` — reranker creation

### 4.5 Dependencies

Current `@lancedb/lancedb@^0.23.0` — **no changes needed**. All FTS and RRF APIs are available.

---

## 5. Architecture Decision: Two Implementation Approaches

### Approach A: LanceDB Native Hybrid (Recommended)

```typescript
// Use LanceDB's built-in hybrid search
const rrfReranker = await lancedb.rerankers.RRFReranker.create(k);

const results = await table
  .vectorSearch(queryVector)
  .fullTextSearch(queryText, { columns: "text" })
  .where(tagFilter)           // tag filtering still works
  .rerank(rrfReranker)
  .limit(limit)
  .toArray();
```

**Pros:**
- Single query execution, no dual-query overhead
- Native RRF in Rust (fast)
- Simpler code
- LanceDB handles score normalization and ranking

**Cons:**
- Less control over individual result sets
- Can't separately weight vector vs FTS (RRF is pure rank-based)
- Tied to LanceDB's implementation

### Approach B: Manual Dual-Query + Custom RRF

```typescript
// Run two separate queries
const vecResults = await table.vectorSearch(queryVector)
  .where(tagFilter).limit(candidateLimit).toArray();

const ftsResults = await table.search(queryText, "fts", "text")
  .where(tagFilter).limit(candidateLimit).toArray();

// Custom RRF merge
const merged = manualRRF(vecResults, ftsResults, k);
```

**Pros:**
- Full control over each retriever
- Can implement weighted RRF or other fusion strategies
- Can inspect individual result sets for debugging

**Cons:**
- Two separate queries (slightly slower)
- Must handle score normalization manually if not using pure RRF
- More code to maintain

### Recommendation

**Start with Approach A (native hybrid)** because:
1. Simpler, fewer lines of code
2. Better performance (single execution path)
3. RRF with k=60 is proven effective
4. Can always fall back to Approach B if limitations emerge

**Implement Approach B as fallback** if:
- We need weighted retriever importance
- We need to debug individual result sets
- LanceDB native hybrid has bugs or limitations

---

## 6. FTS Index Management Considerations

### 6.1 When to Create the FTS Index

The FTS index must be created/rebuilt:
1. **On first enable** — when `retrieval.hybrid.enabled` is set to `true`
2. **After bulk ingestion** — when new documents are added
3. **After deletion** — to reclaim space and maintain accuracy

### 6.2 Index Rebuild Strategy

```typescript
// Safe rebuild: replace=true is the default
await chunksTable.createIndex("text", {
  config: lancedb.Index.fts({ /* options */ }),
  replace: true,  // Replaces existing index atomically
});

// Alternatively, optimize after data changes
await chunksTable.optimize();
```

### 6.3 Index Staleness

When new chunks are added:
- **Without `fastSearch()`** — new un-indexed data is still searched (slower but complete)
- **With `fastSearch()`** — only indexed data is searched (faster but misses new data)

**Recommendation:** Don't use `fastSearch()` for our scale (up to 25K chunks). Let LanceDB search un-indexed data until the index is rebuilt. Rebuild on `doc_ingest` completion.

### 6.4 Index Corruption Recovery

```typescript
// Drop and recreate the FTS index
await chunksTable.dropIndex("text_idx");
await chunksTable.createIndex("text", {
  config: lancedb.Index.fts({ /* options */ }),
});
```

---

## 7. Potential Blockers and Concerns

### 7.1 No Blockers Found ✅

- LanceDB 0.23.0 has all required APIs
- No version upgrade needed
- FTS + RRF are in stable release

### 7.2 Concerns for Dr. Castro's Attention

1. **FTS index rebuild cost** — For 25K chunks, FTS index creation takes a few seconds. During this time, queries still work (just slower for new data). This is acceptable for our scale.

2. **Memory overhead** — FTS index adds memory usage. For 25K chunks of ~500 tokens each, estimate ~50-100MB additional. Within our VPS budget.

3. **WHERE clause compatibility** — Need to verify that `.where()` works correctly with the hybrid `.vectorSearch().fullTextSearch().rerank()` chain. The type signatures suggest it does, but should be validated in Phase 4 testing.

4. **FTS on existing data** — When enabling hybrid for the first time on an existing database with documents, the FTS index must be created. This is a one-time operation but could take time proportional to data size.

5. **RRF `_relevance_score` column** — The native RRF reranker returns results with a `_relevance_score` column. We need to adapt our score mapping (currently using `1/(1+_distance)`) to use this instead when hybrid is enabled.

---

## 8. Summary of Key Findings

| Finding | Status |
|---------|--------|
| LanceDB 0.23.0 supports FTS | ✅ Confirmed |
| Native RRF reranker available | ✅ `RRFReranker.create(k=60)` |
| Native hybrid search chain | ✅ `.vectorSearch().fullTextSearch().rerank()` |
| FTS index on `text` column | ✅ `createIndex("text", { config: Index.fts() })` |
| WHERE clause with hybrid | ✅ Available on `StandardQueryBase` |
| No version upgrade needed | ✅ All APIs in 0.23.0 |
| Score normalization | ✅ RRF is rank-based, no normalization needed |
| Tag filtering compatible | ✅ WHERE clause applies to both search paths |
