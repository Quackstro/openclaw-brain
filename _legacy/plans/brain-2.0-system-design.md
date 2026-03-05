# Brain 2.0 — System Design & Integration Plan

**Author:** Jarvis (for Dr. Castro)
**Date:** 2026-02-01
**Status:** ✅ Design Review Complete — All 12 questions resolved. Ready for build.

---

## 1. Vision

A behavioral support system that extends biological human memory. Not a knowledge base — a **reliability engine** that captures thoughts, classifies them, stores structured data, and proactively surfaces the right information at the right time.

The human's only reliable job: **drop thoughts when they occur.**
Everything else — classification, routing, storage, nudging, review — is the system's job.

---

## 2. Design Principles (from Dr. Castro)

| # | Principle | Implementation Implication |
|---|-----------|---------------------------|
| 1 | Separate memory from compute and interface | LanceDB stores (persistent) ↔ Lobster pipelines (compute) ↔ Telegram (interface) |
| 2 | Treat prompts like APIs, not creative writing | Fixed classification schemas with `llm-task` structured JSON output |
| 3 | Build trust mechanisms | Confidence scores on every classification, audit trail, bouncer guardrail |
| 4 | Default to safe when uncertain | Items below confidence threshold → `needs-review` inbox, not knowledge base |
| 5 | Make outputs small, frequent, actionable | Daily digest ≤150 words, weekly ≤250 words, next-action as unit of execution |
| 6 | Prefer routing over organizing | 8 stable buckets, system routes automatically, user never maintains structure |
| 7 | Store actions not intentions | Every item has a concrete `nextAction` field, not vague goals |
| 8 | Keep categories painfully small | 8 buckets: People, Projects, Ideas, Admin, Documents, Goals, Health, Finance |
| 9 | Design for restart not perfection | No backlog monster; system waits and supports restart gracefully |
| 10 | Build one workflow then attach modules | Core capture→classify→store→surface loop first, then birthday reminders etc. |
| 11 | Optimize for maintainability | Fewer tools, clearer steps, cleaner logging, easy reconnects |
| 12 | Token-conscious | Lobster pipelines for deterministic steps; LLM only for classification; usage-aware backoff |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     TELEGRAM (Interface)                      │
│   /drop "thought"    /fix <id>    Digest messages    Chat     │
└──────────┬──────────────┬──────────────┬────────────────────┘
           │              │              │
           ▼              ▼              ▲
┌──────────────────┐ ┌──────────┐ ┌─────────────────┐
│  CAPTURE POINT   │ │  FIX     │ │  TAP-ON-SHOULDER│
│  (Lobster flow)  │ │  HANDLER │ │  (Cron + Digest) │
└────────┬─────────┘ └────┬─────┘ └────────┬────────┘
         │                │                │
         ▼                ▼                │
┌─────────────────────────────────────┐    │
│         SORTER / CLASSIFIER         │    │
│  (llm-task → structured JSON)       │    │
│  confidence score + bucket + action │    │
└────────┬────────────────────────────┘    │
         │                                 │
         ▼                                 │
┌─────────────────┐                        │
│    BOUNCER       │                        │
│  conf ≥ 0.7 → route to bucket           │
│  conf < 0.7 → needs-review inbox        │
└────────┬────────┘                        │
         │                                 │
         ▼                                 │
┌─────────────────────────────────────┐    │
│         MEMORY STORES (LanceDB)      │    │
│  ┌──────┐ ┌────────┐ ┌─────┐       │    │
│  │People│ │Projects│ │Ideas│       │    │
│  └──────┘ └────────┘ └─────┘       │    │
│  ┌─────┐ ┌─────────┐ ┌─────┐       │    │
│  │Admin│ │Documents│ │Goals│       │    │
│  └─────┘ └─────────┘ └─────┘       │    │
│  ┌──────┐ ┌───────┐ ┌──────────┐  │    │
│  │Health│ │Finance│ │NeedsReview│  │    │
│  └──────┘ └───────┘ └──────────┘  │    │
│  ┌────────────┐                     │    │
│  │ Audit Trail│ (receipts for ALL)  │◄───┘
│  └────────────┘                     │
└─────────────────────────────────────┘
```

---

## 4. Existing Infrastructure We Build On

| Component | What exists | How Brain 2.0 uses it |
|-----------|-------------|----------------------|
| **Telegram channel** | Active, `/new`, `/reset` working | Add `/drop`, `/fix`, `/dnd` commands; separate thread/bot for digests + nudges |
| **Doc-RAG plugin** | LanceDB store, embeddings, hybrid search, auto-tagger, chunker, pipeline | Reuse LanceDB engine + embedding infra for Brain stores; keep doc-RAG separate |
| **Lobster** | Enabled, 2 workflow files exist, `alsoAllow` configured | Core pipeline engine — capture→classify→route→store as deterministic flow |
| **llm-task** | Available in OpenClaw (not yet enabled) | Classification step inside Lobster — structured JSON, no orchestration tokens |
| **Cron** | Working, has jobs for lobster reminder, PR checks | Scheduled digests: morning/midday/afternoon/night + weekly Sunday review |
| **Usage monitor** | `anthropic-usage-monitor.mjs`, 5-min cron | Brain 2.0 respects thresholds; backs off classification when usage >90% |
| **Memory system** | `memory_search`, `memory_get`, MEMORY.md | Brain stores are *separate* from workspace memory — different concerns |
| **Sub-agents** | Working, used for RAG improvement pipeline | Heavy digest generation offloaded to sub-agents (Sonnet) |
| **Session hooks** | `session-memory`, `command-logger` enabled | Can hook into session events for passive capture |

---

## 5. Building Blocks — Detailed Design

### 5.1 The Drop — Capture Point

**Command:** `/drop <thought>`
**Behavior:**
- One message = one thought
- No tagging, no organizing, no decisions
- Accepts: plain text, photos (OCR → text extraction, core), files (parsed), voice messages (optional future module)
- Immediately acknowledged: "✅ Captured" (or a small emoji react)
- Triggers classification pipeline asynchronously
- Does NOT interrupt current conversation context

**Implementation:**
- Register `/drop` as a native OpenClaw command
- On receive: write raw input to `inbox` table in LanceDB with timestamp + source
- Fire Lobster pipeline `brain-classify.lobster` asynchronously via sub-agent
- Return quick ack to user immediately

**Schema — Raw Inbox Entry:**
```typescript
interface InboxEntry {
  id: string;              // UUID
  rawText: string;         // Original input exactly as typed
  source: "drop" | "chat" | "file" | "voice";
  timestamp: string;       // ISO 8601
  mediaPath?: string;      // If file/photo attached
  status: "pending" | "classified" | "needs-review" | "archived";
}
```

### 5.2 The Sorter — AI Classification

**Engine:** `llm-task` plugin inside a Lobster pipeline step
**Model:** Sonnet (cheap, fast, good enough for classification)
**Cost:** ~500-800 tokens per classification (input schema + thought + output)

**Classification Prompt (API-style, not creative):**
```
You are a classification engine. Given a raw thought, extract structured data.

BUCKETS: people, project, idea, admin, document, goal, health, finance
RULES:
- If it mentions a person by name or role → people
- If it relates to ongoing work, tasks, deadlines → project
- If it's a new concept, opportunity, or "what if" → idea
- If it's appointments, errands, logistics → admin
- If it references a specific document, article, or resource → document
- If it's a long-term objective, milestone, or life target → goal
- If it relates to medical, fitness, nutrition, mental health, or wellness → health
- If it involves money, bills, investments, expenses, or budgets → finance
- If unclear, return bucket: "unknown" with low confidence

OUTPUT (JSON):
{
  "bucket": "people|project|idea|admin|document|goal|health|finance|unknown",
  "confidence": 0.0-1.0,
  "title": "short label (≤8 words)",
  "summary": "1-2 sentence distillation",
  "nextActions": ["concrete next step 1", "optional step 2"],
  "entities": { "people": [], "dates": [], "amounts": [], "locations": [] },
  "urgency": "now|today|this-week|someday",
  "followUpDate": "YYYY-MM-DD or null",
  "tags": ["max", "3", "tags"]
}
```

**Why llm-task inside Lobster:**
- Lobster handles the pipeline orchestration (no LLM tokens for "what do I do next?")
- `llm-task` does ONE structured call with a JSON schema contract
- Total LLM cost: ~$0.002 per drop (Sonnet pricing)
- Lobster pipeline cost: $0.00 (deterministic, no LLM)

### 5.3 Form Schemas — Data Contracts

Each bucket has a fixed schema. The system promises to populate these fields reliably.

**People:**
```typescript
interface PersonRecord {
  id: string;
  name: string;
  context: string;         // How you know them, their role
  company?: string;
  contactInfo?: string;
  nextActions: string[];
  followUpDate?: string;
  lastInteraction: string; // ISO date
  entries: { date: string; note: string }[];  // Chronological log
  tags: string[];
}
```

**Projects:**
```typescript
interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed" | "stuck";
  nextActions: string[];
  blockers?: string[];
  relatedPeople: string[]; // IDs
  dueDate?: string;
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Ideas:**
```typescript
interface IdeaRecord {
  id: string;
  title: string;
  description: string;
  nextActions: string[];   // Even ideas get a concrete next step
  potential: "explore" | "validate" | "build" | "parked";
  relatedTo?: string[];    // IDs of related projects/people
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Admin:**
```typescript
interface AdminRecord {
  id: string;
  title: string;
  category: "appointment" | "errand" | "bill" | "logistics" | "other";
  nextActions: string[];
  dueDate?: string;
  recurring?: { interval: "daily" | "weekly" | "monthly" | "yearly" };
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Documents:**
```typescript
interface DocumentRecord {
  id: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  filePath?: string;
  nextActions: string[];
  relatedTo?: string[];
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Goals:**
```typescript
interface GoalRecord {
  id: string;
  title: string;
  description: string;
  timeframe: "short-term" | "medium-term" | "long-term";
  status: "active" | "achieved" | "paused" | "abandoned";
  milestones: { label: string; done: boolean; date?: string }[];
  nextActions: string[];
  relatedProjects?: string[];  // IDs of related projects
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Health:**
```typescript
interface HealthRecord {
  id: string;
  title: string;
  category: "medical" | "fitness" | "nutrition" | "mental" | "wellness";
  description: string;
  nextActions: string[];
  provider?: string;         // Doctor, gym, therapist, etc.
  followUpDate?: string;
  entries: { date: string; note: string }[];
  tags: string[];
}
```

**Finance:**
```typescript
interface FinanceRecord {
  id: string;
  title: string;
  category: "bill" | "investment" | "expense" | "income" | "budget" | "tax" | "other";
  amount?: number;
  currency?: string;
  dueDate?: string;
  recurring?: { interval: "weekly" | "monthly" | "quarterly" | "yearly" };
  nextActions: string[];
  entries: { date: string; note: string }[];
  tags: string[];
}
```

### 5.4 Memory Store — Source of Truth

**Technology:** LanceDB (same engine as doc-RAG, proven on this system)
**Location:** `~/.openclaw/brain/` (separate from `~/.openclaw/docrag/`)

**Tables:**
| Table | Purpose | Embedding? |
|-------|---------|-----------|
| `inbox` | Raw drops before classification | Yes (for dedup + similarity) |
| `people` | Person records | Yes (semantic search) |
| `projects` | Project records | Yes |
| `ideas` | Idea records | Yes |
| `admin` | Admin/logistics records | Yes |
| `documents` | Document references | Yes |
| `goals` | Long-term objectives + milestones | Yes |
| `health` | Medical, fitness, nutrition, wellness | Yes |
| `finance` | Money, bills, investments, budgets | Yes |
| `needs_review` | Low-confidence items awaiting user action | Yes |
| `audit_trail` | Every system action logged | No (structured queries only) |

**Why separate from doc-RAG:**
- Different lifecycle (doc-RAG = document Q&A; Brain = behavioral memory)
- Different schemas (doc-RAG = chunks; Brain = structured records)
- Different access patterns (doc-RAG = query; Brain = CRUD + scheduled reads)
- Independent scaling and backup

**Embedding reuse:**
- Same `text-embedding-3-small` model via GitHub Models (already configured)
- Same embedding infrastructure from doc-RAG (import the embed function)
- No additional API keys needed

### 5.5 Receipts — Audit Trail

Every action the system takes is logged.

```typescript
interface AuditEntry {
  id: string;
  timestamp: string;
  action: "captured" | "classified" | "routed" | "updated" | "nudged" | "reviewed" | "fixed" | "archived";
  inputId: string;         // What triggered this
  outputId?: string;       // What was created/modified
  bucket?: string;
  confidence?: number;
  details: string;         // Human-readable description
  tokenCost?: number;      // LLM tokens used (if any)
}
```

**Purpose:**
- Traceable: see what happened to any thought
- Error discovery: find patterns in low-confidence classifications
- Trust building: user can verify system decisions
- Cost tracking: monitor LLM token spend per action

### 5.6 The Bouncer — Guardrail

**Threshold:** Confidence ≥ 0.80 → route to bucket. Below → `needs_review`.

**Behavior when uncertain:**
1. File item in `needs_review` table
2. Send user a message: "🤔 Not sure about this one: *[title]*. Is this a [person/project/idea]? Reply `/fix [id] [bucket]`"
3. Do NOT put it in any knowledge bucket
4. Do NOT take any automated actions on it
5. Wait for user input — no timeout, no nagging

**Additional guardrails:**
- Duplicate detection: cosine similarity >0.92 with existing item → auto-merge (append to existing record's `entries[]` log, update `nextActions` if new ones extracted)
- Spam filter: if classification returns no meaningful entities → file as `needs_review`
- Threshold is configurable — start cautious at 0.80, lower as system earns trust
- Size guard: single thoughts only — if input >500 words, split suggestion to user

### 5.7 Tap on the Shoulder — Progressive Notifications

**Scheduled Digests (via OpenClaw Cron):**

| Time (ET) | Name | Content | Max Words |
|-----------|------|---------|-----------|
| 7:00 AM | Morning Brief | Top 3 actions for today, overdue items, calendar awareness | 150 |
| 12:00 PM | Midday Check | Anything stuck? Items due today not started | 100 |
| 5:00 PM | Afternoon Wrap | What moved today, what carries to tomorrow | 120 |
| 9:00 PM | Night Wind-down | Tomorrow's top priorities, pending follow-ups | 100 |
| Sunday 10 AM | Weekly Review | Bucket health stats header + actionable focus items for the week | 250 |

**Delivery Channel:**
- Digests and nudges go to a **separate Telegram thread or dedicated bot** — keeps Brain notifications out of the main working conversation
- `/drop` and `/fix` commands work in the main chat (capture happens where you are)
- Options to evaluate at build time: Telegram topic thread in a group, or a second bot token dedicated to Brain

**Reactive Nudges (event-driven):**
- Follow-up dates hitting → "Reminder: follow up with [person] about [topic]"
- Items stuck >3 days with no update → "🔴 [project] has been stuck since [date]. Next action: [action]"
- Needs-review items >24h old → gentle re-surface (once, not nagging)

**Weekly Review Format (Sunday):**
```
📊 BUCKET HEALTH
People: 3 overdue follow-ups · Projects: 2 stuck · Ideas: 5 parked
Goals: 1 milestone due · Health: 1 appointment · Finance: 2 bills due
Admin: 0 overdue · Needs Review: 4 pending

🎯 THIS WEEK'S FOCUS
1. [Most important action]
2. [Second priority]
3. [Third priority]

🔴 STUCK (needs unblocking)
- [Project X] blocked since [date]: [what's needed]

✅ WINS LAST WEEK
- [What moved forward]
```

**Implementation:**
- Each digest is a cron job → fires `systemEvent` to main session
- Main session generates digest by querying Brain stores
- Uses sub-agent (Sonnet) for digest generation to save Opus tokens
- Digest generation is a Lobster pipeline: query stores → format → send

**Do Not Disturb:**
- **Auto-quiet hours:** 10PM–7AM ET — no digests or nudges (configurable)
- **Manual override:** `/dnd on` suppresses everything, `/dnd off` resumes
- Manual `/dnd` overrides auto-quiet in both directions (force quiet during day, or force active at night)
- When DND ends, one summary of what accumulated (not a flood)
- Items don't pile up during DND — they just wait in their buckets

### 5.8 The Fix Button — Feedback Handle

**Command:** `/fix <id> [correction]`

**Corrections supported:**
| Syntax | Action |
|--------|--------|
| `/fix <id> → people` | Move item to people bucket |
| `/fix <id> → project` | Move item to project bucket |
| `/fix <id> → trash` | Delete item entirely |
| `/fix <id> action: "call them Monday"` | Update next action |
| `/fix <id> merge <other-id>` | Merge two items |
| `/fix <id>` (no args) | Show item details + options |

**How it builds trust:**
- Every fix is logged in audit trail
- Classification prompt can be tuned based on fix patterns
- If >30% of items in a bucket get fixed → system warns: "My classification for [bucket] seems off. Want me to adjust?"

**Behavioral Learning (silent, automatic):**
- Track fix patterns over time (stored in audit trail)
- System automatically adjusts classification prompt weights based on fix history
- No approval needed — system learns and adapts silently
- User always has `/fix` as a safety valve if it overcorrects
- Learning is logged in audit trail for transparency (but not surfaced unless asked)

---

## 6. Lobster Pipeline Design

### 6.1 Core Pipeline: `brain-classify.lobster`

```yaml
name: brain-classify
description: >
  Classify a raw inbox drop into a structured record and route to the correct bucket.
  Runs asynchronously after /drop capture.

args:
  inboxId:
    description: "UUID of the inbox entry to classify"

steps:
  - id: fetch-drop
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs fetch-inbox --id ${inboxId} --json

  - id: classify
    command: >
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "Classify this thought into a structured record...",
        "input": $fetch-drop.json,
        "schema": { ... classification schema ... },
        "model": "anthropic/claude-sonnet-4"
      }'
    stdin: $fetch-drop.stdout

  - id: check-confidence
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs check-confidence --json
    stdin: $classify.stdout

  - id: route
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs route --json
    stdin: $check-confidence.stdout
    condition: $check-confidence.json.routable == true

  - id: needs-review
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs needs-review --json
    stdin: $check-confidence.stdout
    condition: $check-confidence.json.routable == false

  - id: audit
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs audit --json
    stdin: $route.stdout || $needs-review.stdout
```

### 6.2 Digest Pipeline: `brain-digest.lobster`

```yaml
name: brain-digest
description: >
  Generate a scheduled digest from Brain stores.

args:
  type:
    description: "morning|midday|afternoon|night|weekly"
  maxWords:
    default: "150"

steps:
  - id: gather
    command: >
      node /home/clawdbot/clawd/brain/cli.mjs gather-digest --type ${type} --json

  - id: format
    command: >
      openclaw.invoke --tool llm-task --action json --args-json '{
        "prompt": "Format this data into a concise digest...",
        "input": $gather.json,
        "schema": { "type": "object", "properties": { "digest": { "type": "string" } } },
        "model": "anthropic/claude-sonnet-4"
      }'
    stdin: $gather.stdout

  - id: send
    command: >
      openclaw.invoke --tool message --action send --args-json '{
        "target": "8511108690",
        "message": $format.json.digest,
        "threadId": "<brain-digest-thread>"
      }'
    stdin: $format.stdout
```

### 6.3 Token Cost Analysis (Lobster vs. Pure LLM)

| Operation | Without Lobster (Opus) | With Lobster + llm-task (Sonnet) | Savings |
|-----------|----------------------|----------------------------------|---------|
| Classify 1 drop | ~3,000 tokens ($0.045) | ~800 tokens ($0.002) | **96%** |
| Morning digest | ~5,000 tokens ($0.075) | ~1,500 tokens ($0.005) | **93%** |
| Weekly review | ~8,000 tokens ($0.12) | ~2,500 tokens ($0.008) | **93%** |
| Fix routing | ~2,000 tokens ($0.03) | ~200 tokens ($0.00) | **100%** (deterministic) |
| **Daily total (10 drops + 4 digests)** | **~50K tokens (~$0.75)** | **~14K tokens (~$0.05)** | **93%** |

Lobster eliminates orchestration tokens entirely. The LLM is only used for judgment calls (classification, summarization) — everything else is deterministic Node.js code.

---

## 7. Technical Implementation Plan

### 7.1 New Extension: `brain` (OpenClaw Plugin)

**Location:** `~/.openclaw/extensions/brain/`

**Files:**
```
brain/
├── openclaw.plugin.json     # Plugin manifest
├── package.json
├── index.ts                 # Plugin entry — registers tools + commands
├── store.ts                 # LanceDB store manager (all 8 tables)
├── schemas.ts               # TypeScript interfaces + LanceDB schemas
├── classifier.ts            # Classification prompt builder
├── router.ts                # Confidence check + bucket routing
├── digest.ts                # Digest generation logic
├── commands/
│   ├── drop.ts              # /drop command handler
│   └── fix.ts               # /fix command handler
├── cli.mjs                  # CLI entry point for Lobster pipeline steps
├── workflows/
│   ├── brain-classify.lobster
│   ├── brain-digest.lobster
│   └── brain-fix.lobster
└── tests/
    ├── classify.test.ts
    ├── router.test.ts
    └── digest.test.ts
```

### 7.2 Dependencies on Existing Infrastructure

| Dependency | Status | Action Needed |
|-----------|--------|---------------|
| LanceDB | ✅ Installed (doc-RAG) | Reuse — import from shared location |
| text-embedding-3-small | ✅ Configured | Reuse same API key + model |
| Lobster CLI | ✅ Installed + enabled | Write new `.lobster` workflow files |
| llm-task plugin | ⚠️ Available but not enabled | Enable in config |
| Cron | ✅ Working | Add 5 new cron jobs for digests |
| Telegram | ✅ Active | Register `/drop` and `/fix` commands |
| Usage monitor | ✅ Running | Brain classification checks usage before firing |

### 7.3 Config Changes Required

```json
{
  "plugins": {
    "entries": {
      "llm-task": { "enabled": true },
      "brain": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "<reuse doc-rag key>",
            "model": "text-embedding-3-small",
            "baseURL": "https://models.inference.ai.azure.com"
          },
          "classification": {
            "model": "anthropic/claude-sonnet-4",
            "confidenceThreshold": 0.80
          },
          "digests": {
            "enabled": true,
            "timezone": "America/New_York",
            "schedule": {
              "morning":   { "enabled": true, "time": "07:00", "maxWords": 150 },
              "midday":    { "enabled": true, "time": "12:00", "maxWords": 100 },
              "afternoon": { "enabled": true, "time": "17:00", "maxWords": 120 },
              "night":     { "enabled": true, "time": "21:00", "maxWords": 100 },
              "weekly":    { "enabled": true, "day": "sunday", "time": "10:00", "maxWords": 250 }
            }
          },
          "dnd": {
            "autoQuiet": { "enabled": true, "from": "22:00", "to": "07:00" },
            "manual": true
          },
          "usageAware": {
            "enabled": true,
            "backoffThreshold": 90
          }
        }
      }
    }
  },
  "tools": {
    "alsoAllow": ["lobster", "llm-task"]
  }
}
```

---

## 8. Build Phases

### Phase 0: Foundation (Day 1)
- [ ] Create `brain` extension directory structure
- [ ] Set up LanceDB stores with schemas for all 11 tables
- [ ] Write `cli.mjs` entry point for Lobster integration
- [ ] Enable `llm-task` plugin
- [ ] Build seed importer: scan doc-RAG documents + memory/*.md → classify → populate buckets
- [ ] Test: can create/read/update records in each store

**Seed Sources:**
| Source | What gets imported | Classification |
|--------|-------------------|----------------|
| Doc-RAG documents | Each doc → Documents bucket + cross-classify relevant entities | Batch via llm-task (Sonnet) |
| `memory/*.md` | Extract durable facts (people, preferences, projects, system setup) | Batch via llm-task (Sonnet) |
| `USER.md` / `IDENTITY.md` | Baseline profile data → People (self) + Admin | Direct mapping |

### Phase 1: Core Loop — Capture + Classify + Store (Days 2-3)
- [ ] Implement `/drop` command handler (text + photo support)
- [ ] Photo pipeline: detect image → OCR (reuse doc-RAG OCR) → extract text → feed to classifier
- [ ] Write classification prompt (API-style, tuned for next-actions)
- [ ] Build `brain-classify.lobster` pipeline
- [ ] Implement bouncer (confidence threshold routing)
- [ ] Implement audit trail logging
- [ ] Test: `/drop "Call Dr. Smith about the lab results"` → classified → routed to People → audit logged
- [ ] Test: `/drop` + photo of receipt → OCR → routed to Finance → audit logged

### Phase 2: Surface — Digests + Nudges (Days 4-5)
- [ ] Implement digest query logic (gather from stores, prioritize)
- [ ] Build `brain-digest.lobster` pipeline
- [ ] Create 5 cron jobs (4 daily + 1 weekly)
- [ ] Implement DND toggle
- [ ] Test: morning digest fires, content is relevant and ≤150 words

### Phase 3: Fix + Learn (Days 6-7)
- [ ] Implement `/fix` command handler with all syntax variants
- [ ] Build fix audit trail tracking
- [ ] Implement reactive nudges (follow-up dates, stuck items)
- [ ] Test: `/fix abc123 → project` moves item, logs fix, updates classification hints

### Phase 4: Polish + Restart-Proof (Day 8)
- [ ] Implement restart detection — on startup, skip backlog, show "Welcome back" summary
- [ ] DND recovery — single summary after DND period
- [ ] Duplicate detection (cosine similarity merge)
- [ ] Usage-aware backoff (check monitor before classification)
- [ ] Error handling + graceful degradation

### Phase 5: Optional Modules (Future)
- [ ] Voice drops — transcription (Whisper) → classify → store
- [ ] ~~Photo drops~~ (moved to core loop Phase 1)
- [ ] Meeting prep module
- [ ] Birthday/anniversary reminders
- [ ] Calendar integration

### Phase 6: Behavioral Learning (Future)
- [ ] Fix pattern analysis engine (runs automatically)
- [ ] Silent classification prompt evolution based on correction history
- [ ] Learning logged in audit trail for transparency
- [ ] Performance metrics dashboard (optional)

---

## 9. Restart Design

When the user falls off (vacation, sick, DND, just busy):

1. **No backlog monster** — items sit in their buckets, digests stop during DND
2. **On return:** One "welcome back" message:
   - "You've been away 5 days. Here's what matters:"
   - Top 3 overdue actions
   - Anything stuck
   - Items needing review
   - ≤200 words
3. **No guilt** — system doesn't say "you missed 47 items"
4. **Easy restart** — just send `/drop` or any message and the system resumes normally

---

## 10. Token Budget

| Component | Daily Token Estimate | Monthly Cost |
|-----------|---------------------|-------------|
| Classification (10 drops/day, Sonnet) | 8,000 | ~$7.20 |
| Digests (4 daily + 1 weekly, Sonnet) | 6,000 | ~$5.40 |
| Reactive nudges (~2/day, Sonnet) | 2,000 | ~$1.80 |
| Fix processing (~2/day, deterministic) | 0 | $0.00 |
| Weekly review (Sonnet) | 2,500 | ~$0.60 |
| **Total** | **~18,500/day** | **~$15/month** |

Compare to doing everything through Opus conversation: ~50K+ tokens/day → ~$45+/month.

**Lobster saves ~60-70% of token costs** by handling orchestration deterministically.

---

## 11. What Changes for the User

**Before Brain 2.0:**
- Thoughts get lost between chats
- Must remember to follow up on things
- No system tracks what's stuck
- Information scattered across conversations

**After Brain 2.0:**
- One behavior: `/drop` when a thought hits
- System handles everything else
- Morning tells you what matters
- Sunday tells you what's stuck
- `/fix` if something's wrong (trivial correction)
- System gets smarter over time
- Works whether you're motivated or not

---

## 12. Open Questions for Dr. Castro

1. ~~**Bucket names**~~ ✅ **Resolved** — 8 buckets: People, Projects, Ideas, Admin, Documents, Goals, Health, Finance
2. ~~**Digest times**~~ ✅ **Resolved** — 7AM/12PM/5PM/9PM ET + Sunday 10AM. All times user-configurable via plugin config.
3. ~~**Confidence threshold**~~ ✅ **Resolved** — Starting at 0.80 (cautious). Configurable, can lower later as trust builds.
4. ~~**DND trigger**~~ ✅ **Resolved** — Both: auto-quiet hours (10PM–7AM ET) + manual `/dnd on`/`/dnd off` override anytime.
5. ~~**Existing data**~~ ✅ **Resolved** — Seed Brain from existing sources: doc-RAG documents + memory/*.md notes. Run initial classification pass on import.
6. ~~**Voice drops**~~ ✅ **Resolved** — Optional module, not in core loop. Build after Phase 4 if desired. Adds transcription step (Whisper) before classification.
7. ~~**Photo drops**~~ ✅ **Resolved** — Core loop. Photos (whiteboard, receipts, business cards, etc.) → OCR → classify → store. Reuse existing OCR from doc-RAG.
8. ~~**Build priority**~~ ✅ **Resolved** — Finish full design review, then greenlight build.
9. ~~**Dedup behavior**~~ ✅ **Resolved** — Auto-merge. Similar drops (cosine >0.92) append to existing record's entries log.
10. ~~**Notification channel**~~ ✅ **Resolved** — Separate Telegram thread/bot for digests + nudges. Commands stay in main chat.
11. ~~**Weekly review depth**~~ ✅ **Resolved** — Both: bucket health stats header + actionable focus items below.
12. ~~**Learning consent model**~~ ✅ **Resolved** — Silent learning. System adapts classification based on /fix patterns automatically. User can always /fix if it overcorrects.

---

## 13. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM classification quality | Structured prompts + confidence scoring + bouncer + fix loop |
| Token cost overrun | Lobster pipelines + Sonnet (not Opus) + usage-aware backoff |
| Data loss | LanceDB on disk + regular backups + audit trail |
| System feels like noise | Strict word limits + DND + user-controlled frequency |
| Backlog anxiety | Restart design — no pile-up, supportive re-entry |
| Schema rigidity | Keep fields minimal, `entries[]` log per record for flexibility |
| Classification drift | Silent auto-learning from /fix patterns + audit trail for transparency |
