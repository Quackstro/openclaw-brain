# Preferences

## Work Items
- **Always update the work item** with research findings, root cause analysis, and recommended fix when a plausible solution or suggestion exists

## Coding Tasks
- **Preferred tool**: GitHub Copilot CLI (`copilot`) — fallback: Claude Code (`claude`)
- Copilot CLI may need re-auth if 401 error (check `~/.copilot/logs/` for errors)
- **On OpenAI/Copilot quota exhaustion**: Notify Dr. Castro immediately and ask whether to defer the next sub-agent until quota resets or continue with fallback (Claude Code)

### Git Workflow for Delegated Coding Tasks

**ALWAYS follow this workflow when delegating to sub-agents:**

1. **Create git worktree** with isolated branch:
   ```bash
   cd ~/repos/<project>
   git fetch origin
   # With work item: git worktree add -b task-<id>/<short-name> /tmp/task-<id>-<short-name> origin/<source-branch>
   # Without:        git worktree add -b <short-name> /tmp/<short-name> origin/<source-branch>
   ```

2. **Branch naming**: No bot prefixes. Use plain descriptive names, or work item ID when available.
   - With work item: `task-1819/isbusy-fix`, `task-2045/listview-migration`
   - Without work item: `isbusy-fix`, `listview-migration`, `docs-update`
   - **Never** use `clawdbot-`, `openbot-`, or `openclaw-` prefixes

3. **Delegate to coding agent** with explicit instructions:
   ```bash
   cd /tmp/openclaw-<short-name> && claude -p "<task description>
   
   When complete:
   1. Update documentation if applicable (mark task complete, add notes)
   2. Run /review to check for mistakes before committing
   3. Commit with message '<Task X.X: Description>'
   4. Push: git push -u origin <branch-name>" --dangerously-skip-permissions
   ```

   **Important:** Always include step to run `/review` before commit — catches AI slop and mistakes.

4. **After agent completes**, create PR:
   ```bash
   az repos pr create --repository "<repo>" --project "<project>" \
     --source-branch "<branch-name>" --target-branch "<source-branch>" \
     --title "<Task X.X: Description>" --description "<summary>"
   ```

5. **Clean up worktree**:
   ```bash
   cd ~/repos/<project>
   git worktree remove /tmp/<branch-name>
   ```

6. **Never commit directly to source branch** unless explicitly told to

### Post-Task Actions
- Update migration/planning docs (mark task complete, add notes)
- Create PR with descriptive title and summary
- Trigger builds if applicable
- Each task = separate branch = separate PR

## Reports & Outputs
- **Always save reports to** `~/clawd/reports/`
  - Status updates: `~/clawd/reports/status-update-YYYY-MM-DD.md`
  - Weekly reports: `~/clawd/reports/weekly-report-YYYY-MM-DD.md`
  - Any generated report or output file goes in `~/clawd/reports/` unless specified otherwise

## Timezone & Date/Time Rules (CRITICAL)
- **ALWAYS use Eastern Time (America/New_York)** for all date/time values shown to Dr. Castro
- Never display UTC unless explicitly asked
- All calendar scripts, reports, and alerts must format in ET
- When interpreting user input like "Tuesday morning", that means ET
- Scripts: always use `{ timeZone: 'America/New_York' }` in Intl formatters
- **Server runs in UTC** — this causes date-shift bugs if not handled:
  - All-day iCal events (`VALUE=DATE:20260209`) have NO time component
  - Parsing them as midnight UTC (00:00Z) shifts them BACK one day in ET (becomes previous day at 7 PM ET)
  - **FIX: Parse all-day VALUE=DATE events at 17:00 UTC** (noon ET) to keep the calendar date stable in Eastern Time
  - This applies to ALL iCal parsing: calendar-monitor.js, flight-planner.js, availability-check.js, and any future scripts
  - Same risk exists with any date-only value from APIs — always anchor to noon ET when no time is provided
- When writing new date/time code, always test with an all-day event to verify the date doesn't shift

## Availability Report Formatting
- **Flight events**: Only show if they impact working hours (9 AM – 5 PM ET)
- **Airport buffer**: 1 hour 40 minutes before departure (takeoff time - 20min doors close - 20min boarding starts - 1h travel/security), add 1h after landing
- **Round times**: "Leave by" rounds DOWN to nearest half hour; "Available by" rounds UP to nearest half hour
- **Multi-day events**: Show date range (e.g., "Mon Feb 9 – Thu Feb 12")
- **iCal DTEND for VALUE=DATE is exclusive** — subtract 1 day to get the actual last day
- **Weekly team meetings and other recurring short meetings**: Show as-is if during work hours
- **Non-work-hour flights that don't impact 9-5**: Filter them out entirely

## Repository State — Always Use Source of Truth
- **Always `git fetch origin && git pull` before answering questions** about repo state, task progress, branches, or project status
- **Never rely on memory notes for repo/code state** — memory goes stale fast
- **Memory should only cache durable facts**: repo locations, pipeline names, project structure, tool preferences
- **Never cache in memory**: task completion status, branch state, migration progress, or anything that changes with commits

## Long-Running Improvement Pipelines
- **Full workflow doc**: `memory/workflows/long-running-improvement-pipeline.md`
- Pattern: Research → Plan → Implement → Validate → Cutover → Commit
- Use sub-agents (Sonnet) for research + implementation
- Plans must include: isolation strategy, 15+ test cases, failover, rollback, success criteria
- Ping user at milestones only — not routine events
- Stay below 90% context; throttle or start fresh session if approaching
- Always review sub-agent output before proceeding
- First used: Doc-RAG improvement series (2026-02-01)

## Coding & Development

- **Projects Directory**: `~/clawd/projects`
  - Base directory for all git repos and coding projects
  - Created: 2026-01-24

- **ALPA Mobile Repo**: `~/repos/ALPA-Mobile`
  - Azure DevOps: `airlinepilotsassociation/ALPA Mobile`
  - iOS Pipeline: "ALPA Mobile iOS"
  - Android Pipeline: "ALPA Mobile Android"
