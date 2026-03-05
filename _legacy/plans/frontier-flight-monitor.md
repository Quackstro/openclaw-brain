# Frontier Flight Monitor — Multi-Phase Plan

**Created:** 2026-02-02
**Owner:** Dr. Castro
**Status:** Phase 2 — In Progress

---

## Overview

An intelligent travel agent assistant that monitors Dr. Castro's weekly TPA↔ATL commute on Frontier Airlines. Detects booking gaps, understands calendar context (PTO, family visits, work travel), and eventually monitors fares and assists with booking.

## User Profile

- **Route:** TPA ↔ ATL (weekly commute)
- **Pattern:** Tuesday morning (TPA→ATL), Thursday afternoon (ATL→TPA)
- **Airline:** Frontier Airlines (flyfrontier.com)
- **Memberships:** Discount Den + Go Wild premium
- **Typical fare:** ~$20
- **Booking window:** ~2 months ahead, or when sales happen
- **Sale alerts:** Frontier emails to Gmail

## Calendars Monitored

| Calendar | Source | Key Signals |
|---|---|---|
| Family | iCloud webcal | Family travel TPA→ATL (he stays, no return needed), shared work travel events |
| Personal | iCloud webcal | Booked Frontier flights (e.g., "Frontier 2911"), PTO, personal travel |
| Work | Outlook 365 | Work meetings (implies in-office weeks), off weeks, conferences |

## Architecture

```
calendars (3 feeds)
     │
     ▼
calendar-monitor.js ──→ JSON events
     │
     ▼
flight-planner.js
  ├── extract booked Frontier flights
  ├── detect expected travel pattern per week
  ├── identify exceptions (PTO, family visits, etc.)
  ├── compare booked vs expected → gaps
  └── output JSON gap report
     │
     ▼
Brain veto layer (brain_search for ad-hoc exceptions)
     │
     ▼
Alert / Report via Telegram
```

---

## Phase 1 — Calendar-Aware Gap Detection ✅ CURRENT

**Goal:** Detect weeks where flights are needed but not booked.

### Deliverables

1. **flight-planner.js** — Core script that:
   - Fetches all 3 calendars
   - Extracts already-booked Frontier flights (events matching "Frontier" with confirmation codes)
   - Builds an 8-week lookahead of expected travel days
   - Detects exceptions:
     - **Off weeks:** No work calendar events for the week → skip
     - **Family visiting ATL:** Family calendar shows TPA→ATL travel for family members → skip return flight
     - **All-day travel/conference:** Work calendar shows multi-day out-of-town event → adjust pattern
   - Outputs JSON: `{ week, status, outbound, return, gaps[], exceptions[] }`

2. **config.json** — User preferences:
   - Route: TPA ↔ ATL
   - Pattern: Tue AM out, Thu PM return
   - Lookahead: 8 weeks
   - Alert threshold: flights needed within 14 days with no booking

3. **Cron jobs:**
   - **Sunday 6 PM ET** — Full 8-week flight status report
   - **Integrate with daily 7 AM ET calendar check** — Flag urgent gaps (<14 days)

4. **Brain veto layer:**
   - Before alerting, query Brain for the flagged week
   - If Brain has context (e.g., "staying in ATL week of March 10"), suppress the alert

### Output Format (Sunday Report)

```
✈️ 8-Week Flight Status

Week of Feb 3: ✅ Booked
  → Tue: Frontier 2911 (6:20 AM)
  → Thu: Frontier 2912 (5:45 PM)

Week of Feb 10: ⚠️ OUTBOUND MISSING
  → Tue: Not booked
  → Thu: Frontier 2912 (booked)

Week of Feb 17: 🏠 Off — no work events

Week of Feb 24: 👨‍👩‍👧 Family visiting ATL — no return needed
  → Tue: Frontier 2911 (booked)
  → Thu: Skipped (family in ATL)

Week of Mar 3: 🔴 NOT BOOKED (11 days away!)
  → Tue: Not booked
  → Thu: Not booked
```

---

## Phase 2 — Price Monitoring & Fare Alerts

**Goal:** When gaps are detected, check Frontier prices and alert on good fares.

### Deliverables

1. **check-prices.js** — Browser automation script:
   - Uses OpenClaw browser tool to search flyfrontier.com
   - Searches specific dates for TPA→ATL and ATL→TPA
   - Extracts Discount Den prices
   - Outputs JSON: `{ date, route, price, flightNumber, times[] }`

2. **Price history tracking:**
   - Stores price checks in `data/price-history.json`
   - Tracks trends: is this fare above/below average?

3. **Alert thresholds:**
   - Good fare: ≤ $20 (normal Discount Den price)
   - Great fare: ≤ $15 (sale price)
   - Alert: > $30 (unusually high, book earlier next time)

4. **Lobster integration:**
   - `.lobster` pipeline: detect gaps → check prices → approval gate → generate booking link
   - Approval prompt: "Found $18 fare for Tue Mar 3 TPA→ATL 6:20 AM. Open booking page?"

### Prerequisites
- Lobster CLI installed and enabled
- Browser automation tested against flyfrontier.com

---

## Phase 3 — Gmail Sale Detection

**Goal:** Monitor Frontier sale emails and cross-reference with booking gaps.

### Deliverables

1. **Gmail integration** (requires OAuth setup):
   - Monitor for Frontier promotional emails
   - Extract sale details: routes, dates, prices, promo codes
   - Cross-reference with known gaps

2. **Proactive alerts:**
   - "Frontier just emailed a sale: TPA→ATL $12 through Feb 28. You have 3 unbooked weeks in that window."

3. **Smart timing:**
   - If a sale covers dates you need, alert immediately
   - If a sale is for dates already booked, ignore

---

## Phase 4 — Learning & Optimization

**Goal:** Get smarter over time about travel patterns and preferences.

### Deliverables

1. **Pattern learning via Brain:**
   - Track actual vs predicted travel over time
   - Detect recurring exceptions (e.g., always off first week of month)
   - Learn preferred flight times within Tue AM / Thu PM windows

2. **Cost optimization:**
   - Historical price analysis: best day/time to book
   - "You usually book 6 weeks out but prices drop 4 weeks out for this route"

3. **Calendar conflict detection:**
   - "You have a 9 AM meeting Tuesday but your flight lands at 9:15 AM — earlier flight?"

---

## Technical Notes

### Scripts Location
```
~/clawd/skills/frontier-monitor/
├── SKILL.md
├── scripts/
│   ├── flight-planner.js    # Phase 1: gap detection
│   ├── check-prices.js      # Phase 2: price scraping
│   ├── config.json           # User preferences
│   └── data/
│       └── price-history.json  # Phase 2: price tracking
└── pipelines/
    └── weekly-check.lobster   # Phase 2: Lobster workflow
```

### Calendar Monitor Integration
The existing `~/clawd/scripts/calendar-monitor.js` already fetches and parses all 3 calendars. The flight planner reuses its calendar fetching and parsing logic.

### JSON Output Design
All scripts output JSON for Lobster compatibility (Phase 2). The LLM formats human-readable messages from the JSON output.

### Cron Job IDs
- Daily calendar check: `0fec976b` (existing, will be updated to include gap alerts)
- Sunday flight report: TBD (Phase 1 deliverable)

### Brain Integration
- Bucket: `admin` for flight/travel exceptions
- Query pattern: `brain_search("travel exception week of {date}")`
- Used as veto layer only — not primary data source
