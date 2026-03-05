# Changelog

## 2026.3.5

### Changed

- Extracted from monolithic Brain v1 into standalone workspace package
- Renamed from `@openclaw/brain-actions` to `@quackstro/brain-actions`
- Updated peer dependency to `@quackstro/brain-core`
- Added README with full documentation (hooks, config, intent detection, API)

## 2026.2.25

### Initial release

- Intent detector with priority chain: explicit tags → classifier output → keyword heuristics → urgency signals
- Supported intents: reminder, booking, payment, todo, purchase, call
- Time extraction via LLM for time-sensitive intents
- Action router with configurable handlers
- Hook system for reminder delivery, payment resolution/approval/execution
- Payment pipeline: detect → resolve → approve → execute with configurable thresholds
- Reminder pipeline: detect → extract time → create cron job + nag loop
