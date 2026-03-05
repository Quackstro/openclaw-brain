## 📋 Weekly Update — Jan 26 – Feb 1, 2026

### 📊 Summary

> Completed .NET 10 migration Phase 4 (ListView, TableView, API updates) and merged 8 PRs into DotNet10 — including UI test framework, multiple CollectionView fixes, and WebView cache/auth improvements. Stood up the unit test project with FDP calculation tests. On the ACA Calculator side, advanced the UI migration with three brand variants, Playwright visual regression testing, and comprehensive component test coverage.

---

### 🔧 Changes This Week

**ALPA Mobile** *(DotNet10)*

- Merged PR 1278: Implement Appium/NUnit UI testing framework (#1819)
- Merged PR 1279: Enable search button when free text matches airport code (#1817)
- Merged PR 1281: Guard Email.ComposeAsync with IsComposeSupported check (#1763)
- Merged PR 1280: Clear WebView cache and storage on auth context change (#1789)
- Merged PR 1283: Fix CollectionView layout to fill remaining screen space (#1815)
- Merged PR 1282: Cache RefreshCommand to fix settings list not updating on diagnostics toggle (#1815)
- Merged PR 1270: Merge scim-flow into DotNet10
- Merged PR 1259: Task 4.5 — ListView to CollectionView migration
- Merged PR 1264: Fix JumpseatFlightFinder not showing filter options
- Merged PR 1265: Fix black line artifact on PilotGroupHotelsPage CollectionView
- Merged PR 1263: Fix black line rendering artifact in International Directory CollectionView
- Merged PR 1261: Task 4.6 — TableView migration
- Merged PR 1262: Task 4.7 — Other API updates
- Merged PR 1258: Updated FAR 117 guide in FTDT operation type selection
- Merged PR 1257: Bring iOS26 branch up to date
- Merged PR 1256: Updated FAR 117 guide (scim-flow)
- Refactor UI test scripts and enhance README documentation
- Enhance ADFS login flow with support for sts2.alpa.org and improved diagnostics

**ALPA Mobile** *(unit-test)*

- Add unit test project with initial test setup
- Add unit tests for MAUI migration and update existing tests
- Refactor unit tests for flight duty period calculations to use hour-based lookup tables
- Refactor unit test documentation to clarify migration errors and restore original logic
- Fix: remove --no-restore from unit test step to resolve restore failure

**ALPA Mobile** *(other branches)*

- Reduce Sentry noise for GetPageBannersAsync auth failures with cache fallback
- Add Sentry MCP server and Microsoft Learn MCP server to Copilot coding agent config

**ACA Calculator** *(UI-Migration)*

- Merge ui-aca-brand-v1 into UI-Migration
- Create three brand variants: Classic Corporate (V1), Modern Blue (V2), Warm Neutral (V3)
- Integrate theme provider with custom theme settings
- Add visual regression tests for FDP Calculator UI using Playwright
- Add cross-browser testing support and update migration documentation
- Center logo in sidebar and comment out top-row navbar
- Expand comprehensive test coverage (integration/scenario tests, shared input component tests)
- Refactor FDP Calculator tests to inherit from FdpCalculatorTestBase
- Remove project template boilerplate components
- Clean up empty code change sections in changelog

---

### 🔄 In Progress

**ALPA Mobile**

- Unit test project — FDP calculation tests written; CI pipeline adjusted
- MSAL Integration (#1793) — Active
- UI Smoke Tests (#1820) — Active
- .NET 10 Migration (#1810) — Phase 4 complete; continuing integration work

**ACA Calculator**

- UI Migration — Brand variants ready for review; visual regression baselines established

---

### 📋 Backlog

- **UI Refresh** (#1821) — New epic; waiting on UI design & functional specs
- **iOS 26** (#1811) — Branch brought up to date; holding for platform release
- **Secure Documents** — On hold due to SharePoint technical limitations; planning alternative solution
- **MSAL Integration** (#1793) — Active but pending further work
- **Analytics Enhancement** (#1781) — Replace App Center with new analytics provider
