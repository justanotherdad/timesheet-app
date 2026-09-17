# Port notes: Billable Activities / Cost NTS (no timesheet submitted)

Copy into EquippedBiz. Behavior to preserve:

For the **current week-ending and every later week-ending column** (Sunday week that contains today, using the site’s `week_starting_day`, and any week after that):

- **NTS** — employee has no **approved** weekly timesheet for that week (none, draft, submitted/pending, or rejected).
- **—** — timesheet for that week **is approved**, but **0 hours / $0 on this PO**.
- Hours / $ — approved hours on this PO (unchanged).
- Past week columns stay **—** when empty.
- Totals stay numeric; NTS is not summed.
- **Saved reports** are unchanged (old snapshots lack `approvedTimesheetUserIdsByWeek`, so they stay current-week-only).
- **Newly generated reports** freeze `currentWeekEnding` + `approvedTimesheetUserIds` + `approvedTimesheetUserIdsByWeek` at generation time so NTS matches the budget screen as of that moment.

Viewing a **future month** (e.g. October while still in September): every week in that month is “later,” so empty cells are NTS until each week’s sheet is approved.

## Files

### 1. `lib/utils.ts`

Add:

- `currentWeekEnding(weekStartsOn, asOf?)` → YYYY-MM-DD using app timezone “today” + `endOfWeek`.
- `buildApprovedTimesheetUserIdsByWeek(timesheets, weekEndings, thisWeekEnding)` → `{ [weekEnding]: userId[] }` for current + later weeks only.
- `isNoTimesheetCell({ weekEnding, hours, currentWeekEnding, userId, approvedTimesheetUserIds, approvedTimesheetUserIdsByWeek })`.
  - If `approvedTimesheetUserIdsByWeek` is present: NTS when `weekEnding >= currentWeekEnding` and the user is not in that week’s approved list.
  - Else (old snapshots): NTS only when `weekEnding === currentWeekEnding` using the flat list.

### 2. `app/api/budget/[poId]/billable-hours/route.ts`

On the monthly payload, add:

- `currentWeekEnding`: today’s week-ending (even if it is not a column in the viewed month)
- `approvedTimesheetUserIds`: user ids with `weekly_timesheets.status = approved` for that current week
- `approvedTimesheetUserIdsByWeek`: approved user ids keyed by week-ending for current + later columns

Reuse the existing approved-timesheets query for the month; do not require hours on this PO.

### 3. `components/budget/BasicBudgetView.tsx`

In Billable Activities and Billable Cost week cells (and the employee drill-down popup): if `isNoTimesheetCell` → show `NTS` (tooltip “No timesheet submitted”). Column totals unchanged.

### 4. `lib/generated-report.ts`

Optional on `ReportBillableActivitiesMonth` and `ReportBillableCostMonth`:

- `currentWeekEnding?: string | null`
- `approvedTimesheetUserIds?: string[]`
- `approvedTimesheetUserIdsByWeek?: Record<string, string[]>`

Old snapshots omit these → viewer keeps **—**. Snapshots that only have the flat list stay current-week-only.

### 5. `lib/generated-report-billable.ts`

When building a month, set those fields the same way as billable-hours.

### 6. `components/reports/GeneratedReportView.tsx`

Hours and cost week cells: `NTS` via `isNoTimesheetCell` when the frozen fields are present.

## Manual checks

1. September with current WE 9/20: people who billed 9/6 or 9/13 but have no approved sheet for 9/20 show **NTS** on 9/20 **and** 9/27 in both tables.
2. Approved sheet for 9/20 with no hours on this PO → **—** on 9/20; 9/27 still **NTS** until that week is approved.
3. Submitted / pending / draft / rejected for 9/20 → **NTS**.
4. 9/6 and 9/13 empty cells stay **—**.
5. Totals ignore NTS.
6. Open an **old** saved report: NTS only on the frozen current week (or none). Generate a **new** report for the current month: NTS on current + later weeks.
