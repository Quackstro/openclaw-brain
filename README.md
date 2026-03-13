# 🧠 Brain 2.0 | OpenClaw Plugin

> Your second brain. Capture anything, organize nothing.

> 💛 **Like Brain?** Tips help keep development going: `D6i8TeepmrGztENxdME84d2x5UVjLWncat` (DOGE)

---

## Table of Contents

- [What is Brain 2.0](#what-is-brain-20)
- [Quick Start](#quick-start)
- [Everyday Use](#everyday-use)
- [Your Buckets](#your-buckets)
- [Staying on Track](#staying-on-track)
- [Managing Your Brain](#managing-your-brain)
- [Going Deeper](#going-deeper)
- [Under the Hood](#under-the-hood)
- [Reference](#reference)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## What is Brain 2.0

Brain 2.0 is a behavioral support system that extends your biological memory. The philosophy is simple: **capture everything, organize nothing**. You drop raw thoughts (a name, an idea, a reminder, a to-do) and Brain automatically classifies them, files them into the right bucket, detects duplicates, and even creates persistent reminders for time-sensitive items. You never have to decide where something goes. Just drop it and move on.

Brain also keeps you on track with **bite-sized digests** throughout the day: morning briefs, midday checks, afternoon wraps, and night wind-downs. Each digest is intentionally small, **Pinky** 🤙, so you can scan it and act in seconds, not minutes. There's also a weekly review to zoom out and see the bigger picture.

Brain offers **two ways to interact**. Slash commands (`/brain drop`, `/brain search`, etc.) execute instantly without touching the AI: they're faster, cheaper, and critically, **don't add to your chat context**. Your conversation window stays clean for the work that matters. Just type `/drop Pick up prescription tomorrow` and it's captured, classified, and reminded, all at zero AI token cost.

For richer interactions, agent tools (`brain_drop`, `brain_search`, etc.) work through natural conversation, letting the AI reason about your query and provide contextual follow-ups. For example: *"Did I already drop something about picking up my prescription?"* and the AI searches your brain, finds the match, and confirms the context back to you.

---

## Quick Start

### 1. Install

Brain 2.0 is a **separate plugin** and does not come bundled with OpenClaw.

**Option A: From npm**

```bash
openclaw plugins install @quackstro/openclaw-brain
```

**Option B: From GitHub**

```bash
git clone https://github.com/Quackstro/openclaw-brain.git ~/.openclaw/extensions/brain
cd ~/.openclaw/extensions/brain
npm install && npm run build
```

Then restart OpenClaw to load the plugin:

```bash
openclaw gateway restart
```

Verify it loaded:

```bash
openclaw plugins list
# Should show: brain - Brain 2.0
```

### 2. Configure

Add your embedding API key to the Brain config in your OpenClaw configuration (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "brain": {
        "config": {
          "embedding": {
            "apiKey": "your-gemini-or-openai-key",
            "model": "gemini-embedding-001"
          },
          "classifier": {
            "apiKey": "your-gateway-token",
            "model": "claude-haiku-3.5"
          }
        }
      }
    },
    "slots": {
      "memory": "brain"
    }
  }
}
```

> **Note:** Set `plugins.slots.memory` to `"brain"` so it takes the memory plugin slot instead of the built-in `memory-core`.

### 3. First Drop

**Slash command** (fastest, no AI, no context cost):

```
/drop Call dentist next Tuesday
```

**Agent tool** (programmatic, used by the AI when you interact via chat):

> brain_drop: "Call dentist next Tuesday"

**Natural language** (conversational, the AI decides to use Brain for you):

> "Remember that I need to call the dentist next Tuesday"

All three do the same thing. Brain captures it, classifies it as **admin** (appointment), and creates a reminder for Tuesday. ✅

---

## Everyday Use

### Slash Commands

Brain registers a `/brain` slash command that works directly in Telegram (and other channels) **without invoking the AI agent**.

> **💡 Why slash commands matter:**
>
> - ⚡ **Instant**: No LLM round-trip. Results come back in milliseconds, not seconds.
> - 💰 **Zero token cost**: Slash commands don't consume any AI tokens.
> - 🧹 **No context pollution**: The biggest advantage. Slash commands don't add messages to your chat history. When you drop a thought via `/brain drop`, it doesn't eat into your conversation window. Your chat context stays focused on the current task, not cluttered with brain operations.
> - 🔒 **Deterministic**: Same input, same output. No LLM interpretation or hallucination risk.

Use slash commands for quick captures, lookups, and status checks. Use the agent tools (via natural chat) when you need conversational follow-ups or complex queries like "search my brain for that thing my neighbor mentioned about 3D printing."

#### `/brain`

Show the Brain dashboard with bucket counts and DND status.

```
🧠 Brain 2.0 Dashboard

  people: 2
  projects: 37
  ideas: 11
  ...

🔔 DND: OFF

Commands: drop, search, stats, dnd
```

#### `/drop <text>`

The fastest way to capture a thought. Shortcut for `/brain drop`.

```
/drop Call dentist about appointment next Tuesday
```
→ `✅ Captured [ToDo]` (with ID)

#### `/brain drop <text>`

Same as `/drop`, for when you want the full command.

```
/brain drop Pick up prescription tomorrow
```
→ `✅ Captured` (with ID)

#### `/brain search <query>`

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

#### `/brain stats`

Show record counts per bucket (same as the dashboard stats section).

#### `/brain dnd [on|off|status]`

Control Do Not Disturb mode directly.

```
/brain dnd on      → 🔇 Do Not Disturb enabled.
/brain dnd off     → 🔔 Do Not Disturb disabled.
/brain dnd status  → 🔇 DND is ON: Manual override
/brain dnd         → (same as status)
```

> **💡 Tip:** For routine Brain operations (quick drops, status checks, DND toggles), always prefer slash commands. Reserve agent tools for when you need the AI to reason about your query, e.g., "what was that project idea I had last week about security cameras?"

### Natural Language

You don't need slash commands or tool names. Just talk to your assistant:

```
"Met Sarah from Acme Corp at the conference, she's working on ML infrastructure"
"Remind me to renew my passport before March"
"What if we built a CLI tool that generates changelogs from git history?"
"Gym appointment Thursday 3pm"
```

The AI recognizes these as Brain-worthy and uses the right tool automatically.

### Bracket Tags

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
[Buy] new headphones, budget $200
[Call] follow up with Dr. Smith about lab results
[Book] dinner reservation Friday 7pm at Olive Garden
```

If no bracket tag is provided, Brain uses the classifier's detected intent and keyword heuristics to infer the action automatically.

---

## Your Buckets

Brain organizes your thoughts into **8 buckets**:

| Bucket | What goes here | Example |
|--------|---------------|---------|
| 🧑 **people** | Contacts, relationships, follow-ups | "Met Sarah from Acme, follow up next week" |
| 📁 **projects** | Active work, tasks, deadlines | "Website redesign, waiting on design mockups" |
| 💡 **ideas** | New concepts, what-ifs, opportunities | "What if we built a personal CRM?" |
| 📋 **admin** | Appointments, errands, logistics | "Dentist appointment Thursday at 2pm" |
| 📄 **documents** | Articles, references, resources | "Great article on distributed systems by Martin Kleppmann" |
| 🎯 **goals** | Long-term objectives, milestones | "Run a half marathon by September" |
| 🏥 **health** | Medical, fitness, nutrition, wellness | "Blood pressure was 120/80 at last checkup" |
| 💰 **finance** | Bills, investments, expenses, budgets | "Electric bill due on the 15th, $142" |

Each bucket has its own schema with fields tailored to its purpose (e.g., people records track `company`, `contactInfo`, and `lastInteraction`; finance records track `amount`, `currency`, and `recurring` schedules).

There are also **3 system tables**: `inbox` (pending drops), `needs_review` (low-confidence items), and `audit_trail` (full history).

---

## Staying on Track

### Digests (Pinky 🤙) — *Planned*

> ⚠️ **Digests are not yet implemented in the current version.** The design below describes the planned feature.
>
> Digests are intentionally small. Bite-sized summaries you can scan and act on in seconds, not minutes. This is a core design principle: if a digest requires effort to read, it's failed. Word limits are enforced per digest type to keep them tight and actionable.

Brain generates **5 types of digests** to keep you on track throughout the day:

#### ☀️ Morning Brief (default: 150 words)
- Top 3 actions for today (urgent + overdue items)
- Overdue summary
- Items waiting for your review (>24h old)

#### 🕐 Midday Check (default: 100 words)
- Items due today that aren't started
- Stuck items (no update in 3+ days)

#### 🌆 Afternoon Wrap (default: 120 words)
- What moved today (recent activity)
- What carries to tomorrow

#### 🌙 Night Wind-down (default: 100 words)
- Tomorrow's priorities
- Pending follow-ups (especially people)

#### 📊 Weekly Review (default: 250 words)
- Bucket health overview (overdue, stuck, active counts)
- This week's focus (top 3 actions)
- Stuck items that need unblocking
- Wins from the past week

Daily digests are **template-based** (no LLM cost). They pull data directly from your buckets and format it using predefined templates.

### Do Not Disturb

Brain's DND system controls when digests and notifications are sent. All digests respect DND mode: if DND is active, the digest is recorded as skipped and can be caught up later.

**Auto-Quiet Hours:** By default, Brain is silent from **10:00 PM to 7:00 AM** (Eastern Time). During quiet hours, digests are skipped and recorded. You can customize the window in config.

**Manual Override:**
- `brain_dnd(action: "on")`: Immediately silences all Brain notifications. Overrides auto-quiet settings.
- `brain_dnd(action: "off")`: Resumes notifications. If digests were skipped during DND, Brain tells you what you missed.

**Recovery:** When you turn DND off, Brain reports which digests were skipped so you can generate a catch-up summary if needed. It does **not** flood you with all the missed digests; just a single summary.

DND state is persisted to `~/.openclaw/brain/dnd-state.json` and survives restarts.

---

## Managing Your Brain

### Searching

Use `brain_search` to find anything across your Brain by semantic similarity.

```
brain_search("Sarah from Acme")
→ Found 2 results:
  1. [people] Sarah, Acme Corp ML Infrastructure (87%)
  2. [projects] Acme Partnership (62%)
```

You can also limit to a specific bucket:

```
brain_search(query: "headphones", bucket: "finance")
```

### Fixing and Moving Items

Use `brain_fix` to inspect, move, trash, update, or merge items.

**Show details** (omit the correction):

```
brain_fix(id: "abc123")
→ 📋 Sarah, Acme Corp
    Bucket: people
    ID: abc12345-...
    context: Met at conference, works on ML infrastructure
    nextActions: ["Send follow-up email"]
    ...
```

**Move to a different bucket:**

```
brain_fix(id: "abc123", correction: "→ projects")
→ ✅ Moved "Sarah" from people → projects
```

**Delete permanently:**

```
brain_fix(id: "abc123", correction: "→ trash")
→ 🗑️ Deleted "Sarah" from people.
```

**Update the next action:**

```
brain_fix(id: "abc123", correction: 'action: "Schedule coffee chat"')
→ ✅ Updated next action for "Sarah": Schedule coffee chat
```

**Merge two items:**

```
brain_fix(id: "abc123", correction: "merge def456")
→ ✅ Merged "Other Sarah Note" into "Sarah". Combined 4 entries, 3 actions.
```

### Viewing History

Use `brain_audit` to see what happened to any item:

```
brain_audit(inputId: "abc12345")
→ 📋 Audit Trail (3 entries):
  [2025-06-01T10:30:00] captured: Captured drop: "Call dentist Tuesday"
  [2025-06-01T10:30:01] classified: Classified as admin (0.94): "Dentist Appointment"
  [2025-06-01T10:30:02] routed: Routed to admin with confidence 0.94
```

### Triaging Your needs_review Queue

When items land in `needs_review` (because the classifier wasn't confident enough), here's a practical workflow:

1. **Check stats:** `brain_stats` to see how many items are pending review.
2. **Search needs_review:** `brain_search(query: "...", bucket: "needs_review")` or use `openclaw brain list needs_review` to see them all.
3. **Inspect each item:** `brain_fix(id: "...")` to see details and the classifier's best guess.
4. **Route it:** `brain_fix(id: "...", correction: "→ projects")` to send it to the right bucket.
5. **Or trash it:** `brain_fix(id: "...", correction: "→ trash")` if it's noise.

---

## Going Deeper

### Full Configuration Reference

All options live under the `brain` key in your OpenClaw plugin config.

#### Embedding

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `embedding.apiKey` | string | *required* | API key for generating embeddings. Supports OpenAI and Google Gemini keys (auto-detected from key prefix; keys starting with `AI` use Gemini). |
| `embedding.model` | string | `text-embedding-3-small` | Embedding model. Options: `text-embedding-3-small`, `text-embedding-3-large`, `gemini-embedding-001` |
| `embedding.baseURL` | string | - | Custom base URL for OpenAI-compatible embedding APIs |

#### Classification

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `classifier.apiKey` | string | - | API key / gateway token for the classification LLM. If omitted, classification is disabled and drops stay in the inbox. |
| `classifier.model` | string | `claude-haiku-3.5` | LLM model used for classifying thoughts |
| `confidenceThreshold` | number | `0.80` | Minimum confidence (0.0-1.0) required to auto-route a drop to a bucket. Below this, the item goes to **needs review**. |

#### Auto-Capture & Auto-Recall

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoCapture` | boolean | `false` | Passively capture noteworthy info from conversations |
| `autoRecall` | boolean | `false` | Inject relevant memories into system prompt before each agent turn |
| `autoRecallLimit` | number | `3` | Max memories to inject per turn |
| `autoRecallMinScore` | number | `0.3` | Minimum similarity score for auto-recalled memories |

#### Storage

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storage.dbPath` | string | `~/.openclaw/brain/lancedb` | Path to the LanceDB database directory |

#### Digests *(planned — not yet implemented)*

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `digests.enabled` | boolean | - | Master switch for the digest system |
| `digests.timezone` | string | - | IANA timezone for digest scheduling (e.g., `America/New_York`) |
| `digests.schedule.morning.enabled` | boolean | - | Enable the morning digest |
| `digests.schedule.morning.time` | string | - | Time to send (e.g., `"07:30"`) |
| `digests.schedule.morning.maxWords` | number | `150` | Soft word limit for morning digest |
| `digests.schedule.midday.enabled` | boolean | - | Enable midday check-in |
| `digests.schedule.midday.time` | string | - | Time to send |
| `digests.schedule.midday.maxWords` | number | `100` | Soft word limit |
| `digests.schedule.afternoon.enabled` | boolean | - | Enable afternoon wrap-up |
| `digests.schedule.afternoon.time` | string | - | Time to send |
| `digests.schedule.afternoon.maxWords` | number | `120` | Soft word limit |
| `digests.schedule.night.enabled` | boolean | - | Enable night wind-down |
| `digests.schedule.night.time` | string | - | Time to send |
| `digests.schedule.night.maxWords` | number | `100` | Soft word limit |
| `digests.schedule.weekly.enabled` | boolean | - | Enable weekly review |
| `digests.schedule.weekly.day` | string | - | Day of week (e.g., `"sunday"`) |
| `digests.schedule.weekly.time` | string | - | Time to send |
| `digests.schedule.weekly.maxWords` | number | `250` | Soft word limit |

#### Actions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `actions.enabled` | boolean | `true` | Enable action detection and routing |
| `actions.timezone` | string | `America/New_York` | User timezone for reminder scheduling |
| `actions.extractionModel` | string | `claude-haiku-3.5` | Model for LLM time extraction |
| `actions.reminder.enabled` | boolean | `true` | Enable reminder detection |
| `actions.reminder.nagIntervalMinutes` | number | `5` | Nag interval for unacknowledged reminders |
| `actions.reminder.defaultTime` | string | `09:00` | Default time if only date specified |
| `actions.payment.enabled` | boolean | `true` | Enable payment intent detection |
| `actions.payment.autoExecuteThreshold` | number | `0.95` | Confidence threshold for auto-execution |
| `actions.payment.maxAutoExecuteAmount` | number | `10` | Max amount (DOGE) for auto-execution |

### Action Routing

After classification and bucket routing, Brain's **action router** inspects each drop for actionable intent. It handles:

| Intent | What happens |
|--------|-------------|
| **reminder** | Creates a persistent cron reminder with Telegram inline buttons (Dismiss / Snooze). Nags every 5 minutes until you act. |
| **booking** | Same as reminder. Extracts the appointment time and sets up notifications. |
| **todo** | Tags the item and logs it to the audit trail. |
| **purchase** | Tags the item with amount info from extracted entities. |
| **call** | Tags the item with contact info from extracted entities. |
| **payment** | Resolves recipient from Brain's people bucket, creates approval UI with Approve/Edit/Dismiss buttons. Auto-executes for ≤1 DOGE to known recipients. |

#### Payment Actions

When Brain detects a payment intent (e.g., "send 5 DOGE to Alice"), the action router:

1. **Resolves the recipient** — Searches the people bucket for a matching contact with a DOGE address
2. **Scores confidence** — Based on recipient match quality, amount, and context
3. **Routes by policy**:
   - **Auto-execute** (score ≥ 0.9, amount ≤ 1 DOGE, known recipient): Sends immediately via `wallet_send`
   - **Propose** (score ≥ 0.5): Shows Telegram approval UI with Approve / Edit / Dismiss buttons
   - **Reject** (score < 0.5 or unknown recipient): Notifies user of resolution failure
4. **Race guard** — Prevents duplicate sends from rapid button taps (status checked before and after wallet call)
5. **Wallet lock handling** — If wallet is locked, queues action as `awaiting-unlock` with retry on unlock event

Pending actions are stored as JSON in `~/.openclaw/brain/pending-actions/`.

Time extraction uses an LLM call to parse natural language like "next Tuesday at 3pm" or "every Monday morning" into precise dates and cron expressions.

**Intent priority**: Explicit bracket tag (e.g., `[Reminder]`) > classifier-detected intent > keyword heuristics (regex patterns for times, days, and reminder words).

### Deduplication

Before creating a new record, Brain checks for duplicates using **cosine similarity** on embedding vectors. If an existing record in the same bucket has a similarity score ≥ **0.92** (92%), the new drop is **auto-merged** into the existing record instead of creating a duplicate.

Merging appends the new information to the existing record's entry log and combines next-actions (with deduplication).

### Auto-Routing

After classification, the **router** (the "Bouncer") decides what happens:

- **Confidence ≥ threshold** (default 0.80): The drop is automatically routed to the target bucket. A structured record is created with all the classified fields.
- **Confidence < threshold** or **unknown bucket**: The drop goes to the **needs_review** queue. You can review it later and manually route it with `brain_fix`.

The inbox entry is cleaned up after successful routing.

---

## Under the Hood

### Classification Pipeline

When you drop a thought, Brain sends it to an LLM (Claude or Gemini) with a classification prompt. The LLM returns structured JSON with:

- **bucket**: which of the 8 buckets it belongs to
- **confidence**: how sure the model is (0.0 to 1.0)
- **title**: a short label (≤8 words)
- **summary**: 1-2 sentence distillation
- **nextActions**: concrete next steps
- **entities**: extracted people, dates, amounts, locations
- **urgency**: `now`, `today`, `this-week`, or `someday`
- **followUpDate**: specific date if applicable
- **tags**: up to 3 auto-generated tags
- **detectedIntent**: `reminder`, `todo`, `purchase`, `call`, `booking`, or `none`

### Drops

A **drop** is the fundamental unit of Brain. One thought = one drop. You don't need to think about where it goes, what to tag it, or how to format it. Just drop it.

Each drop is:
1. Saved to the **inbox** with a timestamp and embedding vector
2. **Classified** by an LLM into a bucket with a confidence score
3. **Routed** to the right bucket (or flagged for review if confidence is low)
4. Checked for **duplicates** and auto-merged if a near-match exists
5. Scanned for **time-sensitive actions** (reminders, bookings, etc.)

Photos are also supported. If you drop a photo and [Tesseract](https://github.com/tesseract-ocr/tesseract) is installed, Brain runs OCR to extract the text before classifying. If Tesseract isn't installed, the photo drop still works but skips text extraction silently, classifying based on any accompanying text instead.

### Architecture

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

### Key Technologies

- **LanceDB**: Embedded vector database for storage + semantic search (11 tables total)
- **Embeddings**: OpenAI `text-embedding-3-small` (1536 dim) or Gemini `gemini-embedding-001` (3072 dim)
- **Classification**: LLM-powered via OpenClaw gateway (Claude) or direct Gemini API
- **Reminders**: Persistent cron jobs via `openclaw cron` with Telegram inline button delivery
- **Audit Trail**: Every action logged (capture, classify, route, merge, fix)

---

## Reference

### Agent Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `brain_drop` | `text` (required), `source`, `mediaPath` | Capture a thought into the Brain |
| `brain_search` | `query` (required), `bucket`, `limit` | Search by semantic similarity across all buckets or a specific one |
| `brain_recall` | `query` (required), `bucket`, `limit` | Human-readable memory recall with formatted output |
| `brain_stats` | *(none)* | Show record counts and health for all buckets |
| `brain_audit` | `inputId`, `limit` | View audit trail for a specific item or recent actions |
| `brain_fix` | `id` (required), `correction` | Fix/move/trash/merge/inspect a Brain item |

**`brain_fix` correction syntax:**

| Syntax | What it does |
|--------|-------------|
| `→ people` | Move item to the people bucket |
| `→ trash` | Delete item permanently |
| `action: "call them back"` | Add/update the next action |
| `merge abc123` | Merge another item into this one |
| *(omitted)* | Show item details and available fixes |

### CLI Commands

| Command | Description |
|---------|-------------|
| `openclaw brain stats` | Show bucket record counts |
| `openclaw brain list <bucket>` | List records in a bucket (e.g., `openclaw brain list people --limit 10`) |
| `openclaw brain drop "<text>"` | Drop a thought from the command line |
| `openclaw brain audit` | Show recent audit trail entries (`--id <inputId>` to filter, `--limit <n>`) |

---

## Troubleshooting

### "brain: no config provided, plugin inactive"
You need to add an `embedding.apiKey` to your Brain config. This is the only required field.

### Drops stay in inbox (never classified)
Make sure `classification.apiKey` is set. Without it, classification is disabled and drops remain in the inbox as "pending."

### Items going to needs_review too often
Lower the `classification.confidenceThreshold` (e.g., from `0.80` to `0.70`). The default is conservative; a 70% threshold lets more items auto-route.

### Duplicate items not being merged
Deduplication uses a cosine similarity threshold of **0.92**. If two items are similar but not *very* similar, they'll be stored separately. You can manually merge with `brain_fix(id: "abc", correction: "merge def")`.

### Reminders not firing
Check that:
1. The action router config has a valid `gatewayToken` (same as `classification.apiKey`)
2. The cron jobs exist: `openclaw cron list`
3. The reminder script exists at `/home/clawdbot/clawd/scripts/brain-reminder.mjs`

### OCR not working on photo drops
Tesseract is **optional** and Brain works without it, but photo drops won't extract text. To enable OCR:

```bash
# Debian/Ubuntu
sudo apt install tesseract-ocr

# macOS
brew install tesseract
```

If Tesseract is missing, photo drops silently skip OCR and classify based on any text you include with the photo.

### How to see everything Brain knows
- `brain_stats`: record counts per bucket
- `brain_search("*")`: browse items
- `openclaw brain list <bucket>`: list all records in a bucket
- `brain_audit`: view the full audit trail

---

## Roadmap

Brain is actively evolving. Here's what's coming:

### v2.1: Quality of Life
- [ ] **Classification feedback messages**: See where Brain routed your drop ("📂 Routed 'Call dentist' → admin, 93% confidence")
- [ ] **Configurable digest schedule**: Enable/disable individual digests, change times and word limits via config
- [ ] **Needs-review workflow**: Dedicated tools to triage low-confidence items quickly
- [ ] **Search result details**: Richer results with summaries and next actions in one call
- [ ] **Bulk operations**: Trash or move multiple items at once
- [ ] **Voice note transcription**: Whisper integration for automatic voice-to-text capture

### v2.5: Intelligence
- [x] **Payment actions**: DOGE-powered actions via the wallet plugin. Drops like "send 5 DOGE to Alice" trigger recipient resolution, approval UI with inline buttons, and wallet_send execution with race-guard protection.
- [ ] **Custom buckets**: Add, remove, split, and merge buckets to fit your workflow. Define custom fields, classification behavior, and routing rules per bucket. Your Brain, your structure.
- [ ] **Drops as work orders**: Use drops to trigger dev_task (code/doc changes) and research (web search + summary) actions, with tiered gating for safety
- [x] ~~**Payment actions**~~: *(Shipped in v2.5 — see above)*
- [ ] **Hybrid search**: Combine keyword + semantic search for better results
- [ ] **Cross-bucket links**: Automatically detect and surface relationships between items (e.g., a person linked to a project)
- [ ] **Learning from corrections**: When you move a misclassified item, Brain learns and improves over time
- [ ] **Few-shot classification**: Build a bank of gold-standard examples from your corrections for better accuracy
- [ ] **Smart merge suggestions**: Prompt before creating near-duplicates
- [ ] **LLM-powered weekly review**: Natural language insights instead of template summaries

### v3.0: Autonomous Memory
- [ ] **Knowledge graph visualization**: Interactive web view of your entire Brain as a connected graph
- [ ] **Context-aware proactive recall**: Brain surfaces relevant items during conversations without being asked
- [ ] **Calendar integration**: Cross-reference today's events with Brain items in morning digests
- [ ] **Spaced repetition**: Important items resurface at increasing intervals so you don't forget
- [ ] **Location-aware reminders**: "Remind me to buy milk when I'm near the store"
- [ ] **Email capture**: Forward emails to Brain for automatic extraction and classification

See the [full roadmap](plans/brain-roadmap.md) for detailed descriptions, complexity estimates, and priority matrix.

---

## License

MIT — Built by [Quackstro LLC](https://quackstro.com)

---

## Support the Project

If you find Brain useful, tips are always appreciated:

**DOGE Address:** `D6i8TeepmrGztENxdME84d2x5UVjLWncat`

Every DOGE goes toward hosting, continued development, and keeping the lights on. 🧠🐕
