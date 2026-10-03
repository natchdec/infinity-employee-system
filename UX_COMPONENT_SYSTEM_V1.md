# UX Component System V1

Status: CANDIDATE until the corresponding visual review receipt is recorded. Product-owned system for Quiet Enterprise / Modern Editorial; not a claim to implement Fluent, Carbon or another branded design system. Native semantic controls are preferred; a single accessible primitive library may supply complex dialog/menu behavior. Taste is a visual guardrail, not authority over financial interaction.

## Tokens

| Token | Value / rule |
| --- | --- |
| canvas | #f6f5f2, warm neutral |
| surface | #ffffff |
| navigation | #f0efeb |
| text | #252724 |
| muted text | #5d625f; never use opacity to make essential text unreadable |
| border | #d9d8d3 |
| primary | #2359a7 |
| primary hover | #1d4888 |
| primary subtle | #edf3fc |
| success text / surface | #246044 / #eef7f0 |
| warning text / surface | #805000 / #fff5e2 |
| danger text / surface | #9b3434 / #fbefee |
| neutral status | #5b615e / #ecefea |
| focus | 2px solid primary, 3px offset; never remove without an equivalent |
| radius | control 8px, working panel 10px, dialog 12px; compact status label 4px is the only rectangular-tag exception; circular avatar is identity only |
| elevation | no shadow on most panels; dialog/popover 0 8px 28px rgba(37,39,36,.10) |
| spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48px |
| motion | 120-160ms color/opacity only where useful; no continuous decorative motion; disable nonessential transitions under prefers-reduced-motion |
| z-index | content 0, sticky table 10, navigation 20, backdrop 40, dialog 50, transient notice 60 |

Contrast is tested on rendered foreground/background combinations. Essential text must reach 4.5:1; large text and graphical/control boundaries follow applicable AA requirements. Muted does not mean low contrast. Status text and icons supplement color; color alone never represents an outcome.

## Typography and Thai

Use self-hosted Noto Sans Thai through the project's font dependency, weights 400/500/600/700. System sans-serif fallback remains usable. Do not fetch Google Fonts on employee page requests. Body: desktop 14px/1.65; mobile 16px/1.65. Compact table and metadata text: 13px/1.6, never the primary phone input size. Form inputs are 16px on phones. H1: 28px/1.4 desktop, 26px/1.45 mobile; H2 20px/1.5; H3 16px/1.6. No giant marketing headline. Thai body and labels have normal letter spacing; no uppercase/tracking treatment applied to Thai. No clipping tone marks, vowel marks or descenders through fixed line boxes. Amounts use tabular numerals and right alignment. Currency labels are explicit; do not abbreviate financial values into 1.2k when exact amounts matter.

## Layout

Desktop shell: 224px navigation, 64px top bar; main gutter 32px at 1440, 24px at 1024. Working content max 1440px; employee forms max 760px. Finance table can use available width. At 820px use condensed navigation and 24px gutters; do not squeeze every table column to fit. At 390px use 16px gutters, one column and bottom navigation with safe-area padding. Bottom actions add enough content padding that the final field and validation remain visible. Use min-height:100dvh, not fixed 100vh. Breakpoints: 640, 768, 1024, 1280, 1536px. CSS Grid defines column layouts with explicit collapse; no fragile percentage flex arithmetic.

## Components

### ApplicationShell and navigation

Infinity text wordmark is restrained and is not represented as the official supplied company logo. Current page is announced with aria-current. Desktop sections are labeled and grouped by work mode. Mobile bottom navigation has five stable destinations with 44px or larger touch regions. A work-mode menu appears only for actual roles; it does not impersonate another employee. Browser back and keyboard navigation work. Provide a skip-to-content link. A thin divider and restrained selected accent replace floating glowing navigation cards.

### PageHeader and action bar

H1 plus concise context/description, then a single primary action. Breadcrumbs are used on detail/edit routes, not as decorative eyebrow labels. Header and buttons wrap deliberately at narrow widths. Repeated submit intent may appear in a sticky mobile region only when the original region is not concurrently visible; labels remain identical. No giant empty header area.

### Button, link and icon

Primary: solid primary background, white text, 8px radius, minimum height 44px mobile / 40px desktop. Secondary: surface with visible border and text. Destructive: danger text or fill only for a genuinely destructive decision. Disabled controls keep readable labels and explain important reasons nearby. Busy state prevents re-submission and reads กำลังส่ง rather than merely spinning. Icon-only controls require an accessible name. Use one icon family (Phosphor) when icons are needed; no hand-drawn SVG icons or emoji-based production navigation. Standard icons 18-20px; no decorative 48px category symbols.

### Field, input and textarea

Label above input, helper below, error below helper with aria-describedby. Required is indicated in text or an explained marker, not color alone. Label remains visible when populated. Textareas grow within reasonable bounds, minimum 3 lines for work description. Inputs have solid visible border, enough inner padding and clear focus. Disabled and read-only are semantically different. Do not rely on placeholders as instructions. Masked text is not secret storage; secret values are never returned to the UI.

### MoneyField and HourField

Money accepts a decimal string with at most two digits after the separator and is parsed into satang; no floating-point arithmetic or browser-supplied final payout is authoritative. Show THB suffix and exact formatted preview. Negative input is allowed only on a dedicated adjustment workflow, never an ordinary claim. HourField uses whole integers with min/step and server validation; category label and multiplier are policy-provided. Display zero/blank clearly; reject 1.5, scientific notation, NaN and unsafe ranges. Do not add time pickers or minute conversions.

### DateField and DateRange

Visible full-day dates with Thai labels. Native date control or an accessible maintained calendar; never unlabeled custom calendar cells. The review summary shows interpreted dates and counted days. ISO date validation occurs server-side. Timezone is Asia/Bangkok for business dates; dates do not shift when viewed on a travelling employee's device. No half-day/hour switch. Holidays are visible where they affect counting/cutoff.

### Select and ProjectPicker

Small fixed enumerations use a native select. Searchable project selection uses an accessible combobox with keyboard selection, empty/loading/error states and source/last-sync context. Never create a new authoritative project from a no-results state. Historic inactive references remain readable; choosing a currently inactive project is blocked or governed by an explicit published exception, not silently allowed.

### RequestSections and review summary

Long requests are grouped into clear fieldsets: details, lines/calculation, evidence, review. Optional sections reveal progressively without changing the top-level navigation. Review shows exact days/hours/money, next approver, finance/payment route and applicable policy. Back to edit preserves safe form state. A preview is labeled preview until the server commits submission.

### Uploader / CameraCapture

Two explicit entry actions: ถ่ายรูปหลักฐาน and เลือกไฟล์. Camera uses an ordinary capture-enabled file control; browser permission failure falls back to picker. Each file row shows safe filename, type, size, upload state and retry/remove where allowed. Validate size and actual file content, not just extension. Private downloads always reauthorize. No permanent public URL. Images have meaningful alt text; PDF is served as a protected attachment unless a separately secured preview is provided. OriginalReceiptState is a separate control/record, never inferred from a digital thumbnail.

### CalculationBreakdown

A compact definition list or line table, not a large decorative total card. Mileage displays origin class, route source, gross distance, commute deduction, eligible distance, rate and amount per leg. OT displays category, integer hours, multiplier and result; restricted wage details are not exposed in broad tables. Trip settlement labels paid advance, approved actual, employee return or company top-up. Display the saved version and timestamp on historical claims. Do not call a manual estimate Google-verified.

### StatusLabel and exception notice

A small rectangular label with text, semantic color and optional icon. Approval, Finance, Payment, Digital Evidence and Original Receipt are independent. Detail pages show a readable status grid; finance tables show separate columns. An original outstanding notice may coexist with จ่ายแล้ว. COI notice explains another authorized Finance/Admin person is required; it has no override button. Configuration-required state is not green and does not use a fake checkmark.

### DataTable, filters and pagination

Real table semantics with caption and column headers. Row height is content-driven, approximately 48-56px for the main finance table; never clip Thai multiline content. Amounts right aligned, status text non-truncated, reference/employee visible. Optional columns may be toggled but not critical amount/identity. At tablet/phone, contain horizontal scrolling within the table region; offer a detail route and retain identifying columns. Filters precede table and use meaningful Thai labels. Selection checkboxes name their rows. Bulk confirmation shows exactly selected visible IDs/count/total and any ineligible rows. No implicit selection of every page.

### DetailPanel, dialog and bottom sheet

Desktop detail can use a 420-520px side panel when context benefits; a full route remains addressable. On phone it becomes a full-width view. Modal dialogs use an accessible primitive or native dialog with correct focus management, labelled title and description. Financial confirmation includes amount and external-payment wording. Escape dismisses without committing; backdrop does not confirm. Bottom sheets are reserved for chooser/filter/camera choices and have an explicit close action. Forms longer than a short sheet become full pages.

### Timeline and audit history

Chronological immutable events with actor, action, date/time and reason. System skip is visibly a system event, not the owner's signature. Revision changes and policy references are inspectable. Medical/private content is not duplicated into broad logs. A status update appends an event; it never erases a prior action. Paid/exported record correction links to a new adjustment, not editable original fields.

### Feedback

Skeleton: layout-shaped, aria-busy, no fabricated numbers. Empty: concise statement and relevant action. Error: nearby reason and retry; unsaved input remains in the current page. Success: actual server reference and next step. Offline: anonymous/read-only fallback, no promise of pending financial replay. Toasts may supplement but never replace a persistent financial outcome or validation message. Error boundary offers safe reload and a correlation reference without stack traces/secrets.

## Component acceptance checklist

For every primary family: 390px, 820px and 1440px render; keyboard focus; Thai long text; 200% zoom; no document-level horizontal overflow; controls usable with one hand where relevant; disabled/COI/configuration states readable; status does not depend only on color; no lorem ipsum, fake AI widgets, glass/neon/gradient theme or oversized decorative cards. Test component behavior independently from the static design prototype. Record actual screenshots and findings before changing candidate status to locked.
