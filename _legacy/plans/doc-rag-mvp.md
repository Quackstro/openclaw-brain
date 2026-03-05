# 📄 Document RAG Plugin — MVP Plan

**Author:** Jarvis · **Requested by:** Dr. Castro  
**Date:** 2026-01-30  
**Status:** ✅ Complete  
**Completed:** 2026-02-01  

---

## 1. Overview

Build an OpenClaw plugin (`doc-rag`) that lets users upload documents (PDF, Word, Excel, PowerPoint), creates embeddings, and enables natural language Q&A over the document content. Designed to be lightweight for VPS deployment.

### Key Constraints
- **Lightweight**: no external services beyond OpenAI embeddings API (already available)
- **VPS-friendly**: LanceDB embedded (no vector DB server), lazy init, minimal RAM
- **Persistent by default**: documents and embeddings are stored permanently
- **Smart tagging**: documents support multiple tags with auto-suggestion based on content and prior tags
- **Capacity-aware**: configurable limits with cron-based health monitoring — user warned at 90% capacity
- **OCR support**: scanned PDFs handled via system tesseract (graceful fallback if unavailable)
- **Environment isolation**: development and testing fully isolated from the live gateway
- **MVP scope**: functional end-to-end, not production-polished

---

## 2. Development Isolation Strategy

Development and testing of this plugin must **not affect the running OpenClaw environment**. The following safeguards are enforced throughout the entire development lifecycle.

### 2.1 Plugin Disabled Until Cutover

The plugin config entry stays **disabled** throughout all development phases:

```json5
{
  plugins: {
    entries: {
      "doc-rag": {
        enabled: false,   // ← stays false until Phase 6 (integration test)
        config: { /* ... */ }
      }
    }
  }
}
```

The live gateway never loads, registers, or executes any `doc-rag` code until explicitly enabled. No restart is needed during development — the gateway is untouched.

### 2.2 Development Workspace

Plugin source code lives in the **agent working directory**, isolated from the OpenClaw extensions path:

```
Development (safe):     /home/clawdbot/clawd/extensions/doc-rag/
Production (live):      ~/.openclaw/extensions/doc-rag/  (only after cutover)
```

During development, the plugin directory is **never** symlinked or copied into `~/.openclaw/extensions/` or any path in `plugins.load.paths`. The gateway cannot discover it.

### 2.3 Standalone Test Harness (No Gateway Required)

The validation script (`tests/validate.ts`) runs as a **standalone Node process** — it does **not** boot the gateway, register tools, or interact with any live sessions:

```bash
# Runs completely standalone — no gateway, no live data
cd /home/clawdbot/clawd/extensions/doc-rag
npx tsx tests/validate.ts
```

Internally, the harness:
- Imports plugin modules directly (store, parser, tagger, etc.) — **not** via the plugin API
- Creates its own LanceDB instance, OpenAI embeddings client, and config
- Uses an isolated temp directory for all data (see 2.4)
- Never reads from or writes to production paths

### 2.4 Isolated Storage (Temp Directories)

All test runs use **ephemeral temp directories** that are cleaned up automatically:

```
Test storage:           /tmp/docrag-test-<uuid>/
                        ├── lancedb/       # Test vector DB
                        ├── uploads/       # Test uploads
                        └── fixtures/      # Generated test docs

Production storage:     ~/.openclaw/docrag/     (never touched during dev)
```

The harness creates a fresh temp directory per run using `mkdtemp` and deletes it on exit (including on failure, via `finally` block). No test artifacts accumulate on the VPS.

### 2.5 No Schema Conflicts

The plugin uses its own LanceDB tables (`doc_meta`, `doc_chunks`) in its **own directory** (`~/.openclaw/docrag/lancedb/`). This is completely separate from:
- `memory-lancedb` plugin (`~/.openclaw/memory/lancedb/`)
- Core OpenClaw memory (`MEMORY.md`, `memory/*.md`)
- Any other plugin data

No shared tables, no shared files, no shared config keys.

### 2.6 Dependency Isolation

New npm dependencies (`mammoth`, `xlsx`) are installed **inside the plugin directory** (`extensions/doc-rag/node_modules/`), not in the global OpenClaw `node_modules/`. This is the standard pattern used by existing plugins (e.g., `memory-lancedb` has its own `node_modules/`).

```bash
cd /home/clawdbot/clawd/extensions/doc-rag
npm install    # installs into ./node_modules/ only
```

The gateway's `node_modules/` is never modified during development.

### 2.7 Phased Cutover

Integration with the live gateway follows a controlled sequence:

| Step | Action | Risk | Rollback |
|------|--------|------|----------|
| 1 | All 30 standalone tests pass | None — gateway untouched | N/A |
| 2 | Copy/link plugin to `~/.openclaw/extensions/doc-rag/` | None — plugin still disabled | Delete the directory |
| 3 | Set `plugins.entries.doc-rag.enabled: true` in config | Plugin loads on next restart | Set `enabled: false`, restart |
| 4 | Restart gateway | Plugin active | Restart with `enabled: false` |
| 5 | Manual Telegram test (upload doc → query) | Live but reversible | Disable + restart (< 30s) |
| 6 | Confirm working → leave enabled | Production | Disable + restart if issues found |

**Rollback at any step** takes < 30 seconds: set `enabled: false` and restart the gateway. Document data in `~/.openclaw/docrag/` is inert when the plugin is disabled — it's just files on disk.

### 2.8 Environment Variables

The plugin reuses `${OPENAI_API_KEY}` which is already set for `memory-lancedb`. No new environment variables need to be added to the production environment during development. The test harness reads the key from the current environment (it needs embeddings to run) but writes nothing back.

### 2.9 Rollback & Cleanup

If the feature is abandoned or needs to be fully removed:

```bash
# 1. Disable plugin
# Set plugins.entries.doc-rag.enabled: false in config
# Restart gateway

# 2. Remove plugin code
rm -rf ~/.openclaw/extensions/doc-rag/

# 3. Remove stored data (optional)
rm -rf ~/.openclaw/docrag/

# 4. Remove config entry (optional)
# Delete plugins.entries.doc-rag from openclaw.json
```

No other files, tables, or configs are affected. The system returns to its exact pre-development state.

---

## 3. Architecture

```
User uploads file via chat (Telegram/Signal/etc.)
        │
        ▼
┌──────────────────────────────────┐
│   doc_ingest tool                │  ← Agent receives file, calls this tool
│                                  │
│  1. Detect format                │  (extension + magic bytes)
│  2. Check capacity               │  (reject if at hard limit)
│  3. Parse document               │  (pdfjs-dist, mammoth, xlsx, pptx-parser)
│  4. OCR fallback (PDF)           │  (detect sparse text → tesseract CLI)
│  5. Chunk text                   │  (recursive splitter, ~500 tokens, 50 overlap)
│  6. Auto-suggest tags            │  (content analysis + prior tag matching)
│  7. Embed chunks                 │  (OpenAI text-embedding-3-small)
│  8. Store in LanceDB             │  (table: "doc_chunks")
│  9. Store metadata + tags        │  (table: "doc_meta")
└──────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────┐
│   doc_query tool                 │  ← User asks a question
│                                  │
│  1. Embed query                  │
│  2. Vector search                │  (top-k chunks, optionally filtered by tags)
│  3. Return context               │  (chunks injected into agent context)
└──────────────────────────────────┘

        ┌──────────────────────────────────┐
        │   Health Monitor (Cron)          │  ← Runs on schedule
        │                                  │
        │  1. Count docs + chunks          │
        │  2. Measure disk usage           │
        │  3. Compare against limits       │
        │  4. Warn user at 90% threshold   │
        │  5. Block ingestion at 100%      │
        └──────────────────────────────────┘
```

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Vector DB | **LanceDB** (`@lancedb/lancedb`) | Already in node_modules, embedded, zero infra |
| Embeddings | **OpenAI text-embedding-3-small** | Already configured for memory-lancedb, 1536 dims, cheap |
| PDF parse | **pdfjs-dist** | Already a dependency in OpenClaw |
| PDF OCR | **tesseract-ocr** (system) + page rasterizer | Native C++, fast on VPS, ~30MB installed |
| DOCX parse | **mammoth** | ~200KB, pure JS, extracts clean text |
| XLSX parse | **xlsx** (SheetJS) | Industry standard, handles .xlsx + .xls |
| PPTX parse | **pptx-parser** or custom (unzip + XML) | Lightweight; fallback to unzip + xml2js |
| Chunking | Custom recursive splitter | No extra deps needed |
| Auto-tagging | **Keyword extraction + prior tag matching** (local, no LLM call) | Zero cost, fast, VPS-friendly |
| Health monitor | **OpenClaw cron** (`systemEvent`) | Built-in scheduler, no extra infra |

### Storage Layout

```
~/.openclaw/docrag/
├── lancedb/           # LanceDB tables (doc_chunks, doc_meta)
└── uploads/           # Raw uploaded files (permanent retention)
```

---

## 4. PDF OCR Strategy

### Detection-First Approach

Not all PDFs need OCR. The parser uses a two-pass strategy:

1. **Pass 1 — Text extraction** (`pdfjs-dist`): attempt standard text extraction per page
2. **Pass 2 — OCR fallback**: if a page yields < 50 characters of text, it's likely scanned → rasterize that page and run OCR

This means text-based PDFs are fast and free (no OCR overhead), and only scanned pages incur the OCR cost.

### OCR Pipeline

```
Sparse page detected (< 50 chars)
        │
        ▼
Rasterize page → PNG (pdf-to-img / sharp / canvas)
        │
        ▼
tesseract CLI → extracted text
        │
        ▼
Merge with any existing text from Pass 1
```

### System Dependency

```bash
# Ubuntu/Debian VPS
sudo apt install tesseract-ocr tesseract-ocr-eng

# Additional languages (optional)
sudo apt install tesseract-ocr-spa tesseract-ocr-deu tesseract-ocr-fra
```

### Graceful Degradation

The plugin declares `requires.anyBins: ["tesseract"]` in its metadata. Behavior:

| Tesseract installed? | Text PDF | Scanned PDF |
|---------------------|----------|-------------|
| ✅ Yes | Normal extraction | OCR fallback works |
| ❌ No | Normal extraction | Warning: "Scanned PDF detected but tesseract not installed. Install with: `apt install tesseract-ocr`" |

The plugin **never fails** due to missing OCR — it warns and returns whatever text it could extract.

### OCR Configuration

```json5
{
  ocr: {
    enabled: true,                    // Master toggle
    sparseThreshold: 50,              // Chars per page to trigger OCR
    language: "eng",                  // Tesseract language pack
    maxPagesOcr: 20,                  // Cap OCR pages per doc (VPS CPU guard)
    timeoutPerPageMs: 30000           // Kill OCR if a page takes > 30s
  }
}
```

---

## 5. Document Tagging

### Overview

Documents support **multiple category tags** for grouping by purpose. Tags are free-form strings assigned at ingestion or added/removed later. They enable filtered queries (search only within a tag group) and organized listing.

### Tag Rules

- A document can have **zero or more** tags
- Tags are **case-insensitive**, stored lowercase, trimmed
- Tags are **free-form** — no predefined taxonomy (user defines their own)
- Max **10 tags** per document (prevent abuse)
- Tag names: alphanumeric + hyphens + underscores, max 50 chars each

### Auto-Tagging

When a document is ingested **without explicit tags** (or even with some), the plugin can **auto-suggest** additional tags. This is enabled by default and can be disabled via settings.

#### How Auto-Tagging Works

The auto-tagger uses a **two-signal approach** — no LLM call needed, keeping it fast and free:

**Signal 1 — Content-based keyword extraction:**
- Extract the first ~2000 characters of parsed document text
- Run keyword/topic extraction using a lightweight rule-based approach:
  - Filename analysis (e.g., `Q4-Financial-Report.pdf` → `finance`, `quarterly`, `report`)
  - Document format hints (e.g., spreadsheets → `data`, `spreadsheet`; presentations → `presentation`)
  - Keyword frequency analysis on the extracted text (TF-based, with stop-word filtering)
  - Pattern matching for common document categories:
    - Financial terms (revenue, budget, invoice, P&L) → `finance`
    - Legal terms (contract, agreement, liability, clause) → `legal`
    - Technical terms (API, deployment, architecture, code) → `engineering`
    - HR terms (employee, benefits, onboarding, policy) → `hr`
    - Medical terms (patient, diagnosis, treatment) → `medical`
    - Sales terms (proposal, quote, pipeline, deal) → `sales`
    - Marketing terms (campaign, brand, audience, SEO) → `marketing`
- Produces 0–3 candidate tags from content analysis

**Signal 2 — Prior tag affinity:**
- Look at existing tags already used across all documents
- Compare the new document's content embedding against the centroid embeddings of each existing tag group
- If a tag group's centroid is highly similar (cosine similarity > 0.75) to the new document's summary embedding, suggest that tag
- Produces 0–2 candidate tags from affinity matching
- This gets smarter over time as more documents are tagged — new docs naturally gravitate toward established categories

#### Auto-Tag Flow

```
Document parsed → text extracted
        │
        ├─→ Signal 1: keyword/pattern extraction → 0–3 candidates
        │
        ├─→ Signal 2: prior tag affinity (embedding similarity) → 0–2 candidates
        │
        ▼
Merge candidates (deduplicate, cap at 5 suggestions)
        │
        ▼
Combine with user-provided tags (if any)
        │
        ▼
Return in doc_ingest response:
  tags: ["legal", "vendor"]              ← user-provided
  autoTags: ["contracts", "compliance"]  ← auto-suggested
  allTags: ["legal", "vendor", "contracts", "compliance"]  ← applied
```

#### Auto-Tag Behavior

| Scenario | Behavior |
|----------|----------|
| User provides tags, auto-tag ON | User tags applied + auto-suggestions merged (no duplicates) |
| User provides tags, auto-tag OFF | Only user-provided tags applied |
| No user tags, auto-tag ON | Auto-suggested tags applied |
| No user tags, auto-tag OFF | Document stored with no tags |

The `doc_ingest` response always shows which tags were auto-suggested vs user-provided, so the user has full transparency. The user can immediately remove unwanted auto-tags via `doc_tag`.

#### Tag Centroid Cache

To make Signal 2 fast, the plugin maintains an in-memory cache of tag centroids:

```typescript
type TagCentroid = {
  tag: string;
  centroid: number[];    // Average embedding of all docs with this tag
  docCount: number;      // Number of docs contributing to centroid
};
```

- **Built on startup** by averaging the summary embeddings of all docs sharing each tag
- **Updated incrementally** when documents are ingested, tagged, or deleted
- **Lightweight**: one 1536-dim vector per unique tag (e.g., 20 tags = ~120KB)
- **No persistence needed**: rebuilt from LanceDB on gateway restart

#### Configuration

```json5
{
  tags: {
    maxPerDocument: 10,              // Max tags per document
    maxTagLength: 50,                // Max characters per tag name
    autoTag: {
      enabled: true,                 // Master toggle for auto-tagging
      maxSuggestions: 5,             // Max auto-suggested tags per document
      contentCandidates: 3,          // Max tags from keyword extraction
      affinityCandidates: 2,         // Max tags from prior tag matching
      affinityThreshold: 0.75,       // Cosine similarity threshold for tag affinity
      patterns: {                    // Keyword → tag pattern overrides (optional)
        // Users can add custom patterns to supplement built-in ones
        // "blockchain": "crypto",
        // "kubernetes": "devops"
      }
    }
  }
}
```

### Manual Tag Examples

```
"Upload this contract and tag it as legal and vendor"
→ doc_ingest(filePath, tags: ["legal", "vendor"])

"What do our legal documents say about termination clauses?"
→ doc_query(query: "termination clauses", tags: ["legal"])

"Show me all finance documents"
→ doc_list(tags: ["finance"])

"Tag the Q4 report as finance and quarterly"
→ doc_tag(docId, tags: ["finance", "quarterly"])

"Remove the draft tag from the proposal"
→ doc_tag(docId, removeTags: ["draft"])
```

### Tag-Filtered Queries

When `doc_query` includes `tags`, the vector search is **scoped** to chunks belonging to documents with **any** of the specified tags (OR logic). This lets users compartmentalize knowledge:

- "Search my **legal** docs for liability clauses"
- "What do the **finance** reports say about Q4 revenue?"
- "Find references to authentication in **engineering** docs"

### Tag Storage

Tags are stored as a **JSON-serialized string array** on `doc_meta` (LanceDB doesn't natively support array columns). On read, they're parsed back to `string[]`.

```
doc_meta.tags = '["legal","vendor","2026"]'
```

Chunk-level filtering works by:
1. Query `doc_meta` for documents matching any requested tag
2. Collect matching `docId`s
3. Filter `doc_chunks` vector search to those `docId`s

---

## 6. Storage & Capacity Management

### Persistent by Default

All ingested documents and their embeddings are stored **permanently**. Users explicitly delete documents they no longer need via `doc_delete`. There is no TTL or auto-expiry.

### Capacity Limits

Configurable hard limits prevent the VPS from running out of resources:

```json5
{
  capacity: {
    maxDocuments: 100,            // Max total documents
    maxTotalChunks: 25000,        // Max total chunks across all docs
    maxStorageMb: 500,            // Max disk usage for docrag directory
    warnThresholdPct: 90          // Alert user at this % of any limit
  }
}
```

### Capacity States

| State | Condition | Behavior |
|-------|-----------|----------|
| 🟢 **Healthy** | All metrics < 90% of limits | Normal operation |
| 🟡 **Warning** | Any metric ≥ 90% of limit | Cron alerts user, ingestion still allowed |
| 🔴 **Full** | Any metric ≥ 100% of limit | Ingestion blocked, user notified with details |

### Ingestion Capacity Check

Every `doc_ingest` call checks capacity **before** processing:

```
1. Count current docs → compare to maxDocuments
2. Count current chunks → compare to maxTotalChunks  
3. Measure disk usage → compare to maxStorageMb
4. If any at 100%: reject with clear message + breakdown
5. If any at 90%+: ingest succeeds but response includes warning
```

---

## 7. Health Monitor (Cron Job)

A cron job runs on a schedule to check capacity and alert the user proactively.

### Cron Configuration

Registered automatically when the plugin starts. Schedule configurable:

```json5
{
  healthCheck: {
    enabled: true,
    schedule: "0 */6 * * *",        // Every 6 hours (default)
    alertChannel: "telegram"          // Where to send warnings (optional, uses default)
  }
}
```

### Health Check Logic

```
Cron fires
    │
    ▼
Collect metrics:
  - documentCount / maxDocuments
  - chunkCount / maxTotalChunks
  - diskUsageMb / maxStorageMb
    │
    ▼
Any metric ≥ 90%?
  ├── No  → silent (no message)
  └── Yes → send alert to user
              │
              ▼
        ┌─────────────────────────────────────────┐
        │ ⚠️ Document RAG — Capacity Warning       │
        │                                         │
        │ 📄 Documents: 92/100 (92%)              │
        │ 🧩 Chunks: 18,400/25,000 (74%)         │
        │ 💾 Disk: 423MB/500MB (85%)              │
        │                                         │
        │ 🏷️ Top tags by doc count:               │
        │   legal (34) · finance (28) · hr (18)   │
        │                                         │
        │ Consider deleting old documents:        │
        │ Ask me to "list documents" or           │
        │ "delete [document name]"                │
        └─────────────────────────────────────────┘
```

### Alert Rules

- **Only alert when something crosses the threshold** — not on every check
- **Cooldown**: don't re-alert for the same metric within 24 hours (avoid spam)
- **Escalate**: if a metric reaches 95%, alert again regardless of cooldown
- **Full state**: if any metric hits 100%, alert immediately with "ingestion is now blocked"

### Implementation

The health monitor is registered as an OpenClaw cron job (`systemEvent`) by the plugin at startup:

```typescript
// In plugin register():
api.on("gateway:ready", async () => {
  // Register cron job for health monitoring
  // Uses OpenClaw's built-in cron system
});
```

The cron fires a `systemEvent` into the main session with the health report text. The agent sees it as a system message and relays the alert to the user.

---

## 8. Plugin Structure

```
extensions/doc-rag/
├── openclaw.plugin.json    # Plugin manifest + config schema
├── package.json            # Dependencies
├── index.ts                # Plugin entry (register tools, CLI, service, cron)
├── parser.ts               # Document parsing (PDF/DOCX/XLSX/PPTX)
├── ocr.ts                  # OCR detection + tesseract integration
├── chunker.ts              # Text chunking logic
├── store.ts                # LanceDB wrapper (ingest, search, delete, count, disk usage)
├── tags.ts                 # Tag normalization, validation, query filtering
├── auto-tagger.ts          # Auto-tag engine (keyword extraction + prior tag affinity)
├── health.ts               # Capacity checking + health report generation
├── config.ts               # Config schema + defaults
├── types.ts                # Shared types
└── tests/
    ├── validate.ts         # Autonomous validation script
    ├── fixtures/           # Sample test documents (generated programmatically)
    │   └── generate.ts     # Fixture generator (PDF, DOCX, XLSX, PPTX, scanned PDF)
    └── parser.test.ts      # Unit tests for parsers
```

---

## 9. Agent Tools (6 tools)

### `doc_ingest`
Upload and process a document for Q&A.

```typescript
parameters: {
  filePath: string;        // Path to uploaded file (agent receives via chat)
  name?: string;           // Human-friendly name (auto-detected from filename)
  tags?: string[];         // Category tags (e.g., ["legal", "vendor"])
  description?: string;    // Optional context about the document
}
```

Returns:
```typescript
{
  docId, name, format, chunks, pages, ocrPages,
  tags: string[],          // User-provided tags
  autoTags: string[],      // Auto-suggested tags (empty if auto-tag disabled)
  allTags: string[],       // Combined tags applied to the document
  capacityWarning?: string
}
```

Rejects with capacity details if storage is full.

### `doc_query`
Ask questions about ingested documents.

```typescript
parameters: {
  query: string;           // Natural language question
  docId?: string;          // Specific document (or search all)
  tags?: string[];         // Filter to docs with any of these tags (OR logic)
  limit?: number;          // Max chunks to return (default: 5)
}
```

Returns: relevant chunks with source attribution (doc name, tags, page/sheet, chunk index, similarity score)

### `doc_list`
List all ingested documents with metadata.

```typescript
parameters: {
  tags?: string[];         // Filter by tags (OR logic — docs matching any tag)
}
```

Returns: `[{ docId, name, format, tags, chunks, pages, createdAt, sizeBytes }]`

### `doc_delete`
Remove a document and its embeddings.

```typescript
parameters: {
  docId: string;
  // OR
  query?: string;          // Fuzzy match by name
}
```

### `doc_tag`
Add or remove tags on an existing document.

```typescript
parameters: {
  docId: string;           // Document to update
  tags?: string[];         // Tags to add
  removeTags?: string[];   // Tags to remove
}
```

Returns: `{ docId, name, tags }` (updated tag list)

### `doc_status`
Show current capacity, health, and tag summary.

```typescript
parameters: {}
```

Returns:
```typescript
{
  documents: { count, max, pct },
  chunks: { count, max, pct },
  disk: { usedMb, maxMb, pct },
  status: "healthy" | "warning" | "full",
  tags: { name: string, docCount: number }[],   // All tags with document counts
  autoTagEnabled: boolean
}
```

---

## 10. Data Model

### `doc_meta` table (LanceDB)

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Document ID |
| name | string | Display name |
| format | string | pdf/docx/xlsx/pptx |
| tags | string | JSON-serialized string array (e.g., `'["legal","vendor"]'`) |
| autoTags | string | JSON-serialized array of tags that were auto-suggested |
| filePath | string | Original upload path |
| chunkCount | number | Total chunks |
| pageCount | number | Total pages/sheets |
| ocrPageCount | number | Pages that needed OCR |
| sizeBytes | number | Original file size |
| createdAt | number | Unix timestamp |
| vector | number[] | Embedding of document description/summary for search |

### `doc_chunks` table (LanceDB)

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Chunk ID |
| docId | string | Parent document ID |
| docTags | string | JSON-serialized copy of parent doc's tags (denormalized for fast filtering) |
| text | string | Chunk text content |
| vector | number[] | Embedding vector (1536 dims) |
| chunkIndex | number | Order within document |
| page | number | Source page/sheet number |
| section | string | Section header (if detectable) |
| ocrDerived | boolean | Whether this text came from OCR |
| createdAt | number | Unix timestamp |

**Note on `docTags` denormalization:** Storing tags on chunks avoids a join between `doc_meta` and `doc_chunks` during tag-filtered vector search. When tags are updated via `doc_tag`, the plugin updates both `doc_meta.tags` and all matching `doc_chunks.docTags`. This is acceptable because tag updates are infrequent compared to queries.

---

## 11. Config Schema (Full)

```json5
{
  plugins: {
    entries: {
      "doc-rag": {
        enabled: true,
        config: {
          embedding: {
            apiKey: "${OPENAI_API_KEY}",     // Reuse existing key
            model: "text-embedding-3-small"
          },
          storage: {
            dbPath: "~/.openclaw/docrag/lancedb",
            uploadsDir: "~/.openclaw/docrag/uploads"
          },
          chunking: {
            maxTokens: 500,                  // Chunk size
            overlap: 50,                     // Token overlap between chunks
            minChunkLength: 50               // Skip tiny chunks
          },
          ocr: {
            enabled: true,                   // Master toggle for OCR
            sparseThreshold: 50,             // Chars per page to trigger OCR
            language: "eng",                 // Tesseract language pack
            maxPagesOcr: 20,                 // Cap OCR pages per doc (CPU guard)
            timeoutPerPageMs: 30000          // Kill OCR if page takes > 30s
          },
          tags: {
            maxPerDocument: 10,              // Max tags per document
            maxTagLength: 50,                // Max characters per tag name
            autoTag: {
              enabled: true,                 // Master toggle for auto-tagging
              maxSuggestions: 5,             // Max auto-suggested tags per document
              contentCandidates: 3,          // Max tags from keyword extraction
              affinityCandidates: 2,         // Max tags from prior tag matching
              affinityThreshold: 0.75,       // Cosine similarity for tag affinity
              patterns: {}                   // Custom keyword → tag overrides
            }
          },
          capacity: {
            maxDocuments: 100,               // Max total documents stored
            maxTotalChunks: 25000,           // Max total chunks across all docs
            maxStorageMb: 500,               // Max disk for docrag directory
            warnThresholdPct: 90             // Alert user at this %
          },
          healthCheck: {
            enabled: true,                   // Enable cron health monitor
            schedule: "0 */6 * * *",         // Every 6 hours
            cooldownHours: 24,               // Don't re-alert same metric within this window
            escalateThresholdPct: 95         // Re-alert regardless of cooldown at this %
          }
        }
      }
    }
  }
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Core infrastructure) ✅
**Files:** `config.ts`, `types.ts`, `store.ts`, `tags.ts`, `health.ts`, `openclaw.plugin.json`, `package.json`

- [x] Define types and config schema (including tag + auto-tag types)
- [x] Implement tag utilities (normalize, validate, serialize/deserialize, match)
- [x] Implement LanceDB wrapper (connect, create tables, store, search, delete, count, diskUsage)
- [x] Add tag-aware methods to store (filterByTags, updateTags, getTagCentroids)
- [x] Implement capacity checker (count docs, count chunks, measure disk, return health status)
- [x] Reuse the pattern from `memory-lancedb` for lazy init and schema creation
- [x] **Validation**: Unit test store operations + tag operations + capacity checks with mock data

### Phase 2: Document Parsing + OCR ✅
**Files:** `parser.ts`, `ocr.ts`, `chunker.ts`

- [x] PDF parser (pdfjs-dist — extract text per page)
- [x] OCR detection (sparse page check: < 50 chars per page)
- [x] OCR pipeline (rasterize page → tesseract CLI → extract text)
- [x] Graceful fallback when tesseract is not installed
- [x] DOCX parser (mammoth — extract raw text)
- [x] XLSX parser (xlsx/SheetJS — extract cell data as text per sheet)
- [x] PPTX parser (unzip + XML parse for slide text)
- [x] Format detection by extension + magic bytes
- [x] Recursive text chunker with overlap
- [x] **Validation**: Parse each fixture file (including scanned PDF), assert non-empty text, correct page counts

### Phase 3: Auto-Tagging Engine ✅
**Files:** `auto-tagger.ts`

- [x] Keyword extraction from document text (TF-based with stop-word filtering)
- [x] Filename analysis (split on separators, map to tag candidates)
- [x] Format-based hints (spreadsheet → `data`; presentation → `presentation`)
- [x] Built-in pattern matching (finance/legal/engineering/hr/medical/sales/marketing keywords)
- [x] Custom pattern support via config (`patterns` override map)
- [x] Prior tag affinity: compute cosine similarity between doc summary embedding and tag centroids
- [x] Tag centroid cache (build on startup, incremental update on ingest/tag/delete)
- [x] Merge + deduplicate candidates, cap at `maxSuggestions`
- [x] Respect `enabled` toggle — return empty suggestions when disabled
- [x] **Validation**: Auto-tag a finance doc → expect "finance" suggested; auto-tag with prior tags → expect affinity matches

### Phase 4: Plugin Wiring ✅
**Files:** `index.ts`

- [x] Register all 6 tools (`doc_ingest`, `doc_query`, `doc_list`, `doc_delete`, `doc_tag`, `doc_status`)
- [x] Wire capacity check into `doc_ingest` (pre-check + warning on response)
- [x] Wire auto-tagger into `doc_ingest` pipeline (after parse, before embed)
- [x] Wire tag filtering into `doc_query` and `doc_list`
- [x] Wire tag update logic into `doc_tag` (update meta + denormalized chunk tags + centroid cache)
- [x] Register CLI commands (`openclaw docrag list|stats|status|tags|purge`)
- [x] Wire up OpenAI embeddings (reuse pattern from memory-lancedb)
- [x] **Validation**: Integration test — ingest with auto-tags → verify suggestions → tag-filtered query → correct results

### Phase 5: Health Monitor + End-to-End Validation ✅
**Files:** `tests/validate.ts`, `tests/fixtures/generate.ts`

- [x] Register cron job for health monitoring on plugin startup
- [x] Health report generation with threshold detection + cooldown logic + tag summary
- [x] Autonomous test harness (runnable by agent via `exec`)
- [x] Creates sample documents programmatically (including scanned PDF)
- [x] Ingests each format with various tags
- [x] Queries with known-answer questions (with and without tag filters)
- [x] Validates: chunk count, search relevance, metadata accuracy, OCR extraction, tag filtering, auto-tagging
- [x] Tests tag operations (add, remove, update propagation to chunks)
- [x] Tests auto-tag suggestions + disabled mode
- [x] Tests capacity warning at 90%
- [x] Tests ingestion block at 100%
- [x] Tests `doc_status` output accuracy (including tag summary + autoTagEnabled)
- [x] Tests deletion (including centroid cache update)
- [x] Tests OCR graceful degradation
- [x] Reports pass/fail per test case with clear output
- [x] **Exit code 0 = all pass, 1 = failures**

---

## 13. Autonomous Validation Harness

The validation script (`tests/validate.ts`) is designed so the agent can run it during development to verify correctness at each phase:

```bash
# Run from the plugin directory
npx tsx tests/validate.ts
```

### Test Cases

| # | Test | Phase | Validates |
|---|------|-------|-----------|
| 1 | Parse text PDF → non-empty text | 2 | PDF parser (text layer) |
| 2 | Parse scanned PDF → non-empty text via OCR | 2 | OCR pipeline |
| 3 | Parse scanned PDF without tesseract → warning, no crash | 2 | OCR graceful degradation |
| 4 | Parse DOCX → non-empty text | 2 | DOCX parser |
| 5 | Parse XLSX → non-empty text, sheet names | 2 | XLSX parser |
| 6 | Parse PPTX → non-empty text, slide count | 2 | PPTX parser |
| 7 | Chunk text → correct count + overlap | 2 | Chunker |
| 8 | Store chunks → count matches | 1 | LanceDB store |
| 9 | Search chunks → returns relevant results | 1 | Vector search |
| 10 | Tag normalize + validate (case, length, chars) | 1 | Tag utilities |
| 11 | Auto-tag finance doc → suggests "finance" tag | 3 | Content keyword extraction |
| 12 | Auto-tag legal DOCX → suggests "legal" tag | 3 | Pattern matching |
| 13 | Auto-tag with prior tags → affinity match suggests existing tags | 3 | Tag centroid affinity |
| 14 | Auto-tag disabled → no suggestions returned | 3 | Config toggle |
| 15 | Filename-based auto-tag ("Q4-Financial-Report.pdf" → "finance") | 3 | Filename analysis |
| 16 | Ingest text PDF with explicit + auto tags end-to-end | 4 | Full pipeline + tagging |
| 17 | Ingest scanned PDF end-to-end → OCR chunks present | 4 | Full pipeline + OCR |
| 18 | Query all docs → returns results from multiple docs | 4 | RAG retrieval (unfiltered) |
| 19 | Query with tag filter → only matching docs returned | 4 | Tag-filtered search |
| 20 | Query with multiple tags → OR logic (union) | 4 | Multi-tag filter |
| 21 | List documents → shows all with tags (user + auto) | 4 | Metadata |
| 22 | List documents filtered by tag | 4 | Tag-filtered listing |
| 23 | `doc_tag` add tags → tags updated on meta + chunks + centroid | 4 | Tag update + propagation |
| 24 | `doc_tag` remove tags → tags removed from meta + chunks + centroid | 4 | Tag removal + propagation |
| 25 | Delete document → removed from search + centroid updated | 4 | Cleanup |
| 26 | `doc_status` returns accurate counts + tag summary + autoTagEnabled | 4 | Capacity + tag reporting |
| 27 | Capacity warning at 90% → warning in ingest response | 5 | Health threshold |
| 28 | Capacity full at 100% → ingestion blocked with message | 5 | Hard limit enforcement |
| 29 | Health monitor generates correct report text + tag breakdown | 5 | Cron alert content |
| 30 | Health cooldown → no duplicate alerts within window | 5 | Alert deduplication |

### Fixture Documents

Generated programmatically in `tests/fixtures/generate.ts` to avoid binary files in repo:

- **Text PDF** (`Q4-Financial-Report.pdf`): `pdf-lib` → 3-page PDF with financial content (revenue figures, P&L, budget) — explicit tags: `["quarterly"]` — expected auto-tags: `["finance", "report"]`
- **Scanned PDF**: `pdf-lib` → PDF with text rendered as an embedded image — tags: `["scanned"]`
- **DOCX** (`Service-Agreement.docx`): `docx` npm package → Word doc with legal language (clauses, liability, parties) — no explicit tags — expected auto-tags: `["legal", "contracts"]`
- **XLSX** (`Sales-Pipeline-2026.xlsx`): `xlsx` → spreadsheet with named sheets and sales data — explicit tags: `["2026"]` — expected auto-tags: `["sales", "data"]`
- **PPTX** (`Architecture-Overview.pptx`): `pptxgenjs` → presentation with technical content (APIs, deployment, microservices) — no explicit tags — expected auto-tags: `["engineering", "presentation"]`

This ensures tests are self-contained and reproducible, and validates auto-tagging across formats.

---

## 14. File Handling (Chat Integration)

When a user sends a document via Telegram/Signal/etc:
1. OpenClaw downloads the file to a temp path
2. The agent sees the file attachment in its context
3. The user may specify tags naturally: *"Upload this and tag it as legal and vendor"*
4. The agent calls `doc_ingest` with the file path and any user-provided tags
5. The plugin checks capacity, processes the file (with OCR if needed), runs auto-tagging, stores permanently
6. Agent confirms with transparency on tag sources:
   - *"Ingested Service-Agreement.docx — 32 chunks from 8 pages. Tagged: legal, vendor (you) + contracts, compliance (auto-suggested). Ask me anything about it!"*
7. If capacity is at 90%+, agent adds: *"⚠️ Storage is at 92% — consider removing old documents."*

### Tag Management via Natural Language

The agent interprets natural language tag operations:

| User says | Agent action |
|-----------|-------------|
| *"Upload this contract, tag it legal and vendor"* | `doc_ingest(filePath, tags: ["legal", "vendor"])` + auto-tags |
| *"Tag the Q4 report as finance"* | `doc_tag(docId, tags: ["finance"])` |
| *"Remove the draft tag from the proposal"* | `doc_tag(docId, removeTags: ["draft"])` |
| *"Remove auto-tags from the contract"* | `doc_tag(docId, removeTags: [autoTags])` |
| *"What do my legal docs say about liability?"* | `doc_query("liability", tags: ["legal"])` |
| *"Show me all finance documents"* | `doc_list(tags: ["finance"])` |
| *"What tags do I have?"* | `doc_status()` → tag summary |
| *"Turn off auto-tagging"* | Agent advises config change |

---

## 15. Dependencies

### Production (new, not already in OpenClaw)

| Package | Size | Purpose |
|---------|------|---------|
| `mammoth` | ~200KB | DOCX → text |
| `xlsx` | ~1MB | XLSX/XLS → text |

### System (optional, for OCR)

| Package | Size | Purpose |
|---------|------|---------|
| `tesseract-ocr` | ~30MB | OCR engine |
| `tesseract-ocr-eng` | ~4MB | English language data |

### Dev/Test Only

| Package | Size | Purpose |
|---------|------|---------|
| `pdf-lib` | ~300KB | Generate test PDFs |
| `pptxgenjs` | ~500KB | Generate test PPTX |
| `docx` | ~200KB | Generate test DOCX |

**Already available:** `@lancedb/lancedb`, `openai`, `pdfjs-dist`, `@sinclair/typebox`

Total new production deps: **~1.2MB** (mammoth + xlsx)  
Total system deps for OCR: **~34MB** (one-time apt install)  
Auto-tagger: **0 new deps** (uses existing OpenAI embeddings + built-in keyword logic)

---

## 16. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large docs → OOM on VPS | High | Max file size config (default 25MB), streaming parse, chunk limit |
| Disk fills up over time | High | Capacity limits + cron health monitor + user alerts at 90% |
| Auto-tag false positives | Medium | Clear labeling of auto vs user tags; easy removal via `doc_tag`; tunable threshold |
| Auto-tag keyword patterns too rigid | Low | Custom `patterns` config override; affinity signal adapts to user's actual tag taxonomy |
| Tag centroid drift over time | Low | Centroids rebuilt on restart; incremental updates keep them fresh between restarts |
| Tag proliferation | Low | Max 10 tags/doc, max 50 chars/tag; `doc_status` shows tag inventory |
| Tag update propagation slow | Low | Denormalized tags on chunks; bulk update acceptable (tag changes are infrequent) |
| OCR slow on VPS CPU | Medium | `maxPagesOcr` cap (default 20), per-page timeout (30s), async processing |
| OpenAI embedding costs | Medium | Batch embeddings, cache, small model (3-small = $0.02/1M tokens) |
| PPTX parsing complexity | Low | Start with text-only extraction; skip images/charts for MVP |
| LanceDB table growth | Medium | `maxTotalChunks` hard cap + `doc_status` visibility |
| File format edge cases | Low | Graceful fallback: return error with supported formats list |
| Tesseract not installed | Low | Graceful degradation: warn, still process text-based content |
| Alert fatigue | Low | 24h cooldown between repeated alerts, only escalate at 95% |

---

## 17. Development Order (for agent execution)

All development happens in `/home/clawdbot/clawd/extensions/doc-rag/` (see Section 2 — Development Isolation Strategy). The live gateway is **never touched** until Phase 6. Each step ends with the agent running `npx tsx tests/validate.ts` in the plugin directory and iterating until green. The test harness uses isolated temp directories — zero contact with production data.

### Phase 1–5: Standalone Development (gateway untouched) ✅

```
 1. ✅ Scaffold plugin in /home/clawdbot/clawd/extensions/doc-rag/ (package.json, manifest, index.ts shell)
 2. ✅ Implement config.ts + types.ts (including tag + auto-tag config)
 3. ✅ Implement tags.ts (normalize, validate, serialize, deserialize, match)
 4. ✅ Implement store.ts (LanceDB wrapper with tag-aware methods + centroid queries)
 5. ✅ Implement health.ts (capacity checker + report generator with tag summary)
 6. ✅ Write store + tags + health unit tests → run validate → fix
 7. ✅ Implement parser.ts — PDF text extraction first
 8. ✅ Implement ocr.ts — detection + tesseract pipeline + graceful fallback
 9. ✅ Implement parser.ts — DOCX, XLSX, PPTX parsers
10. ✅ Implement chunker.ts
11. ✅ Write parser + chunker + OCR tests → run validate → fix
12. ✅ Implement auto-tagger.ts — keyword extraction + filename analysis + format hints + pattern matching
13. ✅ Implement auto-tagger.ts — prior tag affinity (centroid cache + cosine similarity)
14. ✅ Write auto-tagger tests → run validate → fix
15. ✅ Wire tools in index.ts (doc_ingest + doc_query first, with auto-tags + capacity pre-check)
16. ✅ Write integration tests (ingest with auto-tags, tag-filtered query) → run validate → fix
17. ✅ Add doc_list + doc_delete + doc_tag + doc_status tools
18. ✅ Write tag management tests (add/remove/propagation/centroid update) → run validate → fix
19. ✅ Write capacity + status tests → run validate → fix
20. ✅ Register health monitor cron job on plugin startup
21. ✅ Write health monitor tests (alert generation, cooldown, escalation, tag breakdown) → run validate → fix
22. ✅ Add CLI commands
23. ✅ Full validation pass → all 30 tests green
```

### Phase 6: Controlled Cutover (gateway integration) ✅

```
24. ✅ Copy plugin to ~/.openclaw/extensions/doc-rag/
25. ✅ Add plugins.entries.doc-rag config (enabled: false) to openclaw.json
26. ✅ Set enabled: true → restart gateway
27. ✅ Manual Telegram test: upload real PDF → verify auto-tags → tag-filtered query
28. ✅ No issues found — plugin stable
29. ✅ Confirmed working → plugin stays enabled in production
```

---

## 18. Success Criteria (MVP)

**Environment safety:**
- [x] All 30 standalone tests pass without the gateway running
- [x] Test harness uses isolated temp directories — no production data touched
- [x] Plugin only enabled on gateway after standalone validation is complete
- [x] Rollback to pre-plugin state achievable in < 30 seconds

**Core functionality:**
- [x] Upload PDF/DOCX/XLSX/PPTX via chat → embeddings created and stored permanently
- [x] Documents can be tagged at ingestion with multiple category tags
- [x] Auto-tagging suggests relevant tags based on content keywords and prior tag affinity
- [x] Auto-tag suggestions clearly labeled vs user-provided tags
- [x] Auto-tagging can be disabled via config (`tags.autoTag.enabled: false`)
- [x] Tags can be added/removed after ingestion via `doc_tag`
- [x] Queries can be filtered by tags (OR logic across multiple tags)
- [x] Document listing can be filtered by tags
- [x] `doc_status` shows tag inventory with document counts per tag
- [x] Scanned PDFs processed via OCR when tesseract is available
- [x] Graceful warning (no crash) when tesseract is missing and scanned PDF is uploaded
- [x] Ask questions → get accurate, sourced answers
- [x] Documents persist until explicitly deleted
- [x] Ingestion blocked at 100% capacity with clear message
- [x] Cron health monitor alerts user at 90% capacity (with cooldown to avoid spam)
- [x] VPS-friendly: < 500MB max disk (configurable), < 50MB RAM overhead
- [x] All 30 autonomous validation tests pass
- [x] Works end-to-end via Telegram

---

## 19. Future Enhancements (Post-MVP)

- Multi-language OCR (install additional tesseract language packs)
- Image/chart extraction from documents
- Multi-document cross-referencing queries
- Document update/re-ingest (track versions)
- Hybrid search (keyword + vector)
- Local embeddings (avoid OpenAI dependency — e.g., `@xenova/transformers` with `all-MiniLM-L6-v2`)
- Web UI for document management with tag-based navigation
- Chunk-level citations with page numbers in response
- Table-aware chunking for spreadsheets (preserve row/column context)
- Confidence scoring on OCR output (skip low-quality extractions)
- Archival tiers (move old docs to compressed cold storage)
- Per-document access controls (multi-user scenarios)
- Tag hierarchies / namespaces (e.g., `dept:legal`, `year:2026`)
- LLM-powered auto-tagging (optional upgrade — use a cheap model for richer tag suggestions)
- Tag-based retention policies (e.g., "delete all docs tagged 'temp' older than 30 days")
- Auto-tag confidence scores (show how confident each suggestion is)
- Tag aliases / synonyms (e.g., "legal" and "law" treated as equivalent)
