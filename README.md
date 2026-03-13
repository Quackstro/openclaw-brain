# @quackstro/openclaw-brain

Behavioral memory system for [OpenClaw](https://github.com/openclaw/openclaw). Captures thoughts, classifies them into configurable semantic buckets, provides vector search recall, and detects actionable intents (reminders, payments, todos).

## Install

```bash
# From npm
openclaw plugins install @quackstro/openclaw-brain

# From git
git clone https://github.com/Quackstro/openclaw-brain.git ~/.openclaw/extensions/brain
cd ~/.openclaw/extensions/brain
npm install && npm run build
```

## Configure

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "brain": {
        "config": {
          "embedding": {
            "apiKey": "YOUR_GEMINI_OR_OPENAI_KEY",
            "model": "gemini-embedding-001"
          },
          "storage": {
            "dbPath": "~/.openclaw/brain/lancedb"
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

### Optional config

```json
{
  "classifier": {
    "apiKey": "YOUR_LLM_API_KEY",
    "model": "claude-haiku-3.5"
  },
  "confidenceThreshold": 0.8,
  "autoCapture": true,
  "autoRecall": true,
  "autoRecallLimit": 3,
  "autoRecallMinScore": 0.3,
  "actions": {
    "enabled": true,
    "timezone": "America/New_York",
    "reminder": { "enabled": true },
    "payment": { "enabled": true, "maxAutoExecuteAmount": 10 }
  }
}
```

## Features

### Tools
- **brain_drop** — Capture a thought (text, photo OCR, voice)
- **brain_search** — Semantic vector search across all buckets
- **brain_recall** — Human-readable memory recall with formatting
- **brain_fix** — Move, trash, merge, or update stored items
- **brain_stats** — Bucket counts and disk usage
- **brain_audit** — View the audit trail

### Hooks
- **Auto-capture** — Passively captures noteworthy messages from conversations
- **Auto-recall** — Injects relevant memories into system prompt before each agent turn

### Actions
- **Reminders** — Detects time-sensitive intents, creates persistent cron reminders
- **Payments** — Detects payment intents, resolves recipients, executes or requests approval
- **Tags** — `[ToDo]`, `[Reminder]`, `[Buy]`, `[Call]`, `[Book]`, `[Pay]` bracket tags

### CLI
```bash
openclaw brain stats
openclaw brain list <bucket>
openclaw brain drop "thought text"
openclaw brain recall "search query"
openclaw brain audit
```

## Default Buckets

`people`, `projects`, `ideas`, `admin`, `documents`, `goals`, `health`, `finance`

Configurable via `buckets` array in config.

## Architecture

- **LanceDB** for vector storage (embedded, no server needed)
- **Gemini or OpenAI** embeddings
- **LLM classification** with configurable confidence threshold
- **Audit trail** on every action
- **Dedup detection** via cosine similarity (auto-merge at 0.92+)

## Development

```bash
npm install
npm test           # run tests
npm run build      # compile to dist/
```

## License

MIT
