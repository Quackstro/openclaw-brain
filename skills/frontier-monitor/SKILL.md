---
name: frontier-monitor
description: >
  Frontier Airlines flight booking monitor. Triggers on: flight booking gaps,
  weekly TPA↔ATL commute planning, Frontier Airlines travel questions,
  "do I have flights booked", unbooked week detection, travel status checks.
  Monitors 4 calendars (Family, Personal, Work, Gmail) to detect booked Frontier
  flights and identify weeks where flights are needed but not yet booked.
---

# Frontier Flight Monitor

Monitors Dr. Castro's weekly TPA ↔ ATL commute on Frontier Airlines across an
8-week lookahead window. Cross-references four iCal calendars to detect booking
gaps, off weeks, and family-visit exceptions. Generates booking links for gaps.

## Scripts

### flight-planner.js

Core gap-detection script. Fetches all 4 calendars, extracts booked Frontier
flights (matches both "Frontier" and "F9" naming), and compares against the
expected Tuesday morning out / Thursday afternoon return pattern.

```bash
# Human-readable output with booking links (default)
node skills/frontier-monitor/scripts/flight-planner.js

# Structured JSON for downstream pipelines / Lobster
node skills/frontier-monitor/scripts/flight-planner.js json
```

### Output Interpretation

| Emoji | Status        | Meaning                                      |
|-------|---------------|----------------------------------------------|
| ✅    | BOOKED        | Both outbound and return flights found        |
| ⚠️    | PARTIAL       | One leg is missing                            |
| 🔴    | UNBOOKED      | No flights booked but work week detected      |
| 🏠    | OFF           | No work events — user is off that week        |
| 👨‍👩‍👧    | FAMILY_VISIT  | Family visiting ATL — return flight not needed|

Gap entries include 🔗 direct Frontier booking links for one-click booking.

### config.json

User preferences: route, travel pattern, lookahead window, alert threshold,
and all 4 calendar feed URLs. Edit to change defaults.

### data/price-history.json

Price tracking store. Thresholds: great ≤$15, good ≤$20, normal ≤$30, high >$40.
Entries added when prices are reported or scraped (Phase 2 browser automation).

## Brain Integration

Before sending gap alerts, query Brain for travel exceptions that week.
If Brain has context (e.g., "staying in ATL week of March 10"), suppress the alert.

## Calendars

| Calendar | Source | Flight Detection |
|---|---|---|
| Family | iCloud webcal | Shared work travel, family visiting ATL |
| Personal | iCloud webcal | Frontier bookings ("Frontier XXXX") |
| Work | Outlook 365 | Work week detection, PTO |
| Gmail | Google Calendar | Frontier email confirmations ("F9 XXXX") |

## Scheduling

- **Sunday 6 PM ET**: Full 8-week flight status report with booking links
- **Daily 7 AM ET**: Flag urgent gaps (< 14 days away with no booking)

## Phase 2 — Kayak Price Checking (Live)

### price-check.mjs

Scrapes Kayak for Frontier-only flight prices using Playwright (headless Chromium).
Includes stealth patches to avoid bot detection.

```bash
# Single date check
node skills/frontier-monitor/scripts/price-check.mjs ATL TPA 2026-03-12

# Multiple dates
node skills/frontier-monitor/scripts/price-check.mjs ATL TPA 2026-03-12 2026-03-17
```

Output: structured JSON with route, date, flights (departure, arrival, duration,
stops, basicPrice, economyPrice), cheapest price, and timestamp.

### Integrated with flight-planner.js

Use the `--prices` flag to enrich gap reports with Kayak prices:

```bash
node skills/frontier-monitor/scripts/flight-planner.js --prices
```

This runs a Kayak price check for each missing leg and appends 💰 price info
below the booking link in the report. Price checking is optional — if it fails,
the report still renders without prices.

### Price Thresholds (from data/price-history.json)
- Great: ≤$15
- Good: ≤$20
- Normal: ≤$30
- High: >$40
