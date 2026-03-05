# 🔬 Doc-RAG Reranking — Research Findings

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** Research Complete  
**Prerequisite:** Doc-RAG Hybrid Search (✅ Complete)

---

## 1. Reranking Techniques Overview

Reranking is a post-retrieval step in RAG systems that reassesses and reorders initially retrieved documents to improve relevance. The core idea: retrieve a **larger candidate set** (e.g., 20 results), then use a more expensive but more accurate model to **re-score and reorder** them, returning only the top-K.

**Source:** [NirDiamant/RAG_Techniques — reranking.ipynb](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/reranking.ipynb)

### 1.1 Cross-Encoder Reranking

**How it works:**
- A cross-encoder takes a `(query, passage)` pair as input and produces a single relevance score.
- Unlike bi-encoders (which embed query and passage separately), cross-encoders process both inputs **jointly** through all transformer layers, enabling full attention between query and passage tokens.
- This makes cross-encoders significantly more accurate but slower (O(n) forward passes for n candidates).

**Process:**
1. Initial retrieval returns N candidate passages
2. Form `[query, passage]` pairs for each candidate
3. Feed each pair through the cross-encoder → get relevance score
4. Sort by score, return top-K

**Available Models (from notebook and HuggingFace):**

| Model | Size | Speed | Quality | Notes |
|-------|------|-------|---------|-------|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | 22M params | Fast | Good | Best balance for our use case |
| `cross-encoder/ms-marco-MiniLM-L-12-v2` | 33M params | Medium | Better | Slightly more accurate |
| `cross-encoder/ms-marco-TinyBERT-L-2-v2` | 4.4M params | Very fast | Fair | Fastest, lower quality |
| `BAAI/bge-reranker-base` | 278M params | Slow | Excellent | State of the art but heavy |
| `BAAI/bge-reranker-v2-m3` | 568M params | Very slow | Best | Multilingual, too large for VPS |

**Example from notebook (Python, `sentence-transformers`):**
```python
cross_encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
pairs = [[query, doc.page_content] for doc in initial_docs]
scores = cross_encoder.predict(pairs)
scored_docs = sorted(zip(initial_docs, scores), key=lambda x: x[1], reverse=True)
```

**JavaScript equivalent (via `@huggingface/transformers`):**
```typescript
import { AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers';
const model = await AutoModelForSequenceClassification.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');
const tokenizer = await AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');
const features = tokenizer([query, query], { text_pair: [passage1, passage2], padding: true, truncation: true });
const scores = await model(features);
```

### 1.2 LLM-Based Reranking

**How it works:**
- Use an LLM (e.g., GPT-4o-mini) to score the relevance of each passage to a query.
- The LLM receives a prompt asking it to rate relevance on a numeric scale.
- More flexible than cross-encoders — can understand complex semantic relationships, nuance, and intent.
- Significantly more expensive per query (API call per passage or batch).

**From the notebook — LLM reranking pattern:**
```python
prompt = """On a scale of 1-10, rate the relevance of the following document to the query.
Consider the specific context and intent of the query, not just keyword matches.
Query: {query}
Document: {doc}
Relevance Score:"""

# Uses structured output (RatingScore with relevance_score: float)
llm_chain = prompt_template | llm.with_structured_output(RatingScore)
score = llm_chain.invoke({"query": query, "doc": doc.page_content}).relevance_score
```

**Key insight from notebook demonstration:**
- Query: "What is the capital of France?"
- Vector search returned: "The capital of France is great." / "The capital of France is beautiful." (high lexical similarity but no answer)
- LLM reranking promoted: "I really enjoyed my trip to Paris, France..." (actually contains the answer)
- This demonstrates the power of reranking for semantic understanding beyond keyword/embedding similarity.

**Cost/Quality Tradeoffs:**

| Method | Cost per Query (20 passages) | Latency | Quality |
|--------|------------------------------|---------|---------|
| No reranking | $0 | ~100ms | Baseline |
| LLM individual scoring (gpt-4o-mini) | ~$0.003 | ~2-5s | High |
| LLM batch scoring (gpt-4o-mini) | ~$0.001 | ~1-3s | High |
| Cross-encoder (local ONNX) | $0 | ~200-500ms | Good |
| Cohere Rerank API | ~$0.002 | ~500ms | Excellent |

### 1.3 Cohere Rerank API (Reference)

Cohere provides a dedicated reranking API (`rerank-english-v3.0`, `rerank-multilingual-v3.0`). It's the gold standard for hosted reranking but:
- **Not free** — $1 per 1000 search queries
- Requires API key and external dependency
- **Not suitable for our setup** (we want free/local options)
- Useful as a quality benchmark

---

## 2. Free Reranking Options for Our Setup

### 2.1 GitHub Models LLM Reranking (⭐ Recommended for v1)

**Approach:** Use GitHub Models' free tier to call `gpt-4o-mini` for passage relevance scoring.

**Endpoint:** `https://models.inference.ai.azure.com` (same base URL as our embeddings)
**Authentication:** Same GitHub PAT used for embeddings
**Model:** `gpt-4o-mini` (cheap, fast, good quality)

**Pros:**
- ✅ No new dependencies — reuses existing API key and HTTP infrastructure
- ✅ High quality — LLM understands semantic nuance
- ✅ Free tier — GitHub Models provides generous free usage
- ✅ Easy to implement — standard OpenAI-compatible chat completions API
- ✅ Batch scoring possible (all passages in one prompt)

**Cons:**
- ❌ Adds latency (~1-3s per query for batch scoring)
- ❌ Token usage — ~500-2000 tokens per reranking call
- ❌ Network dependency — requires internet connectivity
- ❌ Rate limits — GitHub Models free tier has limits (varies)

**Implementation approach:**
```typescript
// Use OpenAI-compatible API via fetch or openai package
const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: rerankPrompt }],
    temperature: 0,
    max_tokens: 200,
  }),
});
```

### 2.2 Local Cross-Encoder via ONNX

**Approach:** Use `@huggingface/transformers` (successor to `@xenova/transformers`) to run `Xenova/ms-marco-MiniLM-L-6-v2` locally.

**How it works:**
- Download ONNX model weights (~90MB) on first use (cached locally)
- Run inference entirely in Node.js — no network calls for scoring
- Model: `Xenova/ms-marco-MiniLM-L-6-v2` (22M params, ONNX-optimized)

**Pros:**
- ✅ Zero cost — runs entirely locally
- ✅ Fast — ~10-25ms per pair, ~200-500ms for 20 candidates
- ✅ No network dependency for scoring
- ✅ Deterministic — same inputs always produce same scores

**Cons:**
- ❌ New dependency — `@huggingface/transformers` (~50MB + 90MB model)
- ❌ Memory usage — model loads into RAM (~200MB)
- ❌ Lower quality than LLM — misses nuanced semantic relationships
- ❌ Cold start — first inference slower (model loading)
- ❌ VPS resource usage — may impact other services on constrained servers

**Verified working example (from HuggingFace docs):**
```typescript
import { AutoTokenizer, AutoModelForSequenceClassification } from '@huggingface/transformers';

const model = await AutoModelForSequenceClassification.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');
const tokenizer = await AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2');

const features = tokenizer(
  ['How many people live in Berlin?', 'How many people live in Berlin?'],
  {
    text_pair: [
      'Berlin has a population of 3,520,031 registered inhabitants...',
      'New York City is famous for the Metropolitan Museum of Art.',
    ],
    padding: true,
    truncation: true,
  }
);
const scores = await model(features);
// [ 8.663132667541504, -11.245542526245117 ]
// Higher score = more relevant
```

### 2.3 LanceDB Built-in Rerankers

**Findings from examining the Node.js SDK:**

The LanceDB Node.js SDK (v0.23.x, our installed version) has **only one reranker class:**

| Reranker | Class | Status |
|----------|-------|--------|
| `RRFReranker` | `rerankers.RRFReranker` | ✅ Available, already in use |
| `CohereReranker` | N/A | ❌ Not in Node.js SDK |
| `CrossEncoderReranker` | N/A | ❌ Not in Node.js SDK |
| `ColbertReranker` | N/A | ❌ Not in Node.js SDK |
| `OpenAIReranker` | N/A | ❌ Not in Node.js SDK |
| `LinearCombinationReranker` | N/A | ❌ Not in Node.js SDK |

**Note:** The Python SDK has additional rerankers (CohereReranker, CrossEncoderReranker, ColbertReranker, OpenAIReranker, LinearCombinationReranker), but the **Node.js SDK only exposes RRFReranker**. This is the native Rust implementation exposed via N-API bindings.

**Reranker interface (from `@lancedb/lancedb/dist/rerankers/index.d.ts`):**
```typescript
export interface Reranker {
  rerankHybrid(query: string, vecResults: RecordBatch, ftsResults: RecordBatch): Promise<RecordBatch>;
}
```

**Implication:** We cannot use LanceDB's built-in rerankers for cross-encoder or LLM-based reranking. Our reranking must be implemented as a **post-processing step** after LanceDB returns results, not as a LanceDB reranker plugin.

---

## 3. LLM Reranking Prompt Design

### 3.1 Best Prompt Format

After reviewing the notebook and best practices, two prompt patterns emerge:

**Pattern A: Individual Scoring (used in notebook)**
```
On a scale of 1-10, rate the relevance of the following document to the query.
Consider the specific context and intent of the query, not just keyword matches.

Query: {query}
Document: {passage}

Relevance Score:
```

**Pattern B: Batch Scoring (recommended for our use case)**
```
You are a relevance scoring system. Rate each passage's relevance to the query on a scale of 0-10.
Consider semantic meaning, not just keyword overlap.

Query: {query}

Passages:
[1] {passage_1}
[2] {passage_2}
...
[N] {passage_N}

Return a JSON array of objects with "index" (1-based) and "score" (0-10, float).
Only return the JSON array, no other text.
```

### 3.2 Batch vs Individual Scoring

| Approach | API Calls | Tokens | Latency | Reliability |
|----------|-----------|--------|---------|-------------|
| **Individual** (1 call per passage) | N calls | ~100 tokens × N | ~N × 500ms | High (each call independent) |
| **Batch** (1 call, all passages) | 1 call | ~100 + 200×N tokens | ~1-3s total | Medium (single failure = all fail) |

**Recommendation: Batch scoring** — significantly lower latency and token usage. With 20 passages averaging 200 tokens each, a batch call uses ~4500 tokens total vs 20 individual calls.

### 3.3 Output Format

**Recommended: JSON array with index and score**
```json
[
  {"index": 1, "score": 9.2},
  {"index": 2, "score": 3.5},
  {"index": 3, "score": 7.8}
]
```

**Why:**
- Parseable with `JSON.parse()` — no regex needed
- Index-based — robust to passage text variations
- Float scores — enables fine-grained ranking
- Compact — minimal output tokens

**Alternative: Ranked list** (less recommended)
```
3, 1, 2, 5, 4
```
Simpler but loses score magnitude information (can't tell if top result is much better or marginally better).

### 3.4 Token Cost Estimation

**Per query with 20 candidate passages (batch scoring with gpt-4o-mini):**

| Component | Tokens | Cost (gpt-4o-mini) |
|-----------|--------|---------------------|
| System/instruction prompt | ~80 tokens | — |
| Query text | ~20 tokens | — |
| 20 passages × ~200 tokens each | ~4000 tokens | — |
| **Total input** | **~4100 tokens** | **~$0.0006** |
| Output (JSON array, 20 entries) | ~200 tokens | **~$0.0001** |
| **Total per query** | **~4300 tokens** | **~$0.0007** |

At GitHub Models free tier pricing (effectively $0), the token cost is irrelevant — only rate limits matter.

**Rate limit consideration:** GitHub Models free tier allows ~15-30 RPM for gpt-4o-mini. With one reranking call per doc_query, this is well within limits for interactive use.

---

## 4. Current Codebase Analysis

### 4.1 Search Flow (store.ts)

**Vector-only search (`searchChunks`):**
```
searchChunks(vector, limit, options)
  → chunksTable.vectorSearch(vector)
  → .limit(limit * 3)  // over-fetch for filtering
  → .where(conditions)
  → .toArray()
  → Convert _distance → score = 1/(1+distance)
  → Filter by minScore, slice to limit
```

**Hybrid search (`hybridSearchChunks`):**
```
hybridSearchChunks(vector, queryText, limit, options)
  → ensureFtsIndex()
  → getOrCreateReranker(k)  // RRFReranker
  → chunksTable.vectorSearch(vector)
    .fullTextSearch(queryText, { columns: "text" })
    .where(conditions)
    .rerank(rrfReranker)
    .limit(limit)
    .toArray()
  → Map _relevance_score → score
  → Filter by minScore
```

**Key observation:** Both methods return `ChunkSearchResult[]` (chunk + score). The reranking step can be inserted **after** either search method returns, as a post-processing step.

### 4.2 Query Pipeline (pipeline.ts)

```
pipeline.query(params)
  → embeddings.embed(query) → queryVector
  → IF hybrid.enabled:
      store.hybridSearchChunks(queryVector, query, limit, ...)
    ELSE:
      store.searchChunks(queryVector, limit, ...)
  → Enrich with doc names
  → Return QueryResult
```

**Insertion point for reranking:** After search results are returned but before doc name enrichment. The pipeline already has `query` text available (needed for reranking prompt).

**Proposed flow:**
```
pipeline.query(params)
  → embeddings.embed(query) → queryVector
  → search (vector-only or hybrid) with candidateCount limit
  → IF reranking.enabled:
      rerankResults(query, searchResults, limit) → rerankedResults
    ELSE:
      searchResults (already limited)
  → Enrich with doc names
  → Return QueryResult
```

### 4.3 Config Structure (config.ts)

The config already supports nested `retrieval` with `hybrid` sub-section. Adding `reranking` as a sibling to `hybrid` under `retrieval` follows the established pattern:

```typescript
retrieval: {
  hybrid: { enabled, k, candidateMultiplier, ftsOptions },
  reranking: { enabled, method, candidateCount, llm: {...}, timeoutMs },  // NEW
}
```

### 4.4 Plugin Manifest (openclaw.plugin.json)

The `configSchema` in the manifest needs to be updated to include the `reranking` sub-section under `retrieval.properties`. Current `retrieval` only has `hybrid`.

### 4.5 Types (types.ts)

Current types are clean and well-structured. We need to add:
- `RerankingMethod` type alias (`"llm" | "cross-encoder"`)
- Potentially a `RerankerProvider` interface (similar to `EmbeddingProvider`)
- `RerankResult` type for internal use

---

## 5. Architecture Decision: Where Reranking Fits

### Option A: Inside LanceDB (as a Reranker plugin)
❌ **Rejected** — LanceDB Node.js SDK only supports `RRFReranker`. No way to inject custom rerankers. The `Reranker` interface exists but there's no mechanism to create custom implementations that integrate with the query builder.

### Option B: Post-processing in store.ts
⚠️ **Possible** — Add a `rerankResults()` method to `DocStore` that takes search results and reranks them. But this mixes storage concerns with reranking logic.

### Option C: Post-processing in pipeline.ts (⭐ Recommended)
✅ **Best approach** — Add reranking as a pipeline step between search and doc enrichment. This is:
- Clean separation of concerns (store = search, pipeline = orchestration)
- Easy to test in isolation
- Consistent with how the notebook structures reranking (separate from retrieval)

### Recommended Architecture

```
pipeline.query()
  ├─ 1. Embed query
  ├─ 2. Search (vector-only or hybrid) — fetch candidateCount results
  ├─ 3. Rerank (if enabled) — score candidates, sort, take top limit
  └─ 4. Enrich with doc names + return
```

The reranker itself should be a separate module (`reranker.ts`) with:
- `LLMReranker` class (calls GitHub Models / OpenAI-compatible API)
- Future: `CrossEncoderReranker` class (local ONNX)
- Both implement a common interface

---

## 6. Recommendation Summary

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Reranking method for v1** | LLM-based (gpt-4o-mini via GitHub Models) | Zero new dependencies, free, high quality |
| **Scoring approach** | Batch (all passages in one prompt) | Lower latency, fewer API calls |
| **Architecture** | Post-processing in pipeline.ts | Clean separation, easy to test |
| **Candidate count** | 20 (retrieve 20, return 5 after rerank) | 4:1 ratio is standard in the literature |
| **Future enhancement** | Local cross-encoder as alternative | For offline/fast mode, lower quality |
| **Output format** | JSON array with index + score | Parseable, robust |
| **Timeout** | 5000ms with graceful fallback | Return un-reranked results on timeout |
| **Config location** | `retrieval.reranking.*` | Parallel to `retrieval.hybrid.*` |
