# UX

## Experience Principles
1. Mobile-first for employees; desktop-efficient for Finance/Admin.
2. Common employee actions must be reachable in one or two taps from Home.
3. Receipt capture is a primary action, not a hidden file-upload detail.
4. Long forms use progressive sections and autosave drafts.
5. Finance uses dense, readable tables with filters, bulk actions, and clear exception states.
6. Thai language is first-class; layouts must be tested with real Thai copy.
7. One primary action per screen.
8. Status color is semantic only, never the main visual theme.

## Visual Direction
Quiet Enterprise / Modern Editorial.
- Light theme by default.
- Warm neutral page background.
- White working surfaces where needed.
- Charcoal text.
- Infinity brand blue as primary accent.
- Restrained red/orange/green only for error/warning/success.
- Thin borders and subtle elevation.
- 8-12px radius range; avoid pillification.
- Strong typography hierarchy.
- No neon, glow, heavy gradients, glassmorphism, generic dark AI dashboard, or oversized decorative KPI cards.

## Employee Mobile Navigation
- Home
- My Requests
- New Request
- Trips
- Profile

### Employee Home
- Greeting and current payroll cutoff note.
- Primary New Request action.
- Quick actions: Leave, OT, Expense, Trip.
- Needs Attention: settlement due, receipt outstanding, request returned.
- Recent Requests.

### New Expense
- Expense type.
- Project/customer.
- Date.
- Amount or mileage calculation.
- Take Photo / Upload Receipt.
- Notes.
- Save Draft / Submit.
- Entertainment-specific fields appear conditionally.

### OT
- Date.
- Project.
- Task / work description.
- Whole-hour inputs grouped by applicable OT category/multiplier.
- Calculated summary.
- Submit.

### Leave
- Leave type.
- Full-day date or date range.
- Balance before/after.
- Reason / evidence if required.
- Submit.

### Trip
- Project.
- Destination.
- Domestic / International.
- Start/end dates.
- Per diem preview.
- Expected hotel / transport.
- Cash Advance request.
- Submit.

## Head Approval
- Mobile approval inbox.
- Request summary first, detail second.
- Clear approve / return / reject.
- No self-approval step for Head/Owner requests.

## Finance Desktop
Primary areas:
- Claims
- Payment Batches
- Cash Advances
- Settlements
- Receipt Tracking
- Payroll OT
- Accounting Export
- Reports

Finance list screens use compact tables with:
- Employee
- Request type
- Project
- Amount
- Approval status
- Digital receipt
- Original receipt
- Finance verification
- Payment status
- Exception flags

## Admin
- Employees
- Organization
- Policies
- Holidays
- Expense Types
- Approval Rules
- Project Integration
- System Settings

## Initial Mockup Set
1. Employee Mobile Home.
2. Mobile Expense Claim with camera-first receipt capture.
3. Mobile Head Approval detail.
4. Finance Desktop Claims queue.
5. Finance Desktop Payment Batch.
6. Admin Policy configuration.

## Design Acceptance Gate
Before implementation:
- Review at 390px mobile width and standard desktop width.
- Use realistic Thai content.
- Validate hierarchy, density, touch targets, and form length.
- Reject any screen that resembles a generic AI dashboard/template.
- Lock components, spacing, typography, statuses, and navigation before coding.
