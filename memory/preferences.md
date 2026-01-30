# Preferences

## Work Items
- **Always update the work item** with research findings, root cause analysis, and recommended fix when a plausible solution or suggestion exists

## Coding Tasks
- **Preferred tool**: GitHub Copilot CLI (`copilot`) — fallback: Claude Code (`claude`)
- Copilot CLI may need re-auth if 401 error (check `~/.copilot/logs/` for errors)

### Git Workflow for Delegated Coding Tasks

**ALWAYS follow this workflow when delegating to sub-agents:**

1. **Create git worktree** with isolated branch:
   ```bash
   cd ~/repos/<project>
   git fetch origin
   git worktree add -b openclaw-<short-name> /tmp/openclaw-<short-name> origin/<source-branch>
   ```

2. **Branch naming**: `openclaw-<short-description>`
   - Examples: `openclaw-listview-migration`, `openclaw-isbusy-fix`, `openclaw-docs-update`

3. **Delegate to coding agent** with explicit instructions:
   ```bash
   cd /tmp/openclaw-<short-name> && claude -p "<task description>
   
   When complete:
   1. Update documentation if applicable (mark task complete, add notes)
   2. Run /review to check for mistakes before committing
   3. Commit with message '<Task X.X: Description>'
   4. Push: git push -u origin openclaw-<short-name>" --dangerously-skip-permissions
   ```

   **Important:** Always include step to run `/review` before commit — catches AI slop and mistakes.

4. **After agent completes**, create PR:
   ```bash
   az repos pr create --repository "<repo>" --project "<project>" \
     --source-branch "openclaw-<short-name>" --target-branch "<source-branch>" \
     --title "<Task X.X: Description>" --description "<summary>"
   ```

5. **Clean up worktree**:
   ```bash
   cd ~/repos/<project>
   git worktree remove /tmp/openclaw-<short-name>
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

## Repository State — Always Use Source of Truth
- **Always `git fetch origin && git pull` before answering questions** about repo state, task progress, branches, or project status
- **Never rely on memory notes for repo/code state** — memory goes stale fast
- **Memory should only cache durable facts**: repo locations, pipeline names, project structure, tool preferences
- **Never cache in memory**: task completion status, branch state, migration progress, or anything that changes with commits

## Coding & Development

- **Projects Directory**: `~/clawd/projects`
  - Base directory for all git repos and coding projects
  - Created: 2026-01-24

- **ALPA Mobile Repo**: `~/repos/ALPA-Mobile`
  - Azure DevOps: `airlinepilotsassociation/ALPA Mobile`
  - iOS Pipeline: "ALPA Mobile iOS"
  - Android Pipeline: "ALPA Mobile Android"
