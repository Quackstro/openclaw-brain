# 📚 Research: Contextual Chunk Headers (CCH) for Doc-RAG

**Author:** Jarvis · **Date:** 2026-02-01  
**Purpose:** Research findings for Doc-RAG Improvement #2 — Contextual Chunk Headers  
**Status:** ✅ Complete  

---

## 1. Contextual Chunk Headers Technique

### 1.1 Source

Analyzed from [NirDiamant/RAG_Techniques — contextual_chunk_headers.ipynb](https://github.com/NirDiamant/RAG_Techniques/blob/main/all_rag_techniques/contextual_chunk_headers.ipynb).

### 1.2 Core Concept

Contextual Chunk Headers (CCH) prepend higher-level context (document title, section hierarchy, metadata) to each chunk **before embedding**. This gives the embedding vector a more accurate and complete representation of the chunk's meaning and provenance.

**Problem solved:** Individual chunks often lack sufficient context:
- Chunks refer to subjects via implicit references and pronouns ("the company", "this policy")
- Chunks only make sense within their parent section/document
- Retrieval systems fail to match queries to chunks that don't explicitly name the subject

### 1.3 What Metadata to Include in Headers

Ranked by impact (most to least important):

| Metadata | Impact | Notes |
|----------|--------|-------|
| **Document title/name** | **Highest** | Simplest and most impactful. Resolves pronoun ambiguity. |
| **Document summary** | High | Concise 1-2 sentence summary. Provides topical context. |
| **Section/sub-section titles** | High | Full hierarchy (e.g., "Chapter 3 > Section 3.2 > Liability"). Helps match section-level queries. |
| **Tags/categories** | Medium | Domain markers (e.g., "legal", "finance"). Helps cross-document disambiguation. |
| **Page number** | Low-Medium | Useful for citation but doesn't improve semantic embedding quality much. |
| **Format type** | Low | PDF/DOCX/etc. Marginal embedding benefit but useful for display. |

### 1.4 Optimal Header Format

The reference implementation uses a simple format:

```
Document Title: NIKE, INC. ANNUAL REPORT ON FORM 10-K

[chunk text here]
```

More sophisticated headers follow this pattern:

```
Document: [Document Name]
Section: [Section Hierarchy]
Tags: [tag1, tag2]
---
[chunk text here]
```

**Key findings on format:**
- **Separator:** A clear visual separator (`---`, `\n\n`, or blank line) between header and content helps the model distinguish metadata from content
- **Ordering:** Document name first (highest context), then section, then tags. Most general → most specific.
- **Labeling:** Prefixing with labels (`Document:`, `Section:`) improves clarity over raw concatenation
- **Brevity:** Keep headers concise. Very long headers dilute the chunk content in the embedding space.
- **Consistency:** Use the same format across all chunks for predictable embedding behavior.

### 1.5 Impact on Embedding Quality

**KITE Benchmark Results (from the paper):**

| Dataset | No-CCH Score | With-CCH Score | Improvement |
|---------|-------------|----------------|-------------|
| AI Papers | 4.5 | 4.7 | +4.4% |
| BVP Cloud 10-Ks | 2.6 | **6.3** | **+142.3%** |
| Sourcegraph Handbook | 5.7 | 5.8 | +1.8% |
| Supreme Court Opinions | 6.1 | **7.4** | **+21.3%** |
| **Average** | **4.72** | **6.04** | **+27.9%** |

**Key observations:**
- **Largest gains** on multi-document corpora where documents are structurally similar (10-K filings) — chunks without doc context are nearly indistinguishable
- **Moderate gains** on documents with strong internal structure (legal opinions)
- **Small gains** on already context-rich documents (academic papers with clear abstracts)
- **FinanceBench:** CCH contributed to 83% accuracy vs 19% baseline (tested jointly with RSE)

**Reranker experiment from notebook:**
- Without CCH: relevance score **0.106** for query "Nike climate change impact" on a chunk about climate risks
- With CCH (document title prepended): relevance score **0.922** — a **9x improvement**
- The chunk discussed climate impact but never mentioned "Nike" — the title provided that missing context

### 1.6 Embed the Header vs. Prepend for Search Only

**The technique requires embedding the header with the chunk.** This is the core insight:

1. **Embedding:** Concatenate header + chunk text → embed this combined text. The vector now captures the document/section context.
2. **Search:** When presenting results to the LLM, also include the header. This gives the LLM context to interpret the chunk correctly.
3. **Reranking:** If using a reranker, pass the same header + chunk concatenation. The reranker needs the same context.

**Important distinction for our implementation:**
- The **`text` field** (displayed to user/LLM) should remain the **raw chunk text** — users expect to see the original content
- A new **`embeddingText` field** (or equivalent) should contain the **header + chunk text** — used for embedding and search
- This separation allows re-generating headers (e.g., when tags change) without losing the original text

---

## 2. Section/Heading Detection by Format

### 2.1 PDF — Heading Detection

PDFs are the **hardest** format for section detection because headings aren't semantically tagged.

**Approaches (ordered by reliability):**

| Method | Reliability | Our parser support |
|--------|------------|-------------------|
| **PDF bookmarks/outlines** | High (when present) | ❌ Not currently extracted by `pdfjs-dist` in our parser |
| **Font size analysis** | Medium | ❌ We extract `.str` text only, not font metadata |
| **Bold/style analysis** | Medium | ❌ Same — no style info extracted |
| **Heuristic line detection** | Low-Medium | ✅ Possible with regex on extracted text |

**Heuristic approach for our codebase (recommended):**

Since our PDF parser (`pdfjs-dist`) extracts text items with positions and basic properties, we can:
1. **Detect lines that look like headings:** All-caps lines, short lines followed by paragraph breaks, numbered sections (`1.`, `1.1.`, `Section 3`)
2. **Regex patterns for common heading formats:**
   - `^\d+\.\s+\w+` — numbered sections (1. Introduction)
   - `^\d+\.\d+\.\s+\w+` — sub-sections (1.2. Background)
   - `^[A-Z][A-Z\s]{3,}$` — ALL CAPS lines
   - `^(Section|Article|Chapter|Part)\s+\w+` — explicit markers
   - `^#{1,6}\s+` — Markdown headings (in markdown source documents)
3. **Page-level: use first heading found on each page** as the section for chunks from that page

**Future enhancement:** Access `pdfjs-dist` text content items' `transform` property (contains font size/position) for font-size-based heading detection. This requires modifying `parsePdf()` to return richer item metadata.

### 2.2 DOCX — Heading Styles

DOCX files have **semantic heading styles** — this is the most reliable format for section detection.

**How `mammoth` (our parser) handles it:**
- `mammoth.extractRawText()` — what we currently use — **strips all formatting including headings**
- `mammoth.convertToHtml()` — converts heading styles to `<h1>`, `<h2>`, etc.
- `mammoth.convertToMarkdown()` — converts heading styles to `#`, `##`, etc.

**Recommended approach:**
1. Switch from `extractRawText()` to `convertToHtml()` or `convertToMarkdown()`
2. Parse out heading elements: `<h1>...</h1>`, `<h2>...</h2>`, etc.
3. Build a section hierarchy tree
4. Assign each chunk the nearest preceding heading path (e.g., "Introduction > Background > Prior Work")

**Alternative (lighter touch):**
1. Use `mammoth.convertToMarkdown()` → get text with `# Heading` markers
2. During chunking, track the current heading context as text is split
3. Store the heading path in each chunk's `section` field

### 2.3 PPTX — Slide Titles

Our PPTX parser already extracts text from `<a:t>` elements in each slide XML.

**Slide title detection:**
- In PPTX XML, the slide title is typically in the **first text placeholder** (`<p:sp>` with `type="title"` or `idx="0"`)
- More specifically: look in `ppt/slides/slideN.xml` for shapes with `<p:ph type="title"/>` or `<p:ph type="ctrTitle"/>`
- Extract the `<a:t>` content within that shape as the slide title

**Recommended approach:**
1. Modify `parsePptx()` to also extract the title shape text separately
2. Return `slideTitles: string[]` alongside `pages`
3. Use the slide title as the `section` for chunks from that slide

**Simpler alternative:** Use the first line of each slide's text as the "section title" (since slide titles are typically the first text element). This works for ~90% of presentations.

### 2.4 XLSX — Sheet Names

Our XLSX parser **already handles this** — each sheet's text is prefixed with `[Sheet: sheetName]`.

**Current behavior in `parseXlsx()`:**
```typescript
pages.push({
  pageNumber: i + 1,
  text: `[Sheet: ${sheetName}]\n${text}`,
  ocrDerived: false,
});
```

**Section = sheet name.** This is already extracted and available. We just need to:
1. Parse out the sheet name from the existing text prefix
2. Store it in the chunk's `section` field during ingest

---

## 3. Current Codebase Analysis

### 3.1 Chunker (`chunker.ts`)

**Current context mechanism — already partially implemented:**

The chunker already has a `buildContextPrefix()` function that prepends document-level context:

```typescript
function buildContextPrefix(docName?: string, docContext?: string): string {
  const parts: string[] = [];
  if (docName) parts.push(`Document: ${docName}`);
  if (docContext) parts.push(docContext);
  if (parts.length === 0) return "";
  return parts.join(" | ") + "\n\n";
}
```

**How it's used:**
- Called during `chunkText()` with `options.docName` and `options.docContext`
- Prefix is **prepended directly to each chunk's `text` field**
- The prefix character count is subtracted from effective max chars to prevent oversized chunks

**Problem:** The prefix is baked into the `text` field. This means:
1. The original text is lost (can't separate header from content)
2. If tags change, chunks need to be re-generated and re-embedded
3. The `text` shown to users includes the metadata header (noisy)

**Current `ChunkOptions` interface:**
```typescript
export interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
  minChunkLength?: number;
  docName?: string;         // ← already used for context
  docContext?: string;       // ← already used for context
  stripBoilerplate?: boolean;
}
```

### 3.2 Parser (`parser.ts`)

**What metadata is currently extracted:**

| Data | Extracted? | Available In |
|------|-----------|-------------|
| Per-page text | ✅ Yes | `ParseResult.pages[].text` |
| Page numbers | ✅ Yes | `ParseResult.pages[].pageNumber` |
| OCR flags | ✅ Yes | `ParseResult.pages[].ocrDerived` |
| Format type | ✅ Yes | `ParseResult.format` |
| Sheet names (XLSX) | ✅ Yes | Embedded in page text: `[Sheet: name]` |
| **Section headings** | ❌ No | Not extracted for any format |
| **Slide titles (PPTX)** | ❌ No | Not extracted separately |
| **DOCX heading styles** | ❌ No | `extractRawText()` strips them |

**`ParseResult` interface:**
```typescript
export interface ParseResult {
  text: string;           // Full concatenated text
  pages: ParsedPage[];    // Per-page breakdown
  format: "pdf" | "docx" | "xlsx" | "pptx";
  ocrPageCount: number;
  warnings: string[];
}
```

**No `sections` field exists yet.** This needs to be added.

### 3.3 Store (`store.ts`)

**Current chunk schema in LanceDB:**

```typescript
// doc_chunks table columns:
{
  id: string;
  docId: string;
  docTags: string;       // JSON-serialized string array (denormalized from doc)
  text: string;          // The chunk text (currently includes context prefix)
  vector: number[];      // Embedding vector
  chunkIndex: number;    // 0-based index within document
  page: number;          // Source page (1-based)
  section: string;       // ← EXISTS but always empty string ""
  ocrDerived: boolean;
  createdAt: number;
}
```

**Key finding:** The `section` field **already exists** in the schema but is never populated. It's always set to `""` in the pipeline. This is a great foundation — we just need to populate it.

**No `embeddingText` field exists.** Currently `text` serves double duty (display + embedding). We need to either:
- Add an `embeddingText` column (recommended)
- Or keep the split logic in the pipeline and only store `text` differently

### 3.4 Pipeline (`pipeline.ts`)

**Current ingest flow relevant to contextual headers:**

```typescript
// Step 5: Chunk the parsed text
const textChunks = chunkText(parseResult.text, {
  ...this.config.chunking,
  docName: name,                                              // ← doc name passed to chunker
  docContext: userTags.length > 0 ? `Tags: ${userTags.join(", ")}` : undefined,  // ← tags passed
  stripBoilerplate: true,
});

// Step 6: Embed summary + all chunks
const allTextsToEmbed = [
  summaryText,
  ...textChunks.map((c) => c.text),   // ← embeds the FULL text (with context prefix baked in)
];

// Step 12: Store chunks
await this.store.storeChunks(
  textChunks.map((chunk, i) => ({
    docId: doc.id,
    docTags: allTagsSerialized,
    text: chunk.text,            // ← stores text with prefix baked in
    vector: chunkVectors[i],
    chunkIndex: chunk.index,
    page: pageMap[i].page,
    section: "",                 // ← ALWAYS EMPTY — this is what we fix
    ocrDerived: pageMap[i].ocrDerived,
  })),
);
```

**Key observations:**
1. Doc name and tags are already passed to the chunker and baked into `text`
2. The same `text` is used for both embedding and storage
3. `section` is hardcoded to `""` — never populated
4. `buildPageMap()` exists for page attribution — a similar `buildSectionMap()` could follow the same pattern

### 3.5 Types (`types.ts`)

**`DocChunk` already has a `section` field:**
```typescript
export interface DocChunk {
  // ...
  section: string;       // "Detected section header (empty string if none)"
  // ...
}
```

**No `embeddingText` field** — needs to be added if we want to separate display text from embedding text.

### 3.6 Config (`config.ts`)

**Current `ChunkingConfigSchema`:**
```typescript
export const ChunkingConfigSchema = Type.Object({
  maxTokens: Type.Optional(Type.Number({ ... })),
  overlap: Type.Optional(Type.Number({ ... })),
  minChunkLength: Type.Optional(Type.Number({ ... })),
});
```

**No `contextualHeaders` sub-object exists.** This needs to be added.

**Current `DocRagConfig.chunking` interface:**
```typescript
chunking: {
  maxTokens: number;
  overlap: number;
  minChunkLength: number;
};
```

**Needs extension to include:**
```typescript
chunking: {
  maxTokens: number;
  overlap: number;
  minChunkLength: number;
  contextualHeaders: {
    enabled: boolean;
    includeDocName: boolean;
    includeTags: boolean;
    includePage: boolean;
    includeSection: boolean;
    separator: string;
    maxHeaderLength: number;
  };
};
```

---

## 4. Migration Strategy

### 4.1 Current State

- **2 documents** ingested, **181 chunks** total
- All chunks have context prefix baked into `text` (via `buildContextPrefix()`)
- All chunks have `section: ""` (never populated)
- No `embeddingText` field exists in the schema

### 4.2 Re-embedding Options

| Strategy | Pros | Cons |
|----------|------|------|
| **A. Re-embed on next restart** | Automatic, no user action | Slow startup (181 embeddings ≈ 30s + API cost), complex restart logic |
| **B. Manual re-ingest command** | User controls timing, explicit | Requires user awareness and action |
| **C. Lazy re-embed on first query** | Transparent, deferred cost | First query very slow, complex state tracking |
| **D. Flag-based migration** | Best of both worlds | Moderate complexity |

**Recommended: Strategy D — Flag-based migration with re-ingest**

1. Add a `schemaVersion` field to `doc_meta` (or a global config key)
2. On startup, check if existing docs have `schemaVersion < 2`
3. If so, log a warning: "Documents need re-indexing for contextual headers. Run `doc_reindex` or re-ingest."
4. Old chunks (without `embeddingText`) continue to work — vector search uses the existing `vector` column
5. When a doc is re-ingested (delete + ingest), it gets the new format automatically

**Simpler alternative (recommended for 2 docs):**
- Since we only have 2 documents and 181 chunks, the simplest approach is:
  1. Deploy the new code
  2. Manually delete and re-ingest both documents
  3. New chunks get contextual headers and populated `section` fields

### 4.3 Backward Compatibility

Old chunks (without contextual headers) remain fully searchable:

- **Vector search:** Uses the existing `vector` column — still works perfectly
- **Hybrid/FTS search:** Uses the `text` column — still works (text already has doc name prefix)
- **Section field:** Empty string `""` is valid — no crash, just no section info displayed
- **embeddingText field:** If we add it as a new column, old chunks will have it as empty/null — the pipeline can fall back to using `text` for search when `embeddingText` is empty

### 4.4 Schema Migration (LanceDB)

LanceDB doesn't have `ALTER TABLE ADD COLUMN`. For adding `embeddingText`:

**Option A: Read-all, patch, recreate (what we do for `fileHash` migration):**
```typescript
// In store.ts doInitialize():
const probe = await this.chunksTable.query().limit(1).toArray();
if (probe.length > 0 && !("embeddingText" in probe[0])) {
  const allRows = await this.chunksTable.query().toArray();
  const patched = allRows.map(r => ({ ...r, embeddingText: "" }));
  await this.db.dropTable(CHUNKS_TABLE);
  this.chunksTable = await this.db.createTable(CHUNKS_TABLE, patched);
}
```

This pattern already exists in `store.ts` for the `fileHash` column on `doc_meta`. Safe and proven for small datasets.

**Option B: Include `embeddingText` in schema seed row:**
When creating the table fresh, include `embeddingText: ""` in the schema seed. This handles new installations automatically.

**Recommended:** Use both — Option B for new installs, Option A for existing installs.

### 4.5 Re-embedding Cost Estimate

For 181 chunks with OpenAI `text-embedding-3-small`:
- ~500 tokens per chunk × 181 = ~90,500 tokens
- Cost: ~$0.002 (at $0.02/1M tokens)
- Time: ~5-10 seconds (batched)

Negligible cost. Manual re-ingest is the simplest and cleanest path.

---

## 5. Summary of Recommendations

1. **Add `embeddingText` field** to `DocChunk` — separates display text from embedding text
2. **Populate `section` field** — already exists in schema, just needs heading detection
3. **Build contextual headers** from: doc name + section + tags + page (configurable)
4. **Header format:** `Document: X\nSection: Y\nTags: a, b\n---\n[chunk text]`
5. **Section detection:** Start with heuristic text-based detection for PDFs, `convertToMarkdown()` for DOCX, first-line for PPTX, sheet names for XLSX
6. **Config-driven:** All header components togglable via `chunking.contextualHeaders.*`
7. **Migration:** Manual re-ingest of 2 existing documents (simplest, cheapest)
8. **Plugin manifest:** Must update `configSchema` in `openclaw.plugin.json` to include new keys (lesson from Hybrid Search — missing schema keys get stripped on restart)
