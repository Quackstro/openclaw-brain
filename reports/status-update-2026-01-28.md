# 📋 Status Update — Wednesday, Jan 28 2026

## 📊 Summary

> ACA Calculator UI and test infrastructure progressing rapidly — shared input components, FDP calculator tests, and integration/scenario coverage added. DotNet10 branch synced with scim-flow merge. Three PRs pending review on DotNet10.

---

## 🔧 Recent Changes

**ACA Calculator** *(main)*

- Fixed Component list alignment
- Refactor FDP Calculator tests — new `FdpCalculatorTestBase` for code reuse
- 4.5.5 Comprehensive Coverage Expansion
- 4.5.5 Integration/Scenario Tests
- 4.5.3 Shared Input Component Tests
- Remove project template boilerplate components
- UI Components foundation work

**ALPA Mobile — DotNet10**

- Merged PR 1270: scim-flow → DotNet10 sync

**ALPA Mobile — scim-flow**

- No new commits (auto-login in testing phase)

---

## 🔄 In Progress

**ACA Calculator**

- UI shared components and test coverage — actively building out

**.NET 10 Migration (DotNet10)**

- Task 4.5: ListView → CollectionView — PR open, under review

---

## 📬 Open PRs

- **Task 4.5: ListView → CollectionView** → DotNet10
- **Refactor: Extract shared auth+cache helper in DataManager.cs** → DotNet10
- **Fix: Reduce Sentry noise for auth failures with cache fallback** → DotNet10
- **Feature: expandable toggle from dropdown arrow** → development

---

## 🚧 Blockers

- None currently

---

## 📋 Backlog

- **iOS 26** (#1811) — Active, planning phase
- **MSAL Integration** (#1793) — temporarily disabled
- **WebView cookie clearing** (#1789) — authentication context issue
- **UI Font Sizes** (#1700) — pending
