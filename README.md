# OpenClaw Brain

Behavioral memory system for [OpenClaw](https://github.com/openclaw/openclaw). Auto-classifies thoughts into semantic buckets with action detection, semantic search, and context injection.

## Packages

| Package | Description |
|---------|-------------|
| [`@quackstro/brain-core`](./packages/brain-core/) | Core memory engine — buckets, classification, search, auto-capture, auto-recall |
| [`@quackstro/brain-actions`](./packages/brain-actions/) | Action framework — detects intents (reminders, payments, todos) and routes to handlers |

## Quick Start

Install as OpenClaw plugins:

```bash
# From local clone
openclaw plugin install ./packages/brain-core
openclaw plugin install ./packages/brain-actions
```

Then configure in `openclaw.json`:

```yaml
plugins:
  entries:
    - id: brain-core
      config:
        embedding:
          apiKey: "sk-..."
        autoCapture: false
        autoRecall: false
    - id: brain-actions
      config:
        enabled: true
        timezone: America/New_York
```

See [brain-core README](./packages/brain-core/README.md) for full configuration.

## Architecture

```
User message
     ↓
┌─────────────────┐     ┌──────────────────┐
│   brain-core    │     │  brain-actions    │
│                 │     │                   │
│ • /drop capture │────▶│ • intent detect   │
│ • classify      │     │ • reminder route  │
│ • bucket route  │     │ • payment route   │
│ • /recall search│     │ • todo route      │
│ • auto-capture  │     └──────────────────┘
│ • auto-recall   │
└─────────────────┘
```

## Development

```bash
pnpm install
pnpm test
```

## Legacy

The `_legacy/` directory contains the original Brain v1 monolithic plugin (pre-2026.3). Kept for reference; not actively maintained.

## License

Private — Quackstro LLC
