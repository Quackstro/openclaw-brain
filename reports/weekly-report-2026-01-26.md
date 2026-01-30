## 📋 Weekly Update — Jan 19-26, 2026

### 📊 Summary

> Built complete SCIM auto-login flow with state machine architecture, SMS auto-submit, and robust error handling. Continued ACA Calculator business logic layer with FDP calculation services and expanded test coverage.

---

### 🔧 Changes This Week

**ALPA Mobile** *(scim-flow branch)*

- Built complete SCIM auto-login flow with state machine architecture
- Implemented SMS auto-submit for verification codes
- Added "Stay signed in?" prompt handling
- Enhanced logging for debugging and analytics
- Fixed navigation cancellation bug in autoFillSCIM

**ACA Calculator** *(main branch)*

- Expanded end-to-end calculation test coverage (data layer + business logic)
- Implemented FDP calculation service with contractual augmented/non-augmented values
- Built out Aircraft, Airport, and Time Formatting services

**Other**

- Updated FAR 117 guide link in FTDT module

---

### 🔄 In Progress

**ALPA Mobile**

- .NET 10 Migration (Epic #1810) — Phase 4 pending
- MSAL Integration (#1793) — Active
- iOS 26 Compatibility (#1811) — Active

**ACA Calculator**

- Business Logic Layer — In development

---

### 📋 Backlog

- **Secure Documents** — On hold due to SharePoint technical limitations; planning alternative solution
- **ALPA Mobile Refresh** — Waiting on UI design & functional specs
