# Brain Core

Generic bucket-based memory system for OpenClaw. Captures thoughts, classifies them into configurable buckets, and provides semantic search with automatic context injection.

## Features

- **Drop** — Capture thoughts with `/drop` or the `brain_drop` tool. One thought per drop, automatically classified and routed to the right bucket.
- **Recall** — Semantic search across all buckets via `brain_recall` tool or `openclaw brain recall <query>` CLI.
- **Search** — Lower-level vector search via `brain_search` tool (returns raw results).
- **Fix** — Move items between buckets, trash, merge, or update via `brain_fix` tool.
- **Stats** — Bucket counts and disk usage via `brain_stats` tool.
- **Audit** — Full audit trail of all classification and routing decisions.
- **Auto-Capture** — Passively capture noteworthy info from conversations (opt-in).
- **Auto-Recall** — Inject relevant memories into the system prompt before each agent turn (opt-in).

## Architecture

```
User message
     ↓
[Auto-Capture hook]──→ isNoteworthy? ──Yes──→ handleDrop ──→ classify ──→ route to bucket
     ↓
[Auto-Recall hook]──→ embed query ──→ search buckets ──→ inject top N into system prompt
     ↓
Agent processes with memory context
```

### Storage

Uses [LanceDB](https://lancedb.com/) for embedded vector storage. Default path: `~/.openclaw/brain/lancedb`.

Tables: configurable buckets (default: `people`, `projects`, `ideas`, `admin`, `documents`, `goals`, `health`, `finance`) + system tables (`inbox`, `needs_review`, `audit_trail`).

### Embeddings

Supports OpenAI (`text-embedding-3-small`) and Google Gemini embedding models. Provider auto-detected from API key format.

### Classification

LLM-powered classification routes raw thoughts to the appropriate bucket with confidence scoring. Items below the confidence threshold go to `needs_review` for manual triage.

## Configuration

```yaml
plugins:
  entries:
    - id: brain-core
      config:
        embedding:
          apiKey: "sk-..."          # Required. OpenAI or Gemini key.
          provider: auto            # auto | openai | gemini
          model: text-embedding-3-small
        classifier:
          apiKey: "sk-..."          # Optional. Uses gateway if not set.
          model: claude-haiku-3.5
        storage:
          dbPath: ~/.openclaw/brain/lancedb
        buckets:                    # Custom bucket list (optional)
          - people
          - projects
          - ideas
          - admin
          - documents
          - goals
          - health
          - finance
        confidenceThreshold: 0.8    # Min confidence for auto-routing (0.0-1.0)
        autoCapture: false          # Passively capture from conversations
        autoRecall: false           # Inject memories into system prompt
        autoRecallLimit: 3          # Max memories per turn (1-10)
        autoRecallMinScore: 0.3     # Min similarity for injection (0.0-1.0)
```

### Auto-Capture

When `autoCapture: true`, the plugin hooks into `message_received` and passively captures noteworthy user messages. Filtering heuristic:

- Skips commands (`/`), trivial acks ("ok", "thanks"), greetings, emoji-only, and short messages (<20 chars or <4 words).
- Qualifying messages are routed through the standard drop → classify → route pipeline with `source: "chat"`.

### Auto-Recall

When `autoRecall: true`, the plugin hooks into `before_agent_start` and injects relevant memories before each agent turn:

1. Embeds the user's prompt
2. Searches all buckets by vector similarity
3. Filters by `autoRecallMinScore` (default 0.3)
4. Injects top `autoRecallLimit` (default 3) results as `prependContext`

The injected context appears as a `## Relevant Memories (from Brain)` section in the system prompt.

## Tools

| Tool | Description |
|------|-------------|
| `brain_drop` | Capture a thought (text or photo via OCR) |
| `brain_recall` | Formatted semantic search (user-facing) |
| `brain_search` | Raw semantic search (returns scores + records) |
| `brain_fix` | Move, trash, merge, or update items |
| `brain_stats` | Bucket record counts and disk usage |
| `brain_audit` | View audit trail for an item or recent actions |

## CLI

```bash
openclaw brain stats          # Bucket counts
openclaw brain list <bucket>  # List records in a bucket
openclaw brain drop "text"    # Capture a thought
openclaw brain recall "query" # Semantic search
openclaw brain audit          # View audit trail
```

## Extension API

Brain Core exposes its internals for other plugins (e.g., brain-actions):

```typescript
// Access via plugin API
const { store, embedder, classifierFn, config } = api._brainCore;

// Or import directly
import { BrainStore, handleRecall, formatRecallForContext } from "@openclaw/brain-core";
```

## Related

- **[brain-actions](../brain-actions/)** — Action framework for detected intents (reminders, payments, todos). Consumes brain-core's classification output.
