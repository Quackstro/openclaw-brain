# Weekly Report Template

## Structure

```markdown
## 📋 Weekly Update — [Date Range]

### 📊 Summary
> [High-level 1-2 sentence overview of key accomplishments]

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

## Schedule
- **Monday 9 AM ET**: Auto-generate weekly update (full report)
- **Tuesday 2:30 PM ET**: Status update for 3 PM afternoon meeting (condensed)
- **Wednesday 2:30 PM ET**: Status update for 3 PM afternoon meeting (condensed)

## Notes
- Focus on commit messages, not build counts
- Summary at top for high-level overview
- Changes This Week section before In Progress
- Backlog section at end
- Use list items, not tables
- Save report as markdown file and send to Telegram
- **Run `markdownlint` before saving** (config: `~/clawd/.markdownlint.json`)
- Add blank line after **bold** subheadings and before lists
