# 🧠 Brain 2.0 — OpenClaw Plugin

> Your second brain. Capture anything, organize nothing.

---

## Table of Contents

- [What is Brain 2.0](#what-is-brain-20)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Core Concepts](#core-concepts)
  - [Drops](#drops)
  - [Buckets](#buckets)
  - [Classification](#classification)
  - [Auto-Routing](#auto-routing)
  - [Deduplication](#deduplication)
  - [Action Routing](#action-routing)
- [Tools Reference](#tools-reference)
  - [brain_drop](#brain_drop)
  - [brain_search](#brain_search)
  - [brain_stats](#brain_stats)
  - [brain_audit](#brain_audit)
  - [brain_digest](#brain_digest)
  - [brain_dnd](#brain_dnd)
  - [brain_fix](#brain_fix)
- [CLI Reference](#cli-reference)
- [Slash Commands](#slash-commands)
- [Bracket Tags](#bracket-tags)
- [Digests](#digests)
- [Do Not Disturb](#do-not-disturb)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

---

## What is Brain 2.0

Brain 2.0 is a behavioral support system that extends your biological memory. The philosophy is simple: **capture everything, organize nothing**. You drop raw thoughts — a name, an idea, a reminder, a to-do — and Brain automatically classifies them, files them into the right bucket, detects duplicates, and even creates persistent reminders for time-sensitive items. You never have to decide where something goes. Just drop it and move on.

Brain also keeps you on track with **bite-sized digests** throughout the day — morning briefs, midday checks, afternoon wraps, and night wind-downs. Each digest is intentionally small — **Pinky** 🤙 — so you can scan it and act in seconds, not minutes. There's also a weekly review to zoom out and see the bigger picture.

Brain offers **two ways to interact**. Slash commands (`/brain drop`, `/brain search`, etc.) execute instantly without touching the AI — they're faster, cheaper, and critically, **don't add to your chat context**. Your conversation window stays clean for the work that matters. Just type `/brain drop Pick up prescription tomorrow` and it's captured, classified, and reminded — zero AI tokens spent.

For richer interactions, agent tools (`brain_drop`, `brain_search`, etc.) work through natural conversation, letting the AI reason about your query and provide contextual follow-ups. For example: *"Did I already drop something about picking up my prescription?"* — the AI searches your brain, finds the match, and confirms the context back to you.

---

## Quick Start

### 1. Install

Brain 2.0 is a **separate plugin** — it does not come bundled with OpenClaw.

**Option A: From GitHub (recommended)**

```bash
git clone https://github.com/quackstro/openclaw-brain.git ~/.openclaw/extensions/brain
cd ~/.openclaw/extensions/brain
npm install
```

**Option B: From npm** *(coming soon)*

```bash
openclaw plugins install @quackstro/brain
```

Then restart OpenClaw to load the plugin:

```bash
openclaw gateway restart
```

Verify it loaded:

```bash
openclaw plugins list
# Should show: brain — Brain 2.0
```

### 2. Configure

Add your embedding API key to the Brain config in your OpenClaw configuration (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "brain": {
      "embedding": {
        "apiKey": "your-api-key-here"
      },
      "classification": {
        "apiKey": "your-gateway-token"
      }
    }
  }
}
```

### 3. First Drop

**Slash command** (fastest — no AI, no context cost):

```
/brain drop Call dentist next Tuesday
```

**Agent tool** (programmatic — used by the AI when you interact via chat):

> brain_drop: "Call dentist next Tuesday"

**Natural language** (conversational — the AI decides to use Brain for you):

> "Remember that I need to call the dentist next Tuesday"

All three do the same thing. Brain captures it, classifies it as **admin** (appointment), and creates a reminder for Tuesday. ✅

---

## Configuration

All options live under the `brain` key in your OpenClaw plugin config.

### Embedding

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `embedding.apiKey` | string | *required* | API key for generating embeddings. Supports OpenAI and Google Gemini keys (auto-detected from key prefix — keys starting with `AI` use Gemini). |
| `embedding.model` | string | `text-embedding-3-small` | Embedding model. Options: `text-embedding-3-small`, `text-embedding-3-large`, `gemini-embedding-001` |
| `embedding.baseURL` | string | — | Custom base URL for OpenAI-compatible embedding APIs |

### Classification

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `classification.apiKey` | string | — | API key / gateway token for the classification LLM. If omitted, classification is disabled and drops stay in the inbox. |
| `classification.model` | string | `claude-sonnet-4-20250514` | LLM model used for classifying thoughts |
| `classification.confidenceThreshold` | number | `0.80` | Minimum confidence (0.0–1.0) required to auto-route a drop to a bucket. Below this, the item goes to **needs review**. |

### Storage

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage.dbPath` | string | `~/.openclaw/brain/lancedb` | Path to the LanceDB database directory |

### Digests

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `digests.enabled` | boolean | — | Master switch for the digest system |
| `digests.timezone` | string | — | IANA timezone for digest scheduling (e.g., `America/New_York`) |
| `digests.schedule.morning.enabled` | boolean | — | Enable the morning digest |
| `digests.schedule.morning.time` | string | — | Time to send (e.g., `"07:30"`) |
| `digests.schedule.morning.maxWords` | number | `150` | Soft word limit for morning digest |
| `digests.schedule.midday.enabled` | boolean | — | Enable midday check-in |
| `digests.schedule.midday.time` | string | — | Time to send |
| `digests.schedule.midday.maxWords` | number | `100` | Soft word limit |
| `digests.schedule.afternoon.enabled` | boolean | — | Enable afternoon wrap-up |
| `digests.schedule.afternoon.time` | string | — | Time to send |
| `digests.schedule.afternoon.maxWords` | number | `120` | Soft word limit |
| `digests.schedule.night.enabled` | boolean | — | Enable night wind-down |
| `digests.schedule.night.time` | string | — | Time to send |
| `digests.schedule.night.maxWords` | number | `100` | Soft word limit |
| `digests.schedule.weekly.enabled` | boolean | — | Enable weekly review |
| `digests.schedule.weekly.day` | string | — | Day of week (e.g., `"sunday"`) |
| `digests.schedule.weekly.time` | string | — | Time to send |
| `digests.schedule.weekly.maxWords` | number | `250` | Soft word limit |

### Do Not Disturb

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dnd.autoQuiet.enabled` | boolean | `true` | Automatically silence digests during quiet hours |
| `dnd.autoQuiet.from` | string | `"22:00"` | Start of quiet hours (24h format) |
| `dnd.autoQuiet.to` | string | `"07:00"` | End of quiet hours (24h format) |
| `dnd.manual` | boolean | `false` | Manual DND override |

### Usage Awareness

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `usageAware.enabled` | boolean | — | Enable usage-aware backoff for API calls |
| `usageAware.backoffThreshold` | number | — | Token usage threshold to trigger backoff |

---

## Core Concepts

### Drops

A **drop** is the fundamental unit of Brain. One thought = one drop. You don't need to think about where it goes, what to tag it, or how to format it. Just drop it.

```
"Met Sarah from Acme Corp at the conference, she's working on ML infrastructure"
"Remind me to renew my passport before March"
"What if we built a CLI tool that generates changelogs from git history?"
"Gym appointment Thursday 3pm"
```

Each drop is:
1. Saved to the **inbox** with a timestamp and embedding vector
2. **Classified** by an LLM into a bucket with a confidence score
3. **Routed** to the right bucket (or flagged for review if confidence is low)
4. Checked for **duplicates** and auto-merged if a near-match exists
5. Scanned for **time-sensitive actions** (reminders, bookings, etc.)

Photos are also supported — if you drop a photo and [Tesseract](https://github.com/tesseract-ocr/tesseract) is installed, Brain runs OCR to extract the text before classifying. If Tesseract isn't installed, the photo drop still works but skips text extraction silently (no error — it just classifies based on any accompanying text instead).

### Buckets

Brain organizes your thoughts into **8 buckets**:

| Bucket | What goes here | Example |
|--------|---------------|---------|
| 🧑 **people** | Contacts, relationships, follow-ups | "Met Sarah from Acme, follow up next week" |
| 📁 **projects** | Active work, tasks, deadlines | "Website redesign — waiting on design mockups" |
| 💡 **ideas** | New concepts, what-ifs, opportunities | "What if we built a personal CRM?" |
| 📋 **admin** | Appointments, errands, logistics | "Dentist appointment Thursday at 2pm" |
| 📄 **documents** | Articles, references, resources | "Great article on distributed systems by Martin Kleppmann" |
| 🎯 **goals** | Long-term objectives, milestones | "Run a half marathon by September" |
| 🏥 **health** | Medical, fitness, nutrition, wellness | "Blood pressure was 120/80 at last checkup" |
| 💰 **finance** | Bills, investments, expenses, budgets | "Electric bill due on the 15th — $142" |

Each bucket has its own schema with fields tailored to its purpose (e.g., people records track `company`, `contactInfo`, and `lastInteraction`; finance records track `amount`, `currency`, and `recurring` schedules).

There are also **3 system tables**: `inbox` (pending drops), `needs_review` (low-confidence items), and `audit_trail` (full history).

### Classification

When you drop a thought, Brain sends it to an LLM (Claude or Gemini) with a classification prompt. The LLM returns structured JSON with:

- **bucket** — which of the 8 buckets it belongs to
- **confidence** — how sure the model is (0.0 to 1.0)
- **title** — a short label (≤8 words)
- **summary** — 1–2 sentence distillation
- **nextActions** — concrete next steps
- **entities** — extracted people, dates, amounts, locations
- **urgency** — `now`, `today`, `this-week`, or `someday`
- **followUpDate** — specific date if applicable
- **tags** — up to 3 auto-generated tags
- **detectedIntent** — `reminder`, `todo`, `purchase`, `call`, `booking`, or `none`

### Auto-Routing

After classification, the **router** (the "Bouncer") decides what happens:

- **Confidence ≥ threshold** (default 0.80): The drop is automatically routed to the target bucket. A structured record is created with all the classified fields.
- **Confidence < threshold** or **unknown bucket**: The drop goes to the **needs_review** queue. You can review it later and manually route it with `brain_fix`.

The inbox entry is cleaned up after successful routing.

### Deduplication

Before creating a new record, Brain checks for duplicates using **cosine similarity** on embedding vectors. If an existing record in the same bucket has a similarity score ≥ **0.92** (92%), the new drop is **auto-merged** into the existing record instead of creating a duplicate.

Merging appends the new information to the existing record's entry log and combines next-actions (with deduplication).

### Action Routing

After classification and bucket routing, Brain's **action router** inspects each drop for actionable intent. It handles:

| Intent | What happens |
|--------|-------------|
| **reminder** | Creates a persistent cron reminder with Telegram inline buttons (Dismiss / Snooze). Nags every 5 minutes until you act. |
| **booking** | Same as reminder — extracts the appointment time and sets up notifications. |
| **todo** | Tags the item and logs it to the audit trail. |
| **purchase** | Tags the item with amount info from extracted entities. |
| **call** | Tags the item with contact info from extracted entities. |

Time extraction uses an LLM call to parse natural language like "next Tuesday at 3pm" or "every Monday morning" into precise dates and cron expressions.

**Intent priority**: Explicit bracket tag (e.g., `[Reminder]`) > classifier-detected intent > keyword heuristics (regex patterns for times, days, and reminder words).

---

## Tools Reference

### brain_drop

Capture a thought into the Brain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | ✅ | The raw thought to capture |
| `source` | string | — | Source type: `drop`, `chat`, `file`, `voice`, `photo` (default: `drop`) |
| `mediaPath` | string | — | Path to attached media for photo OCR |

**Examples:**

```
brain_drop("Met Sarah from Acme Corp at the conference")
→ ✅ Captured → routed to people

brain_drop("[Reminder] call mom at 5pm")
→ ✅ Captured [reminder] → reminder created

brain_drop("Electric bill is $142, due on the 15th")
→ ✅ Captured → routed to finance
```

### brain_search

Search across all buckets (or a specific one) by semantic similarity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Natural language search query |
| `bucket` | string | — | Limit to one bucket: `people`, `projects`, `ideas`, `admin`, `documents`, `goals`, `health`, `finance` |
| `limit` | number | — | Max results (default: 5) |

**Example:**

```
brain_search("Sarah from Acme")
→ Found 2 results:
  1. [people] Sarah — Acme Corp ML Infrastructure (87%)
  2. [projects] Acme Partnership (62%)
```

### brain_stats

Show record counts and health for all Brain buckets. Takes no parameters.

**Example output:**

```
📊 Brain Stats:
  inbox: 0 records
  people: 12 records
  projects: 5 records
  ideas: 8 records
  admin: 3 records
  documents: 2 records
  goals: 4 records
  health: 1 records
  finance: 6 records
  needs_review: 1 records
  audit_trail: 87 records

  Total: 129 records
  Disk: 14.2 MB
```

### brain_audit

View the audit trail for a specific item or recent actions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputId` | string | — | Show audit entries for this specific item ID |
| `limit` | number | — | Max entries to show (default: 10) |

**Example:**

```
brain_audit(inputId: "abc12345")
→ 📋 Audit Trail (3 entries):
  [2025-06-01T10:30:00] captured — Captured drop: "Call dentist Tuesday"
  [2025-06-01T10:30:01] classified — Classified as admin (0.94): "Dentist Appointment"
  [2025-06-01T10:30:02] routed — Routed to admin with confidence 0.94
```

### brain_digest

Generate a Brain digest. Respects DND — if quiet mode is active, the digest is skipped and recorded.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | ✅ | Digest type: `morning`, `midday`, `afternoon`, `night`, or `weekly` |

**Example:**

```
brain_digest(type: "morning")
→ ☀️ Morning Brief
  🎯 Today's Actions:
    1. [admin] Dentist Appointment (overdue: 2025-05-30) → Call to reschedule
    2. [people] Sarah (overdue: 2025-06-01) → Send follow-up email
  ⚠️ 4 overdue items total — check Brain for details.
```

### brain_dnd

Control Do Not Disturb mode for Brain notifications.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `status`, `on`, or `off` |

**Examples:**

```
brain_dnd(action: "status")  → 🔔 DND is OFF: Not in DND
brain_dnd(action: "on")      → 🔇 Do Not Disturb enabled. All Brain notifications paused.
brain_dnd(action: "off")     → 🔔 Do Not Disturb disabled. Notifications resumed.
                                While DND was active, 2 digest(s) were skipped: morning, midday.
```

### brain_fix

Fix, move, merge, or inspect a Brain item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | ✅ | The item ID to fix |
| `correction` | string | — | Fix syntax (see below). Omit to show item details. |

**Fix syntax:**

| Syntax | What it does |
|--------|-------------|
| `→ people` | Move item to the people bucket |
| `→ trash` | Delete item permanently |
| `action: "call them back"` | Add/update the next action |
| `merge abc123` | Merge another item into this one |
| *(omitted)* | Show item details and available fixes |

**Examples:**

```
brain_fix(id: "abc123")
→ 📋 Sarah — Acme Corp
    Bucket: people
    ID: abc12345-...
    context: Met at conference, works on ML infrastructure
    nextActions: ["Send follow-up email"]
    ...

brain_fix(id: "abc123", correction: "→ projects")
→ ✅ Moved "Sarah" from people → projects

brain_fix(id: "abc123", correction: "→ trash")
→ 🗑️ Deleted "Sarah" from people.

brain_fix(id: "abc123", correction: 'action: "Schedule coffee chat"')
→ ✅ Updated next action for "Sarah": Schedule coffee chat

brain_fix(id: "abc123", correction: "merge def456")
→ ✅ Merged "Other Sarah Note" into "Sarah". Combined 4 entries, 3 actions.
```

---

## CLI Reference

Brain also provides CLI commands via `openclaw brain`:

| Command | Description |
|---------|-------------|
| `openclaw brain stats` | Show bucket record counts |
| `openclaw brain list <bucket>` | List records in a bucket (e.g., `openclaw brain list people --limit 10`) |
| `openclaw brain drop "<text>"` | Drop a thought from the command line |
| `openclaw brain audit` | Show recent audit trail entries (`--id <inputId>` to filter, `--limit <n>`) |

---

## Slash Commands

Brain registers a `/brain` slash command that works directly in Telegram (and other channels) **without invoking the AI agent**.

**Why this matters:**

- ⚡ **Instant** — No LLM round-trip. Results come back in milliseconds, not seconds.
- 💰 **Zero token cost** — Slash commands don't consume any AI tokens.
- 🧹 **No context pollution** — The biggest advantage. Slash commands don't add messages to your chat history. When you drop a thought via `/brain drop`, it doesn't eat into your conversation window. Your chat context stays focused on the current task, not cluttered with brain operations.
- 🔒 **Deterministic** — Same input, same output. No LLM interpretation or hallucination risk.

Use slash commands for quick captures, lookups, and status checks. Use the agent tools (via natural chat) when you need conversational follow-ups or complex queries like "search my brain for that thing my neighbor mentioned about 3D printing."

### `/brain`

Show the Brain dashboard — bucket counts + DND status.

```
🧠 Brain 2.0 Dashboard

  people: 2
  projects: 37
  ideas: 11
  ...

🔔 DND: OFF

Commands: drop, search, stats, dnd
```

### `/brain drop <text>`

Quick-capture a thought. Runs the full classify → route pipeline synchronously.

```
/brain drop Call dentist about appointment next Tuesday
```
→ `✅ Captured [ToDo]` (with ID)

### `/brain search <query>`

Semantic search across all buckets. Returns top 5 matches with scores.

```
/brain search mobile app project status
```
→ 
```
🔍 Found 5 results:

1. [projects] Mobile App Redesign (92%)
2. [projects] Payment Integration (78%)
3. [admin] Weekly report schedule (71%)
...
```

### `/brain stats`

Show record counts per bucket (same as the dashboard stats section).

### `/brain dnd [on|off|status]`

Control Do Not Disturb mode directly.

```
/brain dnd on      → 🔇 Do Not Disturb enabled.
/brain dnd off     → 🔔 Do Not Disturb disabled.
/brain dnd status  → 🔇 DND is ON: Manual override
/brain dnd         → (same as status)
```

> **💡 Tip:** For routine Brain operations (quick drops, status checks, DND toggles), always prefer slash commands. Reserve agent tools for when you need the AI to reason about your query — e.g., "what was that project idea I had last week about security cameras?"

---

## Bracket Tags

You can prefix your drops with bracket tags to explicitly tell Brain what kind of action this is. Tags are **case-insensitive** and are stripped from the text before classification.

| Tag | Intent | What happens |
|-----|--------|-------------|
| `[ToDo]` | todo | Tagged as a task, logged to audit |
| `[Reminder]` | reminder | Creates a persistent cron reminder with Telegram buttons |
| `[Buy]` | purchase | Tagged as a purchase item with amount extraction |
| `[Call]` | call | Tagged as a call follow-up with contact extraction |
| `[Book]` | booking | Creates an appointment reminder (like Reminder) |

**Examples:**

```
[ToDo] buy groceries after work
[Reminder] call mom at 5pm tomorrow
[Buy] new headphones — budget $200
[Call] follow up with Dr. Smith about lab results
[Book] dinner reservation Friday 7pm at Olive Garden
```

If no bracket tag is provided, Brain uses the classifier's detected intent and keyword heuristics to infer the action automatically.

---

## Digests

> **Feature codename: Pinky** 🤙
>
> Digests are intentionally small — bite-sized summaries you can scan and act on in seconds, not minutes. This is a core design principle: if a digest requires effort to read, it's failed. Word limits are enforced per digest type to keep them tight and actionable.

Brain generates **5 types of digests** to keep you on track throughout the day:

### ☀️ Morning Brief (default: 150 words)
- Top 3 actions for today (urgent + overdue items)
- Overdue summary
- Items waiting for your review (>24h old)

### 🕐 Midday Check (default: 100 words)
- Items due today that aren't started
- Stuck items (no update in 3+ days)

### 🌆 Afternoon Wrap (default: 120 words)
- What moved today (recent activity)
- What carries to tomorrow

### 🌙 Night Wind-down (default: 100 words)
- Tomorrow's priorities
- Pending follow-ups (especially people)

### 📊 Weekly Review (default: 250 words)
- Bucket health overview (overdue, stuck, active counts)
- This week's focus (top 3 actions)
- Stuck items that need unblocking
- Wins from the past week

Daily digests are **template-based** (no LLM cost). They pull data directly from your buckets and format it using predefined templates.

All digests respect **DND mode** — if DND is active, the digest is recorded as skipped and can be caught up later.

---

## Do Not Disturb

Brain's DND system controls when digests and notifications are sent.

### Auto-Quiet Hours
By default, Brain is silent from **10:00 PM to 7:00 AM** (Eastern Time). During quiet hours, digests are skipped and recorded. You can customize the window in config.

### Manual Override
- **`brain_dnd(action: "on")`** — Immediately silences all Brain notifications. Overrides auto-quiet settings.
- **`brain_dnd(action: "off")`** — Resumes notifications. If digests were skipped during DND, Brain tells you what you missed.

### Recovery
When you turn DND off, Brain reports which digests were skipped so you can generate a catch-up summary if needed. It does **not** flood you with all the missed digests — just a single summary.

DND state is persisted to `~/.openclaw/brain/dnd-state.json` and survives restarts.

---

## Architecture

```
User Input
    │
    ▼
┌──────────┐    ┌────────────┐    ┌──────────┐    ┌──────────────┐
│ Tag Parse │───▶│  Embedder  │───▶│  Inbox   │───▶│  Classifier  │
│ [ToDo]…  │    │ (Gemini /  │    │ (LanceDB)│    │ (Claude /    │
└──────────┘    │  OpenAI)   │    └──────────┘    │  Gemini)     │
                └────────────┘                     └──────┬───────┘
                                                          │
                                                          ▼
                                                   ┌──────────────┐
                                                   │   Router     │
                                                   │ (Confidence  │
                                                   │  + Dedup)    │
                                                   └──────┬───────┘
                                                          │
                                          ┌───────────────┼───────────────┐
                                          ▼               ▼               ▼
                                    ┌──────────┐   ┌────────────┐  ┌─────────────┐
                                    │  Bucket  │   │   Needs    │  │ Auto-Merge  │
                                    │ (1 of 8) │   │   Review   │  │ (existing)  │
                                    └────┬─────┘   └────────────┘  └─────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │Action Router │
                                  │ (Reminders,  │
                                  │  ToDos, etc) │
                                  └──────────────┘
```

**Key technologies:**
- **LanceDB** — Embedded vector database for storage + semantic search (11 tables total)
- **Embeddings** — OpenAI `text-embedding-3-small` (1536 dim) or Gemini `gemini-embedding-001` (3072 dim)
- **Classification** — LLM-powered via OpenClaw gateway (Claude) or direct Gemini API
- **Reminders** — Persistent cron jobs via `openclaw cron` with Telegram inline button delivery
- **Audit Trail** — Every action logged (capture, classify, route, merge, fix)

---

## Troubleshooting

### "brain: no config provided, plugin inactive"
You need to add an `embedding.apiKey` to your Brain config. This is the only required field.

### Drops stay in inbox (never classified)
Make sure `classification.apiKey` is set. Without it, classification is disabled and drops remain in the inbox as "pending."

### Items going to needs_review too often
Lower the `classification.confidenceThreshold` (e.g., from `0.80` to `0.70`). The default is conservative — a 70% threshold lets more items auto-route.

### Duplicate items not being merged
Deduplication uses a cosine similarity threshold of **0.92**. If two items are similar but not *very* similar, they'll be stored separately. You can manually merge with `brain_fix(id: "abc", correction: "merge def")`.

### Reminders not firing
Check that:
1. The action router config has a valid `gatewayToken` (same as `classification.apiKey`)
2. The cron jobs exist: `openclaw cron list`
3. The reminder script exists at `/home/clawdbot/clawd/scripts/brain-reminder.mjs`

### OCR not working on photo drops
Tesseract is **optional** — Brain works without it, but photo drops won't extract text. To enable OCR:

```bash
# Debian/Ubuntu
sudo apt install tesseract-ocr

# macOS
brew install tesseract
```

If Tesseract is missing, photo drops silently skip OCR and classify based on any text you include with the photo.

### How to see everything Brain knows
- `brain_stats` — record counts per bucket
- `brain_search("*")` — browse items
- `openclaw brain list <bucket>` — list all records in a bucket
- `brain_audit` — view the full audit trail
