# Brain 2.0 → 3.0 Product Roadmap

> Generated: 2026-02-08 | Based on full codebase review + competitive analysis
> Current state: 8 buckets, LLM classification, semantic search, digests, DND, action router with cron reminders

---

## Current Architecture Summary

Brain is an OpenClaw plugin that captures unstructured thoughts and automatically classifies them into 8 buckets (people, projects, ideas, admin, documents, goals, health, finance) using LLM classification. It stores records in LanceDB with vector embeddings for semantic search, has duplicate detection via cosine similarity, an audit trail, digest system (morning/midday/afternoon/night/weekly), DND with auto-quiet hours, bracket tag parsing ([ToDo], [Reminder], etc.), and an action router that creates persistent cron-based reminders for time-sensitive items.

**Key strengths:** Zero-friction capture, automatic classification, persistent reminders with Telegram inline buttons, comprehensive audit trail.

**Key gaps:** No cross-item relationships, no learning from corrections, no hybrid search, digests are template-only, no context-aware surfacing, no integrations beyond Telegram.

---

## Competitive Landscape

| Feature | Brain 2.0 | Mem | Reflect | Capacities | Obsidian | Notion |
|---------|-----------|-----|---------|------------|----------|--------|
| Zero-friction capture | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Auto-classification | ✅ | ✅ | ❌ | Partial | ❌ | ❌ |
| Semantic search | ✅ | ✅ | ✅ | ❌ | Plugin | ❌ |
| Bi-directional links | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Knowledge graph | ❌ | Partial | ✅ | ✅ | Plugin | ❌ |
| Spaced repetition | ❌ | ❌ | ❌ | ❌ | Plugin | ❌ |
| Proactive surfacing | Partial (digests) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Learning from corrections | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Calendar integration | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Mobile-first | Telegram ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Self-hosted / private | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Persistent reminders | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

**Brain's unique moat:** Self-hosted, privacy-first, zero-friction Telegram capture with automatic classification + persistent nagging reminders. No competitor does this combination.

**Biggest gaps vs competitors:** No graph/links, no learning loop, no hybrid search, limited proactive intelligence.

---

## Near-Term: v2.1 — Quality of Life

### 2.1.1 · Inbox Cleanup on Successful Route
**Description:** When a thought is successfully classified and routed to a bucket, the inbox entry is deleted. But if classification fails or the process crashes mid-way, orphaned inbox entries accumulate. Add a periodic cleanup that archives stale inbox entries (>24h, still "pending").

**Why it matters:** Prevents inbox bloat; keeps `brain_stats` accurate.

**Complexity:** S

**Dependencies:** None — just a scheduled cleanup in the store or a CLI command.

---

### 2.1.2 · Fix Move Schema Validation
**Description:** When moving items between buckets via `brain_fix`, the record schema must match the target bucket. Currently, moving from inbox to a bucket uses hardcoded field mappings. Add proper schema validation and sensible defaults for missing fields.

**Why it matters:** Prevents corrupted records when manually re-routing items.

**Complexity:** S

**Dependencies:** None (already partially implemented in fix.ts).

---

### 2.1.3 · Search Result Detail View
**Description:** `brain_search` returns titles and scores but not summaries or next actions. Add an option to return richer results (summary, next action, last entry date) without requiring a separate `brain_fix <id>` call.

**Why it matters:** Reduces round-trips; the user gets useful info in one search.

**Complexity:** S

**Dependencies:** None.

---

### 2.1.4 · Bulk Operations
**Description:** Add `brain_fix` support for batch operations: trash multiple items, move multiple items to a bucket. Syntax: `brain_fix <id1>,<id2>,<id3> → trash`.

**Why it matters:** Cleaning up after testing or bulk re-organization is tedious one-by-one.

**Complexity:** S

**Dependencies:** None.

---

### 2.1.5 · Configurable Digest Schedule via Plugin Config
**Description:** The digest schedule config schema exists in `openclaw.plugin.json` but isn't wired up — digests use hardcoded defaults. Wire the config so users can enable/disable individual digests, change times, and adjust word limits.

**Why it matters:** Users have different routines; some want morning+night only.

**Complexity:** S

**Dependencies:** None — config schema already defined.

---

### 2.1.6 · Better Classification Feedback
**Description:** After async classification completes, optionally send a brief Telegram message: "📂 Routed 'Call dentist' → admin (93% confidence)". Currently classification is fire-and-forget with no user visibility unless they check audit.

**Why it matters:** Builds trust in the system; catches misclassifications early.

**Complexity:** S

**Dependencies:** Telegram message sending capability (already available via action router pattern).

---

### 2.1.7 · Needs-Review Workflow Improvement
**Description:** Items in `needs_review` have no easy resolution path beyond `brain_fix`. Add a dedicated `brain_review` tool or extend `brain_fix` to list pending review items and approve/reject them with a single command.

**Why it matters:** Needs-review items currently rot; the friction to resolve them is too high.

**Complexity:** M

**Dependencies:** None.

---

### 2.1.8 · Voice Note Transcription Pipeline
**Description:** The `source: "voice"` type exists but there's no transcription pipeline. Integrate Whisper (local or API) to automatically transcribe voice messages from Telegram before classification.

**Why it matters:** Voice capture is the fastest input method; currently unused.

**Complexity:** M

**Dependencies:** Whisper API access or local whisper.cpp installation.

---

## Mid-Term: v2.5 — Intelligence

### 2.5.0 · Custom Buckets (Add, Remove, Split, Merge)
**Description:** Let users configure and manage their own buckets. Add new buckets with custom fields, remove unused ones, split a bucket into two (e.g., split "admin" into "appointments" and "errands"), or merge buckets together. Each bucket can have custom classification behavior, routing rules, and digest inclusion settings. Configuration via `/brain buckets` slash commands and plugin config.

**Why it matters:** The current 8 fixed buckets don't fit every workflow. A freelancer needs different buckets than a student or a team lead. Custom buckets make Brain truly personal, not one-size-fits-all. This is also a key differentiator vs competitors that force rigid structure.

**Complexity:** L

**Dependencies:** Schema migration tooling, classifier prompt must dynamically adapt to bucket definitions, router needs per-bucket confidence thresholds and field mappings.

---

### 2.5.0a · Bucket Hint Tags (Classification Override)
**Description:** Add a second category of bracket tags — **bucket hints** like `[finance]`, `[health]`, `[project]`, `[people]`, `[admin]`, `[idea]`, `[document]`, `[goal]` — that override the classifier's bucket assignment and bypass the confidence threshold. When a user drops `[finance] paid the electric bill`, the item skips classification routing and goes directly to the finance bucket with confidence 1.0. This is the **input mechanism** that feeds the self-learning loop (2.5.3 + 2.5.4): every bucket hint is also recorded as a correction example for few-shot injection.

**Implementation:**
- `tag-parser.ts`: Add bucket tag detection alongside existing intent tags
- `commands/drop.ts`: When a bucket hint is present, override `classification.bucket` and set `confidence = 1.0` before routing
- `router.ts`: Item bypasses the confidence threshold check, goes straight to the target bucket
- Record the `{rawText, correctBucket, embedding}` in the corrections table (2.5.4)

**User experience:** When an item lands in `needs_review`, the system prompts the user to re-drop with a bucket hint tag (e.g., "Try: `[finance] paid the electric bill`"). Over time, the few-shot examples from these hints improve the classifier so hints become unnecessary for similar inputs.

**Why it matters:** Gives users an immediate escape hatch from `needs_review` while simultaneously teaching the system. Bridges the gap between manual correction and autonomous learning.

**Complexity:** S-M

**Dependencies:** None standalone; feeds into 2.5.3 and 2.5.4 for the learning loop.

---

### 2.5.0b · Drops as Work Orders (dev_task + research Actions)
**Description:** Extend the action router with two new action types. `dev_task` dispatches file edits, code changes, or documentation updates to a sub-agent, with tiered gating: read-only tasks auto-approve, destructive ops require owner confirmation. `research` dispatches web search + summarization, auto-approved since it's read-only. Both actions resolve back to the originating Brain item with status and result summary.

**Why it matters:** Turns Brain from a passive capture tool into an active executor. "Add error handling to auth.ts" becomes a drop that actually does the work.

**Complexity:** L

**Dependencies:** sessions_spawn for sub-agent execution, action router infrastructure (already exists).

---

### 2.5.0c · Payment Actions (DOGE Integration)
**Description:** Integrate with the DOGE wallet plugin to enable payment-triggered drops. "Tip @alice 50 DOGE for the logo" creates an invoice, executes payment after confirmation, and verifies on-chain. Supports invoice creation, direct sends, and payment verification via OP_RETURN. Gated by spending policy tiers already defined in the wallet plugin.

**Why it matters:** Combines autonomous memory with autonomous payments. Agent-to-agent commerce starts with a simple drop.

**Complexity:** L

**Dependencies:** doge-wallet plugin, wallet_send/wallet_invoice/wallet_verify_payment tools.

---

### 2.5.1 · Hybrid Search (Keyword + Semantic)
**Description:** Current search is pure vector similarity. Add BM25/keyword search and combine scores (reciprocal rank fusion). When a user searches for "dentist appointment March", keyword matching on "dentist" and "March" dramatically improves results vs pure semantic similarity.

**Why it matters:** Semantic search alone misses exact matches; hybrid is state-of-the-art for retrieval.

**Complexity:** M

**Dependencies:** LanceDB supports full-text search natively (FTS index). Low integration cost.

---

### 2.5.2 · Cross-Bucket Relationships (Graph Links)
**Description:** Add a `links` table that stores directional relationships between items across buckets. Auto-detect links during classification (e.g., a project mentioning a person creates a link). Surface linked items in search results and digests.

Example: Drop "Meeting with Sarah about Project Alpha" → creates person record for Sarah, links to Project Alpha.

**Why it matters:** Knowledge is inherently connected. Isolated buckets lose context. This is the #1 feature competitors (Reflect, Capacities, Obsidian) do well that Brain doesn't.

**Complexity:** L

**Dependencies:** Schema extension (new `links` table), classifier prompt update to extract relationships, search/digest updates to surface links.

---

### 2.5.3 · Smarter Classification with Few-Shot Examples
**Description:** The classifier currently uses a zero-shot prompt. Maintain a small bank of "gold standard" examples (correct classifications) and include the most relevant 3-5 as few-shot examples in the classification prompt. Automatically build this bank from: (a) user corrections via `brain_fix` moves, (b) bucket hint tags from 2.5.0a, (c) approved `needs_review` resolutions.

**Self-learning flow:**
1. User drops `[finance] paid the electric bill` → stored as correction `{rawText: "paid the electric bill", correctBucket: "finance", embedding}`
2. Next time someone drops "paid the water bill", vector search finds the similar correction
3. Correction injected as few-shot example: `"paid the electric bill" → finance`
4. Classifier sees the pattern → returns `finance` with high confidence → no more `needs_review`

**Why it matters:** Few-shot examples dramatically improve classification accuracy, especially for edge cases. The system gets smarter with every correction, bucket hint, and manual fix.

**Complexity:** M

**Dependencies:** A `corrections` LanceDB table storing `{rawText, correctBucket, embedding, timestamp}`. Fed by 2.5.0a (bucket hints) and 2.5.4 (fix corrections).

---

### 2.5.4 · Learning from Corrections (Classification Feedback Loop)
**Description:** When a user moves an item via `brain_fix → <bucket>`, record the correction as a training signal. Use these corrections to: (a) build few-shot examples (2.5.3), (b) adjust confidence thresholds per bucket, (c) identify systematic misclassification patterns. Also captures corrections from bucket hint tags (2.5.0a) and `needs_review` approvals.

**Correction sources (all feed the same `corrections` table):**
- Bucket hint tags: `[finance] paid electric bill` (2.5.0a)
- Manual fixes: `brain_fix → health`
- Needs-review resolutions: approving a suggested bucket
- Audit trail: retroactive extraction of past corrections

**Why it matters:** The system gets smarter over time instead of making the same mistakes. This is what Mem does well — it learns your categorization preferences. Combined with 2.5.0a (bucket hints as the input mechanism) and 2.5.3 (few-shot injection as the output mechanism), this forms a complete self-learning loop.

**Complexity:** M

**Dependencies:** 2.5.3 (few-shot bank), 2.5.0a (bucket hints as correction source). Correction tracking already partially exists in audit trail.

---

### 2.5.5 · Proactive Surfacing in Digests
**Description:** Enhance digests beyond template-based summaries. Before generating a digest, query the Brain for contextually relevant items:
- Morning: Items related to today's calendar events (if calendar integration exists)
- Midday: Items similar to what was recently captured
- Night: Items that haven't been touched in a while but have pending actions
- Weekly: Pattern detection (are you dropping lots of health items? Flag it.)

**Why it matters:** Transforms digests from passive summaries into proactive intelligence.

**Complexity:** L

**Dependencies:** Better search (2.5.1), optionally calendar integration (3.0.x).

---

### 2.5.6 · Smart Merge Suggestions
**Description:** During the drop pipeline, when duplicate detection finds items at 0.80-0.92 similarity (below auto-merge but still related), suggest a merge to the user instead of silently creating a new record.

**Why it matters:** Prevents fragmentation of related thoughts across multiple records.

**Complexity:** S

**Dependencies:** None — the duplicate check infrastructure already exists.

---

### 2.5.7 · Natural Language Digest (LLM-Powered Weekly Review)
**Description:** The weekly digest is template-based. Use an LLM to generate a natural-language weekly review that identifies patterns, suggests focus areas, and provides actionable recommendations. Keep daily digests template-based (cheap).

**Why it matters:** A natural language review feels personal and insightful, not robotic.

**Complexity:** M

**Dependencies:** LLM API access (already available via gateway).

---

### 2.5.8 · Tag Taxonomy & Auto-Tagging
**Description:** Tags are currently free-form strings with max 3 per item. Build a tag taxonomy that normalizes similar tags ("meeting"/"meetings", "work"/"job"), suggests tags based on content, and enables tag-based filtering in search and digests.

**Why it matters:** Consistent tagging enables powerful cross-cutting views (e.g., "show me everything tagged #urgent").

**Complexity:** M

**Dependencies:** None.

---

### 2.5.9 · Temporal Awareness in Classification
**Description:** Pass the current date/time and recent Brain context to the classifier. "Pick up dry cleaning" on a Saturday vs Monday might classify differently. "Tax deadline" in March vs October has different urgency.

**Why it matters:** Context-aware classification is more accurate and sets better urgency/followUpDate values.

**Complexity:** S

**Dependencies:** None — just prompt engineering in classifier.ts.

---

## Long-Term: v3.0 — Autonomous Memory

### 3.0.1 · Knowledge Graph Visualization
**Description:** Build a graph view (web UI via Canvas) showing all Brain items as nodes and their relationships as edges. Color-code by bucket, size by activity, highlight clusters. Interactive — click a node to see details, drag to explore.

**Why it matters:** Humans think in graphs; seeing your knowledge network reveals patterns invisible in lists.

**Complexity:** XL

**Dependencies:** 2.5.2 (cross-bucket relationships), Canvas/web UI.

---

### 3.0.2 · Spaced Repetition for Important Items
**Description:** For items the user marks as "important to remember" (or auto-detected high-value items), implement a spaced repetition schedule. Surface them in digests at increasing intervals (1 day, 3 days, 7 days, 14 days, 30 days). Track whether the user engages with the reminder.

**Why it matters:** Memory fades. Spaced repetition is the most effective technique for long-term retention. No PKM tool does this well for general knowledge (only Anki for flashcards).

**Complexity:** L

**Dependencies:** A `repetition_schedule` table tracking item ID, next review date, interval, ease factor.

---

### 3.0.3 · Context-Aware Proactive Recall
**Description:** When the user is in a conversation (any OpenClaw session), automatically search the Brain for relevant items and surface them as context. "You're discussing Project Alpha — here are 3 related Brain items." This runs as a background hook, not a manual search.

**Why it matters:** The most valuable memory system is one that surfaces the right information without being asked. This is the holy grail of PKM.

**Complexity:** XL

**Dependencies:** 2.5.1 (hybrid search), 2.5.2 (graph links), OpenClaw session hooks/middleware.

---

### 3.0.4 · Calendar Integration
**Description:** Sync with Google Calendar / Apple Calendar. Before morning digests, pull today's events and cross-reference with Brain items. "You have a meeting with Sarah at 2pm — Brain has 3 notes about Sarah and 2 action items."

**Why it matters:** Calendar is the backbone of daily planning; connecting it to Brain makes both more powerful.

**Complexity:** L

**Dependencies:** OAuth setup, calendar API integration, 2.5.2 (cross-bucket links to people).

---

### 3.0.5 · Email Integration (Capture from Email)
**Description:** Forward emails to a Brain inbox (or connect via IMAP). Auto-extract action items, people, dates, and classify into buckets. "Forward this receipt" → finance bucket. "Forward this meeting invite" → admin + people links.

**Why it matters:** Email is where most action items originate; capturing them without copy-paste removes a major friction point.

**Complexity:** XL

**Dependencies:** Email receiving infrastructure (webhook or IMAP polling), classification pipeline.

---

### 3.0.6 · Location-Aware Reminders
**Description:** Using paired node location data, trigger reminders based on location. "Remind me to buy milk when I'm near the grocery store." Uses the action router pattern but with geofence triggers instead of time triggers.

**Why it matters:** Location-based reminders are one of the most-requested features in productivity tools.

**Complexity:** L

**Dependencies:** Node location API (already exists in OpenClaw), geofence logic, action router extension.

---

### 3.0.7 · Autonomous Inbox Processing
**Description:** Instead of just classifying and routing, have the Brain autonomously process certain item types:
- Auto-create calendar events from admin items with dates
- Auto-send follow-up reminder messages for people items
- Auto-research topics for idea items (web search → summary → attach to item)
- Auto-track recurring finance items

**Why it matters:** Moves Brain from "smart filing cabinet" to "autonomous assistant."

**Complexity:** XL

**Dependencies:** Calendar integration (3.0.4), web search, clear user consent/approval workflow.

---

### 3.0.8 · Multi-User / Team Brain
**Description:** Shared buckets for team use. A "team projects" bucket where multiple OpenClaw users can drop thoughts, with per-user permissions and shared classification.

**Why it matters:** Small teams need shared context; currently Brain is single-user only.

**Complexity:** XL

**Dependencies:** Multi-user auth, shared LanceDB instance or sync protocol.

---

### 3.0.9 · Browsing History Integration
**Description:** Optionally capture web browsing context (via browser extension or OpenClaw browser tool). When a user drops "that article about React performance", Brain can find the recent browsing history match and auto-link it.

**Why it matters:** Reduces "I read something about X but can't find it" moments.

**Complexity:** L

**Dependencies:** Browser extension or OpenClaw browser session logging.

---

### 3.0.10 · Sentiment & Energy Tracking
**Description:** Detect emotional tone in drops over time. Track energy/mood patterns and surface them in weekly reviews. "You've dropped 5 stress-related items this week — consider scheduling downtime."

**Why it matters:** A true second brain should care about your wellbeing, not just your tasks.

**Complexity:** M

**Dependencies:** Sentiment analysis (can be done in classifier prompt), health bucket enhancements.

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| 2.1.6 Classification feedback | High | S | **P0** |
| 2.1.5 Configurable digests | Medium | S | **P0** |
| 2.1.7 Needs-review workflow | High | M | **P0** |
| 2.5.0a Bucket hint tags | High | S-M | **P0** |
| 2.5.0b Drops as work orders | Very High | L | **P1** |
| 2.5.0c Payment actions | High | L | **P1** |
| 2.5.1 Hybrid search | High | M | **P1** |
| 2.5.2 Cross-bucket links | Very High | L | **P1** |
| 2.5.4 Learning from corrections | High | M | **P1** |
| 2.5.9 Temporal awareness | Medium | S | **P1** |
| 2.5.6 Smart merge suggestions | Medium | S | **P1** |
| 2.1.8 Voice transcription | High | M | **P2** |
| 2.5.3 Few-shot classification | High | M | **P2** |
| 2.5.5 Proactive surfacing | Very High | L | **P2** |
| 2.5.7 LLM weekly review | Medium | M | **P2** |
| 3.0.2 Spaced repetition | High | L | **P3** |
| 3.0.3 Context-aware recall | Very High | XL | **P3** |
| 3.0.4 Calendar integration | High | L | **P3** |

---

## Implementation Sequence (Recommended)

**Sprint 1 (v2.1):** 2.1.1, 2.1.2, 2.1.3, 2.1.5, 2.1.6 — Quick wins, all S complexity
**Sprint 2 (v2.1.5):** 2.1.4, 2.1.7, 2.1.8 — Complete QoL layer
**Sprint 3 (v2.5-alpha):** 2.5.0a, 2.5.1, 2.5.9, 2.5.6 — Bucket hints, search & classification improvements
**Sprint 4 (v2.5-beta):** 2.5.3, 2.5.4, 2.5.2 — Self-learning loop (few-shot + corrections) & graph links
**Sprint 5 (v2.5):** 2.5.5, 2.5.7, 2.5.8 — Intelligence layer
**Sprint 6+ (v3.0):** Calendar → Proactive recall → Spaced repetition → Integrations

---

## Key Insight

Brain's strongest differentiator is **zero-friction capture + automatic routing**. The roadmap should double down on this by making the "automatic" part smarter (learning loop, better classification, proactive surfacing) rather than adding manual organizational features that competitors already do well. The goal is: **drop a thought, forget about it, and trust that Brain will surface it when relevant.**
