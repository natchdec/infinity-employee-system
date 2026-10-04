# UX/UI V4 LOCKED SPEC

**Status:** LOCKED — user-approved visual direction
**Lock date:** 2026-10-04
**Supersedes:** V3 visual styling only. Business rules, approval invariants, finance segregation, audit, and data visibility remain unchanged.

## Visual source of truth
The user-provided V4 reference images in the 2026-10-04 conversation control visual hierarchy, density, balance, spacing, form proportions, table proportions, cards, navigation, and responsive behavior.

## Product character
- Warm enterprise, editorial, precise, compact, human.
- Warm neutral canvas; white working surfaces.
- Charcoal navigation anchor; Infinity orange for primary actions and selection.
- No oversized controls, inflated whitespace, giant checkboxes, or generic AI dashboard composition.
- Cards are purposeful working groups, not decoration.

## Density
- Desktop control height: 36–40px.
- Desktop buttons: 36–40px, compact horizontal padding, single-line labels.
- Checkbox/radio visual size: 16–18px.
- Standard form label: 12–13px.
- Standard body/table: 12–14px.
- Section spacing: 16–24px, not 32–48px unless hierarchy requires it.
- Textarea height follows content intent; simple address/holiday lists must not become oversized blank surfaces.

## Forms
- Form width follows task, never automatically full page.
- Profile/settings forms: max 680–760px.
- Admin policy forms: max 980px with balanced multi-column rows.
- Inputs/selects default to 38px desktop.
- Textareas default to 88–120px for short structured data.
- Checkbox labels align inline and never inherit full-width text-input sizing.
- Primary action remains visually dominant but proportionate.
- Desktop rows keep action buttons on the same row when space permits.
- Mobile stacks cleanly at <=767px.

## Admin
- Employee role checkboxes compact and horizontally balanced.
- Company Holiday / Working Schedule uses a compact schedule grid, horizontal weekday controls, and a restrained holiday textarea.
- Approval Delegation desktop row = Delegate + From + To + Action in one aligned row.
- Approval routing configuration stays readable with compact selects/date/action.
- Tables use compact rows and restrained status chips.

## Profile
- Home Address and Commute baseline use a constrained settings column.
- Home Address textarea is compact, not page-width.
- Supporting notes remain secondary.
- Action button sits close to the field group.

## Responsive acceptance
Review every family at:
- 390×844
- 820×1180
- 1440×900

No horizontal document overflow. Local data tables may scroll horizontally.

## Locked acceptance
Reject a screen if:
- checkbox/tick appears larger than surrounding text/control rhythm;
- a field dominates the screen without task justification;
- action buttons wrap awkwardly on desktop;
- whitespace makes related controls look disconnected;
- shared UI does not match the V4 reference density and balance.
