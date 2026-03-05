# Changelog

## 2026.3.5

### Added

- **`brain_recall` tool** — User-facing formatted semantic search across all buckets. Returns titles, bucket names, match scores, summaries, tags, and next actions in human-readable format.
- **`recall` CLI command** — `openclaw brain recall <query> [--bucket <name>] [--limit <n>]` for command-line search.
- **`commands/recall.ts`** module — Core recall logic with `handleRecall()`, `formatRecallResults()` (user-facing), and `formatRecallForContext()` (compact format for system prompt injection).
- **Auto-Capture** (`autoCapture` config, default: `false`) — Hooks into `message_received` to passively capture noteworthy messages from conversations. Includes heuristic filter that skips trivial acks, greetings, emoji, commands, and short messages.
- **Auto-Recall** (`autoRecall` config, default: `false`) — Hooks into `before_agent_start` to inject relevant memories into the system prompt before each agent turn. Configurable via `autoRecallLimit` (default: 3) and `autoRecallMinScore` (default: 0.3).
- **Tests** — 19 tests covering recall search/sort/filter/format, auto-capture heuristic, and config defaults.
- **README.md** — Full plugin documentation.

### Config additions

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoCapture` | boolean | `false` | Passively capture from conversations |
| `autoRecall` | boolean | `false` | Inject memories into system prompt |
| `autoRecallLimit` | number | `3` | Max memories per turn (1-10) |
| `autoRecallMinScore` | number | `0.3` | Min similarity for injection (0.0-1.0) |

## 2026.2.25

### Initial release

- Bucket-based memory with LanceDB vector storage
- LLM classification with confidence routing
- `/drop` command and `brain_drop` tool
- `/fix` command and `brain_fix` tool
- `brain_search`, `brain_stats`, `brain_audit` tools
- CLI commands: `brain stats`, `brain list`, `brain drop`, `brain audit`
- Configurable buckets, embedding providers (OpenAI/Gemini), classifier model
- Audit trail for all operations
- Tag parser for bracket-tagged input (`[todo]`, `[buy]`, etc.)
- Duplicate detection via cosine similarity
