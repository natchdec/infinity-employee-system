# Infinity Employee System — UX/UI V3 Foundation

**Status:** PROPOSED — NOT LOCKED  
**Implementation:** FROZEN until explicit design lock  
**Date:** 2026-10-04

## Design objective

V3 is a composition redesign, not a skin refresh. The previous universal hero + repeated KPI/card treatment is rejected because it still reads like a generic AI-generated dashboard.

The product should feel like a carefully designed internal enterprise product from Infinity Solution Service: calm, precise, Thai-first, role-aware, and operational.

## Anti-AI-slop rules

Forbidden as defaults:
- universal decorative page hero
- repeated 4-card KPI strip
- equal-size card-grid navigation
- decorative gradients, glow, glassmorphism
- "everything is a rounded card"
- excessive pills
- oversized titles
- icon on every label
- fake analytics/decorative charts
- same composition for Employee, Head, Finance and Admin

## Product character

Precise · Calm · Editorial · Operational · Human · Thai-first

Employee UI is task-oriented and light.
Head UI is reading/decision-oriented.
Finance UI is dense and ledger-oriented.
Admin UI is configuration-oriented.

## Design tokens

### Color
- Ink 900: #162033
- Ink 700: #33415C
- Ink 500: #69758A
- Paper: #FFFFFF
- Canvas: #F6F7F9
- Line: #E3E7ED
- Line strong: #CCD3DD
- Infinity Blue: #1769C2
- Blue soft: #EEF5FC
- Success: #267A4B
- Warning: #A56612
- Danger: #B83A43
- Neutral status: #687386

Infinity Blue is an action/selection accent, not a page background theme.

### Typography
Primary: Noto Sans Thai.
- Page title: 28 desktop / 24 mobile, 600
- Section title: 18 / 17, 600
- Subsection: 15, 600
- Body: 14, 400
- Compact table: 13, 400
- Label: 12, 500
- Caption: 11, 400
- Finance numbers use tabular figures

No uppercase English eyebrow above every section.

### Spacing
4px base. Preferred rhythm: 4 / 8 / 12 / 16 / 24 / 32 / 48.

### Radius
- controls: 6px
- standard panel: 8px
- modal/drawer: 10px
- status tag only: pill

### Elevation
Normal working surfaces use borders, not shadows.
Shadows reserved for modal/drawer/popover/sticky separation.

## Application shell

### Desktop >=1200
- left navigation 236px
- white navigation on neutral canvas
- top utility bar 56px
- main content max 1440px
- compact page header: breadcrumb/context + title + optional one-line description + primary action
- no global hero

### Notebook 820–1199
- sidebar collapses to 72px rail or drawer
- table overflow stays inside table container
- action toolbar may wrap

### Mobile 390–819
- compact top bar
- bottom nav: Home / Requests / New / Work / Profile
- role queues live under Work
- one-column forms
- sticky primary action where useful
- tables convert to labeled rows only when comparison is not essential

## Navigation architecture

### Employee
Home, My Requests, New Request, Calendar Inbox, Receipt Inbox, Trips, Projects, Monthly Statement, Profile.
Secondary: Notifications, Needs Attention, Audit.

### Head / Owner
Employee navigation + Approval Inbox.

### Finance
Overview, Claims Queue, Payments, Settlements, Original Receipts, OT/Payroll, Reconciliation, Project P&L, Monthly Closing, Accounting Export, Operations.

### Admin
Overview, Employees, Microsoft 365 Directory, Organization, Policies, Approval Rules, Project Integration.

## Shared interaction patterns

Drawers:
- edit employee
- assign receipt
- finance row detail
- mobile filters

Full pages:
- create/edit request
- request detail
- project detail
- monthly close
- policy editing

Modals only:
- destructive confirmation
- return/reject reason
- irreversible period lock

## Shared states

Every page must specify:
- loading
- empty
- error
- permission denied
- stale/partial integration
- keyboard focus
- validation error
- success confirmation
- mobile overflow

Loading uses structure-matching skeleton rows.
Empty states are text-first.
Integration stale state always shows timestamp/source.

## Responsive acceptance

Review every page at:
- 390 × 844
- 820 × 1180
- 1440 × 900

Must pass:
- no document horizontal overflow
- no clipped navigation
- no bottom-nav overlap
- no unreadable forced table columns
- primary action remains reachable
- real Thai copy fits
- mobile touch target >=44px
- forms preserve logical reading order

## Lock rule

This document remains PROPOSED until the user explicitly approves V3. No implementation work begins before design lock.
