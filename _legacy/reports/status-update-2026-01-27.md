# 📋 Status Update — Tuesday, Jan 27 2026

## 📊 Summary

> Significant progress on SCIM auto-login flow and .NET 10 migration tasks. Auto-login state machine implemented with SMS auto-submit and ADFS support. Four .NET 10 migration tasks completed (4.3–4.7). ACA Calculator branch stable — no new commits.

---

## 🔧 Recent Changes

**ALPA Mobile — scim-flow**

- Implement AutoLoginStateMachine.js for login flow detection and management
- Implement SMS auto-submit for verification codes with configurable delay
- Add handling for "Stay signed in?" prompt in auto-login flow
- Enhance ADFS login flow with sts2.alpa.org support and improved debugging
- Refactor autoFillSCIM for improved element retrieval and validation
- Enhanced logging across AutoLoginController and state tracking

**ALPA Mobile — DotNet10**

- Task 4.3: Page.IsBusy Migration — complete
- Task 4.4: MessagingCenter Migration — docs updated
- Task 4.6: TableView Migration — no changes needed
- Task 4.7: Other API Updates — no changes needed
- DisplayAlert → DisplayAlertAsync migration across multiple files

**ALPA Mobile — development**

- Updated FAR 117 guide link in FTDT operation type selection

**ACA Calculator**

- No new commits — last activity was PR #1200 (cleanup)

---

## 🔄 In Progress

**SCIM Auto-Login (scim-flow)**

- Auto-login state machine — functional, testing/polish phase

**.NET 10 Migration (DotNet10)**

- Task 4.5: ListView → CollectionView — next up (critical)

---

## 🚧 Blockers

- **ListView → CollectionView** (Task 4.5) — largest remaining migration task, high complexity
- **ACA Calculator** (#1812) — waiting to resume development

---

## 📋 Backlog

- **iOS 26** (#1811) — Active, planning phase
- **MSAL Integration** (#1793) — temporarily disabled
- **WebView cookie clearing** (#1789) — authentication context issue
- **UI Font Sizes** (#1700) — pending
