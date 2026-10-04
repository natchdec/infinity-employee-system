# Infinity Employee System — UX/UI V3 Foundation

**Status:** LOCKED — USER APPROVED  
**Implementation:** APPROVED FOR IMPLEMENTATION  
**Lock date:** 2026-10-04

## Locked visual source of truth

The user-approved V3 visual board in the 2026-10-04 conversation is the controlling visual reference. If prose in this document conflicts with that approved board, the approved board wins.

Brand identity is locked to the user-provided Infinity Solution Service logo: orange/red infinity mark, black “Infinity” wordmark, and orange “SOLUTION SERVICE” line. The previous blue Infinity treatment is rejected.

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
- Ink 900: #1F252B
- Ink 700: #3C4650
- Ink 500: #737C86
- Paper: #FFFFFF
- Canvas: #F7F3EE
- Warm surface: #FFF9F4
- Line: #E8E1D9
- Line strong: #D8CEC3
- Sidebar: #20262B
- Sidebar muted: #AAB0B5
- Infinity Orange: #E84A0C
- Infinity Orange hover: #CF3F08
- Orange soft: #FFF0E4
- Brand gold: #F6A044
- Success: #2D8A51
- Warning: #C77A13
- Danger: #C93E45
- Neutral status: #737C86

Infinity Orange is the primary action/selection accent. Charcoal is the navigation anchor. Large surfaces stay warm white/neutral; orange is never used as a full-page background.

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
- left navigation 220–236px, charcoal background
- exact Infinity brand logo at top of navigation
- warm-white top utility bar 56px with global search and account identity
- main content max 1440px
- compact page header on work screens
- Employee Home alone may use the approved warm skyline/welcome banner composition
- primary actions use Infinity Orange

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

This document is LOCKED by explicit user approval on 2026-10-04. Any later visual change requires a new documented revision; implementation must preserve this locked visual direction.
