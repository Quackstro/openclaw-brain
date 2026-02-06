# 2026-02-02 — Calendar & Flight Monitor Build Session

## Insurance Depopulation — Resolved
- Dr. Castro selected **Praxis Reciprocal** for homeowners insurance depopulation
- Policy #08867730, property 11307 Bridge Pine Dr, Riverview FL
- Premium ~$3,353/yr
- Deadline was Feb 6, 2026 — completed early on Feb 2

## Calendar Monitoring System — Built
- **4 calendars** now monitored:
  1. Family (iCloud webcal)
  2. Personal (iCloud webcal — "Castro" calendar)
  3. Work (Outlook 365 — ALPA org)
  4. Gmail (Google Calendar — castro770@gmail.com, Frontier email confirmations)
- Daily check cron: 7 AM ET (cron ID: 0fec976b)
- Deduplication across calendars using word-overlap similarity
- Scripts: `~/clawd/scripts/calendar-monitor.js`, `~/clawd/scripts/availability-check.js`

## Frontier Flight Monitor Skill — Phase 1 & 2 Complete
- Skill location: `~/clawd/skills/frontier-monitor/`
- Scripts: `flight-planner.js`, `config.json`, `data/price-history.json`
- **Phase 1**: Calendar-aware gap detection across 4 calendars
  - Matches both "Frontier" and "F9" naming patterns from different calendars
  - Classifies weeks: BOOKED / PARTIAL / UNBOOKED / OFF / FAMILY_VISIT
  - 8-week lookahead, alerts for gaps within 14 days
- **Phase 2**: Booking link generation for gaps
  - Direct Frontier booking URLs for each missing flight
  - Price history store ready (thresholds: great ≤$15, good ≤$20, high >$30)
  - Browser price scraping deferred (Frontier blocks non-browser requests with 403)
- Weekly report cron: Sunday 6 PM ET (cron ID: dae63e47)

## Availability Report — Built
- Script: `~/clawd/scripts/availability-check.js`
- Scans all 4 calendars for current + next week
- Filters flight events to only those impacting work hours (9 AM – 5 PM ET)
- Airport buffer: 1h40m before departure (takeoff - 20min doors close - 20min boarding - 1h travel)
- "Leave by" times rounded DOWN to nearest half hour (more buffer)
- "Available by" times rounded UP to nearest half hour
- Multi-day events show date range (e.g., "Mon Feb 9 – Thu Feb 12")
- iCal DTEND for VALUE=DATE is exclusive — subtract 1 day for actual last day
- Integrated into weekly report template under Summary section

## Weekly Report Template Updates
- Added **📅 Availability** section (this week + next week)
- Bold section titles need blank line above them (Telegram formatting)
- **Hyperlinks** for PRs and work items:
  - Work items: `https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_workitems/edit/{ID}`
  - PRs: `https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_git/ALPA%20Mobile/pullrequest/{ID}`

## Key Bug Fixes
- All-day VALUE=DATE events parsed at midnight UTC shifted back 1 day in ET
  - Fix: Parse at 17:00 UTC (noon ET) to keep date stable
  - Applied to all 3 scripts: calendar-monitor.js, flight-planner.js, availability-check.js
- Flight planner date matching: UTC dates compared to ET expected dates caused mismatches
  - Fix: ET-aware date comparison using Intl.DateTimeFormat
- Frontier flight regex: Gmail calendar uses "F9 XXXX" not "Frontier XXXX"
  - Fix: Updated FRONTIER_RE to match both patterns

## Coding Agent Status
- Copilot CLI: `--full-auto` flag not supported (that's Codex)
- Claude Code: needs re-auth (`/login`)
- Fallback: OpenClaw sub-agents (sessions_spawn) work without external auth

## Multi-Phase Plan
- Full plan at: `~/clawd/plans/frontier-flight-monitor.md`
- Phase 1: ✅ Gap detection
- Phase 2: ✅ Booking links (browser scraping deferred)
- Phase 3: Gmail sale email monitoring (planned)
- Phase 4: Learning & optimization (planned)
- Lobster integration: deferred to Phase 2 browser work (approval gates for booking)
