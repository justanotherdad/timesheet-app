# Port notes: Billable Activities / Cost NTS (no timesheet submitted)

Copy into EquippedBiz. Behavior to preserve:

For the **current week-ending column only** (Sunday week that contains today, using the site’s `week_starting_day`):

- **NTS** — employee has no **approved** weekly timesheet for that week (none, draft, submitted/pending, or rejected).
- **—** — timesheet for that week **is approved**, but **0 hours / $0 on this PO**.
- Hours / $ — approved hours on this PO (unchanged).
- Past and future week columns stay **—** when empty.
- Totals stay numeric; NTS is not summed.
- **Saved reports** are unchanged (old snapshots lack the new fields).
- **Newly generated reports** freeze `currentWeekEnding` + `approvedTimesheetUserIds` at generation time so NTS matches the budget screen as of that moment.

## Files

### 1. `lib/utils.ts`

Add:

- `currentWeekEnding(weekStartsOn, asOf?)` → YYYY-MM-DD using app timezone “today” + `endOfWeek`.
- `isNoTimesheetCell({ weekEnding, hours, currentWeekEnding, userId, approvedTimesheetUserIds })`.

### 2. `app/api/budget/[poId]/billable-hours/route.ts`

On the monthly payload, add:

- `currentWeekEnding`: that date if it is in `weekEndings`, else `null`
- `approvedTimesheetUserIds`: user ids with `weekly_timesheets.status = approved` for that week (any PO; it is the weekly sheet)

Reuse the existing approved-timesheets query for the month; do not require hours on this PO.

### 3. `components/budget/BasicBudgetView.tsx`

In Billable Activities and Billable Cost week cells (and the employee drill-down popup): if `isNoTimesheetCell` → show `NTS` (tooltip “No timesheet submitted”). Column totals unchanged.

### 4. `lib/generated-report.ts`

Optional on `ReportBillableActivitiesMonth` and `ReportBillableCostMonth`:

- `currentWeekEnding?: string | null`
- `approvedTimesheetUserIds?: string[]`

Old snapshots omit these → viewer keeps **—**.

### 5. `lib/generated-report-billable.ts`

When building a month, set those two fields the same way as billable-hours.

### 6. `components/reports/GeneratedReportView.tsx`

Hours and cost week cells: `NTS` via `isNoTimesheetCell` when the frozen fields are present.

## Manual checks

1. September with current WE 9/13: people who billed 9/6 but have no approved sheet for 9/13 show **NTS** on 9/13 in both tables.
2. Approved sheet for 9/13 with no hours on this PO → **—**.
3. Submitted / pending / draft / rejected for 9/13 → **NTS**.
4. 9/6 and 9/20 empty cells stay **—**.
5. Totals ignore NTS.
6. Open an **old** saved report: no NTS. Generate a **new** report for the current month: NTS on the current week column.
