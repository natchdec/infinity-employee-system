# Infinity Employee System — UX/UI V5 LOCKED

Status: **LOCKED**
Accepted reference: user-provided desktop Employee System home screenshot on 2026-10-04.
Scope: visual system and layout only. Business rules, authorization, approval invariants, audit behavior, data visibility and finance segregation remain unchanged.

## 1. Controlling Visual Reference
The approved reference is the first screenshot provided in the 2026-10-04 review. It supersedes the previous charcoal-sidebar V3/V4 shell styling.

The controlling composition is:
- bright white desktop sidebar;
- official Infinity orange + navy/charcoal logo lockup at the top;
- small “Employee System” label below the logo;
- warm-white / very light neutral page canvas;
- white work surfaces/cards with thin neutral borders;
- orange used for selected navigation and primary actions, never as a large solid background;
- navy/charcoal headings and compact grey supporting text;
- clean white topbar with search on the left and notification/account controls on the right;
- compact enterprise density, restrained rounding and almost-flat elevation.

## 2. Sidebar
Desktop target width: approximately 232–256 px depending on viewport.

Rules:
- background: white;
- subtle right border only;
- no charcoal/dark navigation rail;
- no framed white “logo card” inside a dark sidebar;
- logo remains visually crisp and horizontally proportioned like the approved reference;
- active navigation: pale orange fill + Infinity orange icon/text;
- inactive navigation: neutral blue-grey text, transparent background;
- group labels are small uppercase muted text;
- row height approximately 44–46 px with 8–10 px radius;
- identity block may remain at the bottom but must use the same light theme.

At notebook/tablet widths the existing compact icon rail may be used. Mobile continues to use bottom navigation.

## 3. Logo
- Use the Infinity orange infinity symbol with dark navy/charcoal “Infinity” wordmark and “SOLUTION SERVICE” caption.
- Do not use the previous blurry/oversized raster logo presentation.
- Do not place the logo on a contrasting dark block.
- The logo should read cleanly on the white sidebar at normal desktop scale.

## 4. Topbar
- white surface;
- 1 px neutral bottom border;
- search field approximately 44 px high with subtle grey border and 8–10 px radius;
- notification button and account identity aligned right;
- no heavy shadow or gradient.

## 5. Main Canvas and Surfaces
- page canvas: warm white / very light neutral;
- content cards/panels: white;
- borders: low-contrast neutral;
- elevation: none or very restrained;
- headings: dark navy/charcoal;
- supporting copy: muted grey;
- primary action: Infinity orange;
- semantic status colours remain reserved for success/warning/error.

## 6. Admin Sub-navigation
- single white horizontal strip;
- compact tabs;
- active tab = pale orange background + orange text;
- no large coloured header bands.

## 7. Compact Enterprise Controls
Desktop controls remain approximately 36–40 px high.
Avoid:
- oversized form fields;
- giant buttons;
- desktop action wrapping when sufficient horizontal space exists;
- excessive pill shapes;
- decorative gradients/glass effects.

## 8. Required Alignment Fixes
### Organization / Department row
Desktop order is:
Code → Department Name → Employee Count → Enabled → **Save → Delete**

Save and Delete must remain on the same row when desktop/tablet width reasonably permits. Delete is immediately after Save.

### Approval Rules route row
Desktop order is:
Reporting Line note → Final Approver mode → Approver/route status → Effective Date → **Apply**

The “ใช้ค่านี้” button must stay on the same row immediately after the date field when desktop width reasonably permits.

At mobile widths, vertical stacking is allowed for usability.

## 9. Responsive Acceptance
Required widths:
- 390 px mobile;
- 820 px tablet/notebook;
- 1440 px desktop.

Acceptance:
- no document-level horizontal overflow;
- sidebar does not cover content;
- navigation remains reachable;
- Thai labels do not collide;
- action order remains clear;
- desktop actions do not wrap unnecessarily;
- mobile touch targets remain usable.

## 10. Rejection Criteria
Reject a build if any of these are visible:
- dark/charcoal sidebar on desktop;
- old blurry logo presentation;
- Save/Delete stacked on desktop when there is room;
- Apply button below the effective date on desktop when there is room;
- high-contrast split between sidebar and main canvas;
- generic AI dashboard/glassmorphism/neon styling;
- business behavior changed by visual work.
