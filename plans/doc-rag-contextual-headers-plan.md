# 🏷️ Doc-RAG Contextual Chunk Headers — Implementation Plan

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-02-01  
**Status:** 📋 Ready for Implementation  
**Depends on:** Doc-RAG MVP (✅ Complete), Hybrid Search (✅ Complete)  
**Research:** [`research/doc-rag-contextual-headers.md`](../research/doc-rag-contextual-headers.md)  

---

## 1. Overview

Add **Contextual Chunk Headers (CCH)** to the doc-rag plugin by prepending structured metadata — document name, section heading, tags, and page number — to each chunk **before embedding**. This gives the embedding vector richer provenance context, substantially improving retrieval quality.

### Why Contextual Chunk Headers?

| Problem | Example | Impact of CCH |
|---------|---------|---------------|
| Chunks use pronouns/implicit references | Chunk says "the company reported losses" but never names the company | Header adds `Document: ACME Corp Q3 2025 Report` → embedding captures "ACME Corp" |
| Similar chunks from different documents are indistinguishable | Two 10-K filings both discuss "revenue growth" | Header differentiates `Document: Nike` vs `Document: Apple` |
| Section-level queries miss fragmented chunks | Query: "liability clauses" but chunk is in Section 4.2 without saying "liability" | Header adds `Section: 4.2 Limitation of Liability` → matched |
| Tag-filtered searches lack semantic signal | Tags are metadata-only, not in the embedding | Header adds `Tags: legal, vendor` → embedding captures domain |

### Research-Backed Results

From the KITE benchmark (see research doc):
- **27.9% average improvement** across 4 diverse datasets
- **9x reranker relevance improvement** on chunks lacking subject references
- **142% improvement** on multi-document corpora with similar structure (10-K filings)

### Key Constraints
- **Zero regression** — disabled by default; current behavior preserved when `enabled: false`
- **No new dependencies** — uses existing parser libraries and LanceDB schema
- **Separation of concerns** — display text (`text`) stays clean; embedding text (`embeddingText`) carries the header
- **Config-driven** — every header component togglable independently
- **VPS-friendly** — minimal additional storage (~10-20% increase in text size)

---

## 2. Development Isolation Strategy

Development follows the **same isolation model** as the Hybrid Search plan.

### 2.1 Development Workspace

```
Development (safe):     /home/clawdbot/clawd/extensions/doc-rag/
Production (live):      ~/.openclaw/extensions/doc-rag/
```

1. **Create a development copy** of the plugin in `/home/clawdbot/clawd/extensions/doc-rag/`
2. **All changes made in the dev copy** — never touch `~/.openclaw/extensions/doc-rag/` during development
3. **Standalone tests run against the dev copy** using isolated temp directories
4. **Cutover:** copy modified files to production, restart gateway

### 2.2 Files That Change

| File | Change Type | Risk |
|------|------------|------|
| `chunker.ts` | Refactor `buildContextPrefix()` into new `buildContextualHeader()`, add `TextChunk.rawText` | Medium — core logic changes |
| `parser.ts` | Add section heading extraction to each format parser | Medium — parser changes |
| `pipeline.ts` | Wire section detection, separate `embeddingText` from `text`, build headers | Medium — pipeline flow changes |
| `store.ts` | Add `embeddingText` column, schema migration, update search to use it | Medium — schema change |
| `types.ts` | Add `embeddingText` to `DocChunk`, add `ParsedSection` type | Low — additive |
| `config.ts` | Add `chunking.contextualHeaders` config section | Low — additive |
| `openclaw.plugin.json` | Add `contextualHeaders` to `configSchema` | **Critical** — missing = config stripped |
| `index.ts` | No changes needed | None |

### 2.3 Config Toggle Safety

```json5
{
  "chunking": {
    // ... existing maxTokens, overlap, minChunkLength ...
    "contextualHeaders": {
      "enabled": false  // ← stays false until explicitly enabled
    }
  }
}
```

When `enabled: false`:
- No contextual headers built or prepended
- `embeddingText` = `text` (same as current behavior)
- Section detection still runs (populates `section` field) but headers aren't built
- **Exactly the same as current production**

### 2.4 Rollback Strategy

Disable contextual headers in < 30 seconds:

```bash
# 1. Set chunking.contextualHeaders.enabled: false in openclaw.json
# 2. Restart gateway
sudo supervisorctl restart openclaw
```

Existing chunks with `embeddingText` populated continue to work — the field is simply ignored when disabled. New ingestions produce chunks without headers.

---

## 3. Architecture

### 3.1 Current Chunking Flow

```
parseDocument(filePath)
  └─ text, pages[], format

chunkText(text, { docName, docContext })
  ├─ normalizeText()
  ├─ stripBoilerplate()
  ├─ buildContextPrefix(docName, docContext)  ← bakes "Document: X | Tags: Y" into text
  ├─ recursiveSplit()
  ├─ mergeSmallChunks()
  └─ applyOverlap()
  └─ returns TextChunk[] where text = prefix + raw chunk

pipeline.ingest()
  ├─ embed(chunk.text)      ← embeds text WITH prefix baked in
  └─ store(text: chunk.text) ← stores text WITH prefix baked in
      section: ""            ← always empty
```

**Problems:**
1. Context prefix is **baked into** `text` — can't separate header from content
2. `section` is **never populated** — heading detection doesn't exist
3. Same text used for display and embedding — LLM sees the metadata header
4. Tag changes require complete re-chunking and re-embedding

### 3.2 New Chunking Flow (with CCH)

```
parseDocument(filePath)
  └─ text, pages[], format, sections[]  ← NEW: sections extracted

detectSections(pages, format)
  └─ sections[]: { pageNumber, heading, level }  ← NEW function

chunkText(text, { docName })
  ├─ normalizeText()
  ├─ stripBoilerplate()
  ├─ NO context prefix in chunker anymore  ← CHANGE: chunker produces clean text
  ├─ recursiveSplit()
  ├─ mergeSmallChunks()
  └─ applyOverlap()
  └─ returns TextChunk[] where text = RAW chunk only

pipeline.ingest()
  ├─ buildSectionMap(chunks, sections)    ← NEW: assign section to each chunk
  ├─ buildContextualHeader(chunk, config) ← NEW: per-chunk header from metadata
  │     header = "Document: X\nSection: Y\nTags: a, b\n---"
  │     embeddingText = header + "\n" + chunk.rawText
  ├─ embed(embeddingText)                 ← embeds header + text
  └─ store(text: rawText,                 ← stores CLEAN text
  │         embeddingText: header+text,   ← stores FULL embedding text
  │         section: "detected heading")  ← populated now

pipeline.query()
  ├─ search uses embeddingText column     ← searches against contextual text
  └─ returns text column to user/LLM     ← displays clean text
```

### 3.3 Header Construction

```typescript
function buildContextualHeader(opts: {
  docName: string;
  section: string;
  tags: string[];
  page: number;
  config: ContextualHeadersConfig;
}): string {
  const lines: string[] = [];

  if (opts.config.includeDocName && opts.docName) {
    lines.push(`Document: ${opts.docName}`);
  }
  if (opts.config.includeSection && opts.section) {
    lines.push(`Section: ${opts.section}`);
  }
  if (opts.config.includeTags && opts.tags.length > 0) {
    lines.push(`Tags: ${opts.tags.join(", ")}`);
  }
  if (opts.config.includePage && opts.page > 0) {
    lines.push(`Page: ${opts.page}`);
  }

  if (lines.length === 0) return "";

  const separator = opts.config.separator || "---";
  return lines.join("\n") + "\n" + separator + "\n";
}
```

**Example output:**
```
Document: Atlanta Marriott Hotel - Stay Jan 12-14 2026
Section: Room Charges
Tags: expense, hotel
Page: 2
---
Room rate: $189.00/night × 2 nights = $378.00
Resort fee: $25.00/night × 2 nights = $50.00
Total room charges: $428.00
```

### 3.4 Section Detection Architecture

```
detectSections(pages: ParsedPage[], format: string): SectionInfo[]
  │
  ├─ PDF:  heuristicPdfSections(pages)
  │        - Regex: numbered sections, ALL CAPS lines, explicit markers
  │        - Returns heading + page association
  │
  ├─ DOCX: markdownDocxSections(text)
  │        - Use mammoth.convertToMarkdown() to get # headings
  │        - Parse heading hierarchy
  │
  ├─ PPTX: slideTitleSections(pages)
  │        - First line of each slide = title
  │        - Or parse <p:ph type="title"> from XML
  │
  └─ XLSX: sheetNameSections(pages)
           - Parse existing [Sheet: name] prefix
           - Sheet name = section
```

---

## 4. Configuration

### 4.1 New Config Section

Added under the existing `chunking` section:

```json5
{
  "chunking": {
    "maxTokens": 500,
    "overlap": 50,
    "minChunkLength": 50,
    "contextualHeaders": {
      "enabled": false,          // Master toggle (default: OFF)
      "includeDocName": true,    // Prepend document name
      "includeTags": true,       // Prepend document tags
      "includePage": true,       // Prepend page/sheet number
      "includeSection": true,    // Prepend detected section heading
      "separator": "---",        // Separator between header and content
      "maxHeaderLength": 500     // Truncate header if longer (chars)
    }
  }
}
```

### 4.2 Config Schema Addition (`config.ts`)

```typescript
export const ContextualHeadersConfigSchema = Type.Object({
  enabled: Type.Optional(
    Type.Boolean({ description: "Enable contextual chunk headers", default: false }),
  ),
  includeDocName: Type.Optional(
    Type.Boolean({ description: "Include document name in header", default: true }),
  ),
  includeTags: Type.Optional(
    Type.Boolean({ description: "Include document tags in header", default: true }),
  ),
  includePage: Type.Optional(
    Type.Boolean({ description: "Include page number in header", default: true }),
  ),
  includeSection: Type.Optional(
    Type.Boolean({ description: "Include detected section heading in header", default: true }),
  ),
  separator: Type.Optional(
    Type.String({ description: "Separator between header and chunk text", default: "---" }),
  ),
  maxHeaderLength: Type.Optional(
    Type.Number({ description: "Max header length in characters (truncated if exceeded)", default: 500 }),
  ),
});
```

### 4.3 Resolved Config Interface

```typescript
export interface DocRagConfig {
  // ... existing fields ...
  chunking: {
    maxTokens: number;
    overlap: number;
    minChunkLength: number;
    contextualHeaders: {
      enabled: boolean;            // default: false
      includeDocName: boolean;     // default: true
      includeTags: boolean;        // default: true
      includePage: boolean;        // default: true
      includeSection: boolean;     // default: true
      separator: string;           // default: "---"
      maxHeaderLength: number;     // default: 500
    };
  };
}
```

### 4.4 Plugin Manifest Update (`openclaw.plugin.json`)

**CRITICAL:** The `configSchema` in `openclaw.plugin.json` must include the new keys. If omitted, OpenClaw strips unknown keys on restart (learned from Hybrid Search).

Add to `configSchema.properties.chunking.properties`:

```json
"contextualHeaders": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enabled": { "type": "boolean" },
    "includeDocName": { "type": "boolean" },
    "includeTags": { "type": "boolean" },
    "includePage": { "type": "boolean" },
    "includeSection": { "type": "boolean" },
    "separator": { "type": "string" },
    "maxHeaderLength": { "type": "number" }
  }
}
```

---

## 5. Data Model Changes

### 5.1 New `embeddingText` Field on `doc_chunks`

| Column | Type | Purpose |
|--------|------|---------|
| `embeddingText` | `string` | **NEW** — contextual header + raw text. Used for embedding and search. |

**When CCH is enabled:**
- `text` = raw chunk content (clean, for display to users/LLM)
- `embeddingText` = contextual header + raw text (for embedding and vector/FTS search)

**When CCH is disabled:**
- `text` = raw chunk content (may include old-style `Document:` prefix from chunker)
- `embeddingText` = `""` (empty — pipeline uses `text` for embedding)

### 5.2 Updated `DocChunk` Type

```typescript
export interface DocChunk {
  id: string;
  docId: string;
  docTags: string;
  text: string;             // Raw chunk text (for display)
  embeddingText: string;    // NEW: header + text (for embedding/search)
  vector: number[];
  chunkIndex: number;
  page: number;
  section: string;          // NOW POPULATED (was always "")
  ocrDerived: boolean;
  createdAt: number;
}
```

### 5.3 Schema Migration

Uses the same pattern as the `fileHash` migration already in `store.ts`:

```typescript
// In doInitialize(), after opening doc_chunks table:
const probe = await this.chunksTable.query().limit(1).toArray();
if (probe.length > 0 && !("embeddingText" in probe[0])) {
  const allRows = await this.chunksTable.query().toArray();
  const patched = allRows.map(r => ({ ...r, embeddingText: "" }));
  await this.db.dropTable(CHUNKS_TABLE);
  this.chunksTable = await this.db.createTable(CHUNKS_TABLE, patched);
}
```

### 5.4 New Types

```typescript
/** Detected section heading from document parsing. */
export interface SectionInfo {
  /** Section heading text */
  heading: string;
  /** Heading level (1 = top-level, 2 = sub-section, etc.) */
  level: number;
  /** Page/slide/sheet number where this section starts */
  pageNumber: number;
  /** Character offset in the full text where this section starts */
  charOffset: number;
}
```

### 5.5 FTS Index Update

When CCH is enabled and hybrid search is also enabled, the FTS index should be built on `embeddingText` instead of `text` for consistency. If `embeddingText` is empty (CCH disabled), fall back to `text`.

### 5.6 Search Column Selection

```typescript
// In store.searchChunks() and store.hybridSearchChunks():
// Vector search always uses the `vector` column (embeddings) — no change
// FTS search column depends on data:
//   If embeddingText is populated → search on embeddingText (richer content)
//   If embeddingText is empty → search on text (backward compat)
```

---

## 6. Implementation Phases

### Phase 1: Test Harness Scaffold + Config Schema + Plugin Manifest
**Files:** `tests/validate-contextual-headers.ts`, `config.ts`, `openclaw.plugin.json`

- [ ] Write test scaffold (`tests/validate-contextual-headers.ts`):
  - Runner framework (same pattern as `validate-hybrid.ts`)
  - Isolated temp directory lifecycle
  - Helpers: `createTestPipeline()`, `assertHeaderContains()`, `assertRawTextClean()`
  - All 18+ test cases as stubs (marked `SKIP` until implementation)
- [ ] Write fixture generator (`tests/fixtures/generate-contextual-headers.ts`):
  - PDF with clear sections (numbered headings, ALL CAPS titles)
  - DOCX with Heading 1/2/3 styles
  - PPTX with distinct slide titles
  - XLSX with multiple named sheets
  - PDF with no detectable sections (plain paragraphs)
  - Document with unicode section headers
  - Document with very long section names
- [ ] Implement config extension (`config.ts`):
  - Add `ContextualHeadersConfigSchema`
  - Add `contextualHeaders` to `ChunkingConfigSchema`
  - Add to `DocRagConfig` interface and `parse()` function
  - Defaults: `enabled: false`, all includes `true`, separator `"---"`, maxHeaderLength `500`
- [ ] Update `openclaw.plugin.json`:
  - Add `contextualHeaders` to `configSchema.properties.chunking.properties`
- [ ] Write and run config tests (tests #1–#2)
- [ ] Run: `npx tsx tests/validate-contextual-headers.ts` → tests 1–2 pass, rest skipped
- [ ] Run MVP + hybrid regression tests to confirm no config breakage

### Phase 2: Section Detection + Types
**Files:** `parser.ts`, `types.ts`

- [ ] Add `SectionInfo` type to `types.ts`
- [ ] Add `embeddingText` field to `DocChunk` type in `types.ts`
- [ ] Write section detection tests (tests #3–#6):
  - Test #3: PDF section detection (numbered headings, ALL CAPS)
  - Test #4: DOCX section detection (Heading styles via markdown)
  - Test #5: PPTX section detection (slide titles)
  - Test #6: XLSX section detection (sheet names)
- [ ] Implement `detectSections()` function in `parser.ts`:
  - `heuristicPdfSections(pages)` — regex-based heading detection
  - `markdownDocxSections(filePath)` — mammoth markdown → heading extraction
  - `slideTitleSections(pages)` — first line of each slide page
  - `sheetNameSections(pages)` — parse `[Sheet: name]` prefix
- [ ] Extend `ParseResult` to include `sections: SectionInfo[]`
- [ ] Run: tests 1–6 pass

### Phase 3: Store Schema Migration + `embeddingText`
**File:** `store.ts`

- [ ] Write schema migration tests (tests #7–#8):
  - Test #7: New table creation includes `embeddingText` column
  - Test #8: Existing table without `embeddingText` gets migrated (backfill empty string)
- [ ] Implement `embeddingText` column:
  - Update schema seed in `doInitialize()` to include `embeddingText: ""`
  - Add migration path (read-all, patch, recreate) for existing tables
  - Update `rowToDocChunk()` to read `embeddingText`
  - Update `storeChunks()` to accept `embeddingText`
- [ ] Run: tests 1–8 pass

### Phase 4: Header Builder + Chunker Refactor
**Files:** `chunker.ts`, new `header-builder.ts`

- [ ] Write header construction tests (tests #9–#12):
  - Test #9: Full header with all components enabled
  - Test #10: Header with only doc name (other components disabled)
  - Test #11: Header with no section detected (section line omitted)
  - Test #12: Header exceeding `maxHeaderLength` is truncated
- [ ] Implement `buildContextualHeader()` in new `header-builder.ts`:
  - Takes doc name, section, tags, page, config
  - Returns formatted header string
  - Respects `maxHeaderLength` truncation
  - Handles empty/missing components gracefully
- [ ] Refactor `chunker.ts`:
  - When CCH is enabled, `buildContextPrefix()` returns empty string (header built separately in pipeline)
  - When CCH is disabled, existing `buildContextPrefix()` behavior preserved
  - Add `rawText` to `TextChunk` interface (text without any prefix)
- [ ] Run: tests 1–12 pass

### Phase 5: Pipeline Integration
**File:** `pipeline.ts`

- [ ] Write integration tests (tests #13–#16):
  - Test #13: Ingest PDF with CCH enabled → chunks have populated `embeddingText` and `section`
  - Test #14: Ingest with CCH disabled → `embeddingText` is empty, behavior identical to current
  - Test #15: Query with CCH enabled → results have clean `text` (no header), search uses `embeddingText`
  - Test #16: Tag update propagates to chunk headers (re-embeds or flags for re-embedding)
- [ ] Wire contextual headers into `pipeline.ingest()`:
  - Call `detectSections()` after parsing
  - Build `sectionMap` (like existing `pageMap`)
  - For each chunk: build contextual header → set `embeddingText`
  - Embed using `embeddingText` (not `text`)
  - Store `text` as clean raw text, `embeddingText` as header + text
- [ ] Update `pipeline.query()`:
  - Return `text` (clean) to the user, not `embeddingText`
- [ ] Update tag propagation in `store.updateTags()`:
  - When tags change and CCH is enabled, update `embeddingText` in affected chunks
  - Note: this does NOT re-embed automatically (would require API call) — just updates the stored text
  - Log a warning that re-ingestion is recommended for optimal search quality after tag changes
- [ ] Run: tests 1–16 pass

### Phase 6: Edge Cases, Regression, Search Quality
- [ ] Write remaining tests (tests #17–#18+):
  - Test #17: Document with no detectable sections → header omits section line, no error
  - Test #18: Unicode section headers handled correctly
- [ ] Write regression tests:
  - All 30 MVP tests still pass
  - All 25 hybrid search tests still pass
- [ ] Run full validation: all test suites green

### Phase 7: Controlled Cutover

| Step | Action | Risk | Rollback |
|------|--------|------|----------|
| 1 | All CCH tests + MVP tests + hybrid tests pass | None | N/A |
| 2 | Back up production plugin: `cp -r ~/.openclaw/extensions/doc-rag/ ~/backup-doc-rag-pre-cch/` | None | N/A |
| 3 | Copy modified files to `~/.openclaw/extensions/doc-rag/` | Low | Restore from backup |
| 4 | Update `openclaw.plugin.json` with new config schema | **Critical** | Restore from backup |
| 5 | Add `chunking.contextualHeaders.enabled: false` to config | None | Remove the section |
| 6 | Restart gateway — verify no regression (CCH still off) | Very Low | Restore old files, restart |
| 7 | Set `chunking.contextualHeaders.enabled: true` | Medium | Set `false`, restart |
| 8 | Restart gateway — CCH active for new ingestions | Medium | Set `false`, restart (< 30s) |
| 9 | Re-ingest existing 2 documents (delete + ingest) | Low | Old chunks still work |
| 10 | Manual Telegram test: query for doc-specific terms → verify improvement | Live | Set `false`, restart |

---

## 7. Test Cases (18 Cases)

### Category A: Config Parsing (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 1 | **Config defaults** — Parse config with no `contextualHeaders` section → `enabled: false`, `includeDocName: true`, `separator: "---"`, `maxHeaderLength: 500` | 1 | Backward-compatible defaults |
| 2 | **Config custom values** — Parse config with `contextualHeaders: { enabled: true, includeDocName: false, separator: "===" }` → all values respected | 1 | Custom config honored |

### Category B: Section Detection (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 3 | **PDF sections** — Generate PDF with "1. Introduction", "2. METHODOLOGY", "Section 3: Results" → detect 3 sections with correct headings and page numbers | 2 | Heuristic PDF heading detection |
| 4 | **DOCX sections** — Generate DOCX with Heading 1 "Overview", Heading 2 "Background", Heading 2 "Prior Work" → detect hierarchy correctly | 2 | Mammoth markdown heading extraction |
| 5 | **PPTX sections** — Generate PPTX with 3 slides titled "Introduction", "Methods", "Results" → detect 3 sections matching slide titles | 2 | Slide title extraction |
| 6 | **XLSX sections** — Generate XLSX with sheets "Revenue", "Expenses", "Summary" → detect 3 sections matching sheet names | 2 | Sheet name extraction |

### Category C: Schema & Migration (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 7 | **New table has embeddingText** — Create fresh DocStore → store a chunk with `embeddingText: "test"` → retrieve it → `embeddingText` preserved | 3 | Schema includes new column |
| 8 | **Migration backfills embeddingText** — Create table without `embeddingText` (old schema) → restart DocStore → probe shows `embeddingText: ""` on all rows | 3 | Backward-compatible migration |

### Category D: Header Construction (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 9 | **Full header** — Build header with docName="Report", section="Results", tags=["finance"], page=3 → output matches expected format with all lines and separator | 4 | Complete header formatting |
| 10 | **Partial header (doc name only)** — `includeSection: false, includeTags: false, includePage: false` → header has only `Document: X` line | 4 | Individual toggles work |
| 11 | **No section detected** — Build header with section="" → section line omitted, no empty line | 4 | Graceful empty section handling |
| 12 | **Long header truncation** — Section heading is 600 chars, `maxHeaderLength: 500` → header truncated with `...` | 4 | maxHeaderLength enforced |

### Category E: Pipeline Integration (4 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 13 | **Ingest with CCH enabled** — Ingest a PDF → retrieved chunks have non-empty `embeddingText` containing "Document:", populated `section` field | 5 | Full pipeline wiring |
| 14 | **Ingest with CCH disabled** — Ingest same PDF with `enabled: false` → `embeddingText` is empty, `text` contains old-style prefix | 5 | Disabled = current behavior |
| 15 | **Query returns clean text** — Ingest with CCH → query → returned `text` does NOT contain "Document:" header (clean content), but underlying search used `embeddingText` | 5 | Display text is clean |
| 16 | **Search quality improvement** — Ingest doc "ACME Corp Report" with CCH → query "ACME Corp revenue" → score higher than same query with CCH disabled (chunk text doesn't mention "ACME") | 5 | CCH actually improves retrieval |

### Category F: Edge Cases & Regression (2 tests)

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 17 | **No sections detected** — Ingest plain-text PDF (no headings, no structure) → `section` is empty, header omits section line, no crash | 6 | Graceful degradation |
| 18 | **Unicode in sections and headers** — Ingest DOCX with heading "Résumé des résultats — données 2025" → section detected correctly, header encoded properly | 6 | Unicode handling |

### 7.1 Fixture Documents

Generated programmatically (same pattern as hybrid search fixtures):

| Fixture | Format | Content | Purpose |
|---------|--------|---------|---------|
| `test-sections.pdf` | PDF | 3 pages: "1. Introduction" (page 1), "2. METHODOLOGY" (page 2), "Section 3: Results" (page 3) with body text under each | PDF section detection |
| `test-headings.docx` | DOCX | Heading 1: "Overview", Heading 2: "Background", Heading 2: "Prior Work", Heading 1: "Methods" with body text | DOCX heading extraction |
| `test-slides.pptx` | PPTX | 3 slides: "Introduction", "Methods", "Results" with bullet points | PPTX slide title extraction |
| `test-sheets.xlsx` | XLSX | 3 sheets: "Revenue", "Expenses", "Summary" with data rows | XLSX sheet name extraction |
| `test-no-sections.pdf` | PDF | 2 pages of plain paragraphs (no headings, no structure) | Edge case: no sections |
| `test-unicode-sections.docx` | DOCX | Headings with accented chars, em-dashes, non-Latin scripts | Unicode handling |
| `test-long-sections.pdf` | PDF | Section heading with 600+ characters (edge case) | Header truncation |

---

## 8. Failover & Recovery

### 8.1 Section Detection Failure

**Detection:** `detectSections()` throws or returns empty for a document that should have sections.

**Recovery:** Section detection is best-effort. If it fails:
- `section` field set to `""` (empty string)
- Header built without section line
- Chunk is still ingested and searchable — just without section context
- Warning logged: `[doc-rag] Section detection failed for page X: <error>`

### 8.2 Header Construction Failure

**Detection:** `buildContextualHeader()` throws (e.g., encoding issue).

**Recovery:** Fall back to no header:
- `embeddingText` = `text` (same text, no header)
- Warning logged
- Chunk still embedded and stored normally

### 8.3 Schema Migration Failure

**Detection:** `doInitialize()` fails during `embeddingText` migration.

**Recovery:**
- Log error with full details
- Fall back to old schema (table without `embeddingText`)
- All existing functionality continues to work
- CCH features degraded but non-fatal

### 8.4 `embeddingText` Column Missing at Query Time

If a chunk has `embeddingText: ""` (old chunk or CCH disabled):
- Vector search: uses `vector` column — works regardless
- FTS search: falls back to `text` column — works
- Display: uses `text` column — works

---

## 9. Rollback Strategy

### Instant Rollback (< 30 seconds)

```bash
# 1. Edit config: set chunking.contextualHeaders.enabled to false
# 2. Restart
sudo supervisorctl restart openclaw
```

**Effect:** All new ingestions produce chunks without contextual headers. Existing chunks with `embeddingText` are inert (vector search still uses existing embeddings). Query results show clean `text`.

### Full Rollback (remove all CCH code)

```bash
# 1. Restore original files from backup
cp ~/backup-doc-rag-pre-cch/*.ts ~/.openclaw/extensions/doc-rag/
cp ~/backup-doc-rag-pre-cch/openclaw.plugin.json ~/.openclaw/extensions/doc-rag/

# 2. Remove config section
# Delete chunking.contextualHeaders from openclaw.json

# 3. Restart
sudo supervisorctl restart openclaw

# 4. The embeddingText column remains in LanceDB (harmless — just ignored)
```

### Re-ingest After Rollback

If reverting to non-CCH embeddings is desired:
1. Delete all documents
2. Re-ingest from original files
3. Chunks will be generated without CCH (old behavior)

---

## 10. Success Criteria

### Test Harness

- [ ] All 18+ CCH tests pass (`validate-contextual-headers.ts` exits 0)
- [ ] All 30 MVP tests pass (`validate.ts` exits 0) — no regression
- [ ] All 25 hybrid search tests pass (`validate-hybrid.ts` exits 0) — no regression
- [ ] Test harness runs fully standalone — no gateway, no production data

### Functional Correctness

- [ ] Contextual headers prepended correctly for PDF, DOCX, PPTX, XLSX
- [ ] Section detection works for each format (at least basic heuristics)
- [ ] `text` field is clean (no header metadata) when displayed to user
- [ ] `embeddingText` field contains header + text for embedding
- [ ] `section` field populated with detected heading (or "" if none)
- [ ] Each header component independently togglable via config
- [ ] `maxHeaderLength` truncation works correctly

### Configuration

- [ ] `enabled: false` → identical behavior to current production
- [ ] `enabled: false` → no `embeddingText` generated, no section detection overhead
- [ ] `enabled: true` → full CCH pipeline active
- [ ] All 7 config options parsed correctly with defaults
- [ ] `openclaw.plugin.json` `configSchema` includes all new keys
- [ ] Config survives gateway restart (not stripped by schema validation)

### Data Model

- [ ] `embeddingText` column exists in new and migrated tables
- [ ] Old chunks (without `embeddingText`) continue to work
- [ ] Schema migration runs automatically on startup (transparent)
- [ ] FTS index uses `embeddingText` when available, falls back to `text`

### Search Quality

- [ ] Queries for document-specific terms (names, titles) show improved relevance
- [ ] Queries for section-level topics match chunks from the correct section
- [ ] Tag-enriched embeddings improve cross-document disambiguation
- [ ] No degradation in semantic search quality for general queries

### Resilience

- [ ] Section detection failure → graceful degradation (empty section, no crash)
- [ ] Header construction failure → fall back to no header
- [ ] Schema migration failure → fall back to old schema
- [ ] Rollback achievable in < 30 seconds

---

## 11. Development Order (Test-Driven)

All development in `/home/clawdbot/clawd/extensions/doc-rag/`. Live gateway **never touched** until Step 20.

### Phase 1: Scaffold + Config + Manifest (Steps 1–6)

```
 1. Copy current production plugin to dev workspace:
    cp -r ~/.openclaw/extensions/doc-rag/ /home/clawdbot/clawd/extensions/doc-rag/

 2. Write test harness scaffold (tests/validate-contextual-headers.ts):
    - Runner framework (identical pattern to validate-hybrid.ts)
    - Isolated temp directory lifecycle
    - Helpers: createTestPipeline(), assertHeaderContains(), assertRawTextClean()
    - All 18 test cases as stubs (marked SKIP)

 3. Write fixture generator (tests/fixtures/generate-contextual-headers.ts):
    - PDF with numbered sections, DOCX with heading styles, PPTX with slide titles
    - XLSX with named sheets, plain PDF (no sections), unicode-heavy DOCX

 4. Implement config extension (config.ts):
    - Add ContextualHeadersConfigSchema
    - Add contextualHeaders to ChunkingConfigSchema
    - Add to DocRagConfig interface + parse() function
    - Defaults: enabled=false, all includes=true, separator="---", maxHeaderLength=500

 5. Update openclaw.plugin.json:
    - Add contextualHeaders to configSchema.properties.chunking.properties
    - Include all 7 properties with correct types

 6. UN-SKIP config tests (#1, #2) → run validate-contextual-headers → fix → green
    ALSO run MVP + hybrid regression: all existing tests still green
```

### Phase 2: Types + Section Detection (Steps 7–10)

```
 7. Add types to types.ts:
    - SectionInfo interface
    - Add embeddingText to DocChunk interface

 8. UN-SKIP section detection tests (#3, #4, #5, #6)

 9. Implement detectSections() in parser.ts:
    - heuristicPdfSections(): regex-based (numbered, ALL CAPS, explicit markers)
    - markdownDocxSections(): mammoth.convertToMarkdown() + heading parsing
    - slideTitleSections(): first line / title shape extraction
    - sheetNameSections(): parse [Sheet: name] prefix
    - Add sections to ParseResult

10. Run validate-contextual-headers → tests 1-6 pass, 7-18 SKIP
```

### Phase 3: Schema Migration (Steps 11–13)

```
11. UN-SKIP schema tests (#7, #8)

12. Implement embeddingText column in store.ts:
    - Update schema seed to include embeddingText: ""
    - Add migration in doInitialize() for existing tables
    - Update rowToDocChunk() to include embeddingText
    - Update storeChunks() input type

13. Run validate-contextual-headers → tests 1-8 pass, 9-18 SKIP
```

### Phase 4: Header Builder (Steps 14–16)

```
14. UN-SKIP header tests (#9, #10, #11, #12)

15. Create header-builder.ts:
    - buildContextualHeader(opts) function
    - Handles all component toggles
    - Handles maxHeaderLength truncation
    - Handles empty/missing components

16. Refactor chunker.ts:
    - When CCH enabled: buildContextPrefix() returns "" (header built externally)
    - Add rawText to TextChunk (text before any prefix)
    - Run tests 1-12 pass
```

### Phase 5: Pipeline Wiring (Steps 17–19)

```
17. UN-SKIP integration tests (#13, #14, #15, #16)

18. Wire into pipeline.ts:
    - After parsing: call detectSections()
    - Build sectionMap (assign section to each chunk by position)
    - Build contextual header per chunk
    - Set embeddingText = header + rawText
    - Embed using embeddingText
    - Store text = rawText, embeddingText = header+text, section = detected heading
    - Query returns text (clean), search uses embeddingText

19. Run validate-contextual-headers → tests 1-16 pass
```

### Phase 6: Edge Cases + Full Regression (Steps 20–22)

```
20. UN-SKIP edge case tests (#17, #18)

21. Fix all failures, iterate until tests 1-18 all green

22. FINAL VALIDATION — all three test suites must pass:
    a. npx tsx tests/validate-contextual-headers.ts → 18+ passed, 0 failed (exit 0)
    b. npx tsx tests/validate-hybrid.ts             → 25 passed, 0 failed (exit 0)
    c. npx tsx tests/validate.ts                    → 30 passed, 0 failed (exit 0)
    All exit codes must be 0 before proceeding to cutover
```

### Phase 7: Controlled Cutover (Steps 23–28)

```
23. Back up production plugin:
    cp -r ~/.openclaw/extensions/doc-rag/ ~/backup-doc-rag-pre-cch/

24. Copy modified files to production:
    cp chunker.ts parser.ts pipeline.ts store.ts types.ts config.ts header-builder.ts
       openclaw.plugin.json → ~/.openclaw/extensions/doc-rag/

25. Add chunking.contextualHeaders config to openclaw.json (enabled: false)
    Restart gateway → verify no regression

26. Set chunking.contextualHeaders.enabled: true
    Restart gateway → CCH active for new ingestions

27. Re-ingest existing 2 documents:
    - Delete existing docs via doc_delete
    - Re-ingest from uploaded files via doc_ingest
    - Verify new chunks have embeddingText and section populated

28. Manual testing via Telegram:
    - Query for document-specific terms → verify improved relevance
    - Query for section topics → verify section-aware results
    - Confirm clean text displayed (no header metadata in results)
```

---

## 12. Plugin Manifest Config Schema Update

The complete updated `configSchema` for `openclaw.plugin.json`, showing the new `contextualHeaders` section within `chunking`:

```json
{
  "chunking": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxTokens": { "type": "number" },
      "overlap": { "type": "number" },
      "minChunkLength": { "type": "number" },
      "contextualHeaders": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "enabled": { "type": "boolean" },
          "includeDocName": { "type": "boolean" },
          "includeTags": { "type": "boolean" },
          "includePage": { "type": "boolean" },
          "includeSection": { "type": "boolean" },
          "separator": { "type": "string" },
          "maxHeaderLength": { "type": "number" }
        }
      }
    }
  }
}
```

This MUST be present in the plugin manifest. If omitted, OpenClaw's schema validation will strip `contextualHeaders` from the config on every restart, silently disabling the feature.

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Section detection produces wrong headings | Medium | Heuristic-based, best-effort; wrong section is better than no section; user can re-ingest |
| Header makes chunks too long for embedding model | Low | `maxHeaderLength` enforced; header chars deducted from chunk budget |
| `embeddingText` increases storage by ~15% | Low | Minimal for 181 chunks; within VPS budget |
| mammoth `convertToMarkdown()` output differs from `extractRawText()` | Medium | Test thoroughly; fall back to `extractRawText()` if markdown conversion fails |
| Tag changes don't re-embed automatically | Low | Log warning; recommend re-ingest; full re-embed is expensive and requires API calls |
| FTS index on `embeddingText` vs `text` confusion | Medium | Clear logic: prefer `embeddingText` if non-empty, fall back to `text` |
| PPTX title shape detection unreliable | Low | Fall back to first-line heuristic; cover 90% of cases |
| Config stripped on restart (missing schema) | **High** | **Plugin manifest update is Step 5 in cutover — never skip** |

---

## 14. Future Enhancements (Post CCH)

- **LLM-generated document summaries** — use LLM to generate a concise summary, include in header (like the reference implementation)
- **Hierarchical section paths** — full path like "Chapter 3 > Section 3.2 > Liability" instead of flat heading
- **Font-size-based PDF heading detection** — access `pdfjs-dist` transform data for more accurate PDF section detection
- **PDF bookmark/outline extraction** — use PDF document outline for authoritative section hierarchy
- **Automatic re-embedding on tag change** — when tags change, automatically re-embed affected chunks (requires async background job)
- **Per-document header template** — allow users to specify a custom header format per document
- **Section-level search** — query "show me all chunks from the Methods section" — filter by `section` field
