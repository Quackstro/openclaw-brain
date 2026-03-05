# 📄 Document RAG — Improvement Roadmap

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** Research / Backlog  
**Prereq:** Doc-RAG MVP (✅ Complete)

---

## Current System Baseline

| Component | Current Implementation |
|-----------|----------------------|
| Search | Vector-only (cosine similarity, LanceDB) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) via GitHub Models |
| Chunking | Fixed-size recursive splitter (~500 tokens, 50 overlap) |
| Filtering | Tag-based (OR logic, denormalized on chunks) |
| Auto-tagging | Keyword extraction + prior tag centroid affinity |
| OCR | Tesseract CLI with sparse-page detection |
| Storage | LanceDB embedded, persistent, capacity-managed |
| Formats | PDF, DOCX, XLSX, PPTX |

**What works well:** End-to-end pipeline, auto-tagging, capacity management, health monitoring.  
**Where it falls short:** Pure vector search misses exact terms/numbers; chunks lack document context; no result quality refinement after retrieval.

---

## Improvement Tiers

### 🏆 Tier 1 — High Impact, Low Effort

These deliver the biggest quality improvements with minimal disruption to the existing system.

---

#### 1. Hybrid Search (BM25 + Vector Fusion)

**Problem:** Vector search struggles with exact matches — specific names, section numbers, dollar amounts, dates, technical terms. A user searching "section 4.2" or "Dr. Smith" gets fuzzy semantic results instead of the exact hit.

**Solution:** Combine keyword search (BM25/full-text) with vector search using Reciprocal Rank Fusion (RRF). LanceDB has native full-text search support — no new dependencies.

**How it works:**
```
User query
    │
    ├─→ Vector search (semantic) → top-20 results with scores
    │
    ├─→ Full-text search (BM25) → top-20 results with scores
    │
    ▼
Reciprocal Rank Fusion (RRF)
    │
    ▼
Merged top-K results (best of both worlds)
```

**RRF Formula:** `score = Σ 1/(k + rank_i)` where k=60 (standard constant)

**Implementation:**
- Enable LanceDB full-text index on `doc_chunks.text`
- Run both searches in parallel
- Merge with RRF scoring
- Return top-K fused results

**Effort:** ~4-6 hours  
**New deps:** None (LanceDB native)  
**Impact:** High — fixes the #1 weakness of vector-only search  
**Risk:** Low — additive, doesn't change existing vector search  

**References:**
- [LanceDB Full-Text Search docs](https://lancedb.github.io/lancedb/fts/)
- [Fusion Retrieval technique](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/fusion_retrieval.ipynb)

---

#### 2. Contextual Chunk Headers

**Problem:** When a chunk is embedded in isolation, the embedding doesn't know *where* it came from. A chunk about "revenue increased 15%" loses context — which document? Which section? Which quarter?

**Solution:** Prepend structured metadata to each chunk *before* embedding:

```
Document: Q4-Financial-Report.pdf
Section: Revenue Analysis
Page: 3
Tags: finance, quarterly
---
Revenue increased 15% year-over-year, driven primarily by the
expansion of international routes and increased premium cabin bookings...
```

The embedding now captures both the content AND its provenance. Retrieval quality jumps because semantically similar queries match on context too.

**Implementation:**
- Modify `chunker.ts` to prepend a header block to each chunk before embedding
- Header includes: document name, detected section/heading, page number, tags
- Raw text stored separately for display (don't show the header to the user)
- Two fields: `text` (display), `embeddingText` (text + header, used for embedding)

**Effort:** ~2-3 hours  
**New deps:** None  
**Impact:** High — every query benefits from better-contextualized embeddings  
**Risk:** Low — requires re-embedding existing docs (one-time migration)  

**References:**
- [Contextual Chunk Headers](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/contextual_chunk_headers.ipynb)

---

#### 3. Reranking (Cross-Encoder or LLM-Based)

**Problem:** Vector search retrieves the top-K most similar chunks, but similarity ≠ relevance. A chunk might be semantically close but not actually answer the question. The first result isn't always the best result.

**Solution:** Retrieve a larger candidate set (top-20), then rerank using a more sophisticated model that considers the query-chunk pair together (not just embedding distance).

**Options (VPS-friendly):**

| Approach | Cost | Quality | Latency |
|----------|------|---------|---------|
| LLM rerank (GitHub Models, free) | $0 | High | ~1-2s |
| Cross-encoder (local ONNX) | $0 | Medium-High | ~200ms |
| Cohere Rerank API | ~$1/1K queries | Very High | ~300ms |

**LLM reranking prompt (cheapest, good quality):**
```
Given the query: "{query}"

Rank these passages by relevance (most relevant first):
1. {chunk_1}
2. {chunk_2}
...

Return ranked indices: [3, 1, 5, ...]
```

**Implementation:**
- Retrieve top-20 from vector search (or hybrid search)
- Pass to reranker
- Return top-5 reranked results
- Config toggle: `retrieval.reranking.enabled: true/false`

**Effort:** ~4-6 hours  
**New deps:** None if using GitHub Models LLM; `@xenova/transformers` if local cross-encoder  
**Impact:** High — significant answer quality improvement  
**Risk:** Low — additive, falls back to vector-only if reranker fails  

**References:**
- [Reranking techniques](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/reranking.ipynb)

---

### 🥈 Tier 2 — Medium Impact, Medium Effort

Worth implementing after Tier 1 is solid.

---

#### 4. Parent-Child Chunking (Small-to-Big Retrieval)

**Problem:** There's a fundamental tension in chunk size — small chunks give precise retrieval but lose context; large chunks preserve context but dilute the embedding signal.

**Solution:** Store two levels of chunks:
- **Child chunks** (~200 tokens): used for retrieval (precise embedding match)
- **Parent chunks** (~1000 tokens): returned as context (rich, complete passages)

When a child chunk matches, return its parent to the LLM.

**Implementation:**
- Chunk at parent level first (~1000 tokens)
- Sub-chunk each parent into children (~200 tokens)
- Store both, with child→parent reference
- Search on children, return parents (deduplicated)

**Effort:** ~8-10 hours  
**New deps:** None  
**Impact:** Medium-High — better context without sacrificing retrieval precision  
**Risk:** Medium — increases storage ~2x, requires chunker + store refactor  

**References:**
- [Context Window Enhancement](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/context_enrichment_window_around_chunk.ipynb)

---

#### 5. Semantic Chunking

**Problem:** Fixed-size chunking splits text at arbitrary token boundaries. A paragraph about one topic might be split across two chunks, diluting both embeddings.

**Solution:** Use embedding similarity between consecutive sentences to detect topic boundaries. Split where the topic shifts, not at a fixed token count.

**Algorithm:**
```
For each sentence pair (s_i, s_{i+1}):
    similarity = cosine(embed(s_i), embed(s_{i+1}))
    if similarity < threshold:
        → topic boundary → split here
```

**Trade-offs:**
- Requires embedding each sentence at ingest time (more API calls)
- Variable chunk sizes (need min/max bounds)
- Significantly better chunk quality for long, multi-topic documents

**Effort:** ~6-8 hours  
**New deps:** None  
**Impact:** Medium — most beneficial for long, complex documents  
**Risk:** Medium — higher embedding cost at ingest; needs tuning  

**References:**
- [Semantic Chunking](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/semantic_chunking.ipynb)

---

#### 6. HyDE (Hypothetical Document Embedding)

**Problem:** User queries and document chunks live in different semantic spaces. "What's our liability exposure?" (a question) doesn't embed the same way as "The company's total liability is estimated at $4.2M" (a statement).

**Solution:** Before searching, ask the LLM to generate a hypothetical answer, then embed *that* and search. The hypothesis is semantically closer to the actual stored chunks.

```
User: "What's our liability exposure?"
    │
    ▼
LLM generates: "Based on the contractual agreements, the estimated
liability exposure is approximately $X million, primarily arising
from indemnification clauses in vendor contracts..."
    │
    ▼
Embed the hypothesis → search → find actual chunks
```

**Effort:** ~3-4 hours  
**New deps:** None (uses existing LLM)  
**Impact:** Medium — biggest improvement for question-style queries  
**Risk:** Low — one extra LLM call per query; config toggle  

**References:**
- [HyDE technique](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/HyDe_Hypothetical_Document_Embedding.ipynb)

---

### 🥉 Tier 3 — Nice to Have / Future

Lower priority but valuable as the system matures.

---

#### 7. Document Summary Index (Hierarchical Retrieval)

**Problem:** With 100 documents, flat search across all chunks can surface irrelevant results from unrelated docs.

**Solution:** Generate a summary per document at ingest. Search summaries first to identify the 3-5 most relevant documents, then search chunks only within those docs. Two-stage retrieval.

**Effort:** ~6-8 hours  
**Impact:** Medium — scales better as doc count grows  
**Cost:** One LLM call per document at ingest time  

---

#### 8. Local Embeddings (Zero API Cost)

**Problem:** Every ingest and query costs API calls. Rate limits, latency, and (eventual) costs.

**Solution:** Run embeddings locally using ONNX Runtime + `all-MiniLM-L6-v2` (384 dims). Zero cost, zero latency, works offline.

**Trade-offs:**
- 384 dims vs 1536 — slightly lower quality
- ~50MB model download
- CPU-bound on VPS (but fast for small batches)

**Effort:** ~4-6 hours  
**Impact:** Medium — eliminates external dependency  
**Risk:** Medium — lower embedding quality; requires re-embedding all docs  

---

#### 9. Query Expansion / Multi-Query

**Problem:** A single query might miss relevant chunks phrased differently.

**Solution:** Automatically generate 2-3 query variants:
```
Original: "What are the termination clauses?"
Variant 1: "How can the contract be terminated?"
Variant 2: "What conditions allow ending the agreement?"
```

Search with all variants, merge results.

**Effort:** ~3-4 hours  
**Impact:** Medium — better recall for ambiguous queries  
**Cost:** One LLM call per query to generate variants  

---

#### 10. Chunk-Level Citations with Page Numbers

**Problem:** Current responses cite the document but not the specific page/section.

**Solution:** Include page number and section header in query responses:
```
"According to Service-Agreement.docx (Page 4, Section 3.2):
The termination clause requires 30 days written notice..."
```

Already partially supported — `page` field exists on chunks. Just needs response formatting.

**Effort:** ~1-2 hours  
**Impact:** Low-Medium — improves trust and verifiability  

---

#### 11. Table-Aware Chunking for Spreadsheets

**Problem:** Spreadsheet data chunked as flat text loses row/column relationships.

**Solution:** Preserve table structure in chunks — each chunk is a logical group of rows with column headers repeated.

**Effort:** ~4-6 hours  
**Impact:** Low-Medium — only affects XLSX documents  

---

#### 12. Feedback Loop (Learn from Usage)

**Problem:** No way to know if retrieved chunks actually answered the user's question.

**Solution:** Track which queries led to follow-ups (user wasn't satisfied) vs. which were one-shot (user got the answer). Use this signal to tune retrieval over time.

**Effort:** ~8-12 hours  
**Impact:** Long-term compounding improvement  

---

## Recommended Implementation Order

| Priority | Improvement | Est. Hours | Prereqs |
|----------|------------|-----------|---------|
| **1** | Hybrid Search (BM25 + Vector) | 4-6h | None |
| **2** | Contextual Chunk Headers | 2-3h | None (re-embed existing docs) |
| **3** | Reranking | 4-6h | None (benefits from #1) |
| **4** | Chunk-Level Citations | 1-2h | None |
| **5** | Parent-Child Chunking | 8-10h | #2 complete |
| **6** | HyDE | 3-4h | None |
| **7** | Semantic Chunking | 6-8h | Can replace or augment #5 |
| **8** | Document Summary Index | 6-8h | None |
| **9** | Query Expansion | 3-4h | Benefits from #1 |
| **10** | Local Embeddings | 4-6h | None (optional, cost optimization) |
| **11** | Table-Aware Chunking | 4-6h | None |
| **12** | Feedback Loop | 8-12h | Usage data needed first |

**Total estimated effort for Tier 1 (#1-#3):** ~10-15 hours  
**Total estimated effort for all tiers:** ~55-75 hours

---

## Key References

- [RAG Techniques Repository](https://github.com/NirDiamant/RAG_Techniques) — 34+ advanced techniques with notebooks
- [LanceDB Full-Text Search](https://lancedb.github.io/lancedb/fts/) — Native hybrid search support
- [Anthropic RAG Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/retrieval-augmented-generation)
- Plan: `plans/doc-rag-mvp.md` — Original MVP plan (✅ Complete)
- Future Enhancements: Section 19 of the MVP plan

---

## Notes

- All improvements are additive — each can be toggled via config without breaking the existing pipeline
- Tier 1 improvements should be done before scaling document count significantly
- Re-embedding is needed for improvements #2 and #5 — batch these together
- GitHub Models free tier is sufficient for reranking and HyDE at our scale
