# Weekly Report Template

## Structure

```markdown
## 📋 Weekly Update — [Date Range]

### 📊 Summary
> [High-level 1-2 sentence overview of key accomplishments]

### 📅 Availability

**This Week — [Current Week Date]**
- [PTO / vacation / off days]
- [Travel days (Frontier flights from flight monitor)]
- [Long-running meetings or conferences that block availability]
- [Family events that affect schedule]

**Next Week — [Next Week Date]**
- [Same categories as above]

> Only include weeks that have notable schedule items. Skip a week if normal schedule.

---

### 🔧 Changes This Week

**[Project Name]** *(branch)*
- [Commit-based changes, one line each]

**Other**
- [Misc updates]

---

### 🔄 In Progress

**[Project Name]**
- [Item] — [Status]

---

### 📋 Backlog

- **[Project Name]** — [Status/notes]
- **Secure Documents** — On hold due to SharePoint technical limitations; planning alternative solution
- **ALPA Mobile Refresh** — Waiting on UI design & functional specs
```

## Data Sources
- **ALPA Mobile**: Azure DevOps commits from `scim-flow`, `DotNet10`, `development` branches
- **ACA Calculator**: Azure DevOps commits from `main` branch
- **Work Items**: Azure DevOps boards for active/in-progress items
- **Availability**: Run for BOTH current and next week, check Brain for PTO/exceptions
  - `node ~/clawd/scripts/availability-check.js 0` — this week
  - `node ~/clawd/scripts/availability-check.js 1` — next week
  - Scans all 4 calendars (Family, Personal, Work, Gmail)
  - Detects: PTO, travel/flights, long meetings (>2h), conferences, multi-day events
  - Also run `node ~/clawd/skills/frontier-monitor/scripts/flight-planner.js` for flight gaps
  - Query `brain_search("PTO vacation off week")` for ad-hoc schedule notes

## Schedule
- **Monday 9 AM ET**: Auto-generate weekly update (full report)
- **Tuesday 2:30 PM ET**: Status update for 3 PM afternoon meeting (condensed)
- **Wednesday 2:30 PM ET**: Status update for 3 PM afternoon meeting (condensed)

## Hyperlinks
- **Work items**: `https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_workitems/edit/{ID}`
  - Example: [#1819](https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_workitems/edit/1819)
- **Pull requests**: `https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_git/ALPA%20Mobile/pullrequest/{ID}`
  - Example: [PR 1278](https://dev.azure.com/airlinepilotsassociation/ALPA%20Mobile/_git/ALPA%20Mobile/pullrequest/1278)
- Always hyperlink PR numbers and work item IDs in the report
- **Link text must be SHORT** — just `#1819` or `PR 1278`, NEVER the full URL path as visible text

## Formatting Rules (Telegram)
- **Bold section titles need a blank line ABOVE them** so they don't stick to the list above
- Pattern: list items → blank line → **Bold Title** → list items
- Example:
  ```
  - Merged PR 1280: Clear WebView cache
  - Merged PR 1283: Fix CollectionView layout

  **ACA Calculator** _(UI-Migration)_
  - Three brand variants
  ```
- Focus on commit messages, not build counts
- Summary at top for high-level overview
- Changes This Week section before In Progress
- Backlog section at end
- Use list items, not tables
- Save report as markdown file and send to Telegram
- **Run `markdownlint` before saving** (config: `~/clawd/.markdownlint.json`)
