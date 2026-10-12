# Port notes: Billable Activities / Cost NTS (no timesheet submitted)

Copy into EquippedBiz. Behavior to preserve:

For **every displayed week-ending column** (including weeks that have already ended). Week ending is the Sunday of the site’s `week_starting_day` week.

- **NTS** — employee has no **approved** weekly timesheet for that week (none, draft, submitted/pending, or rejected).
- **—** — timesheet for that week **is approved**, but **0 hours / $0 on this PO**.
- Hours / $ — approved hours on this PO (unchanged).
- Totals stay numeric; NTS is not summed.
- **Saved reports** that lack `approvedTimesheetUserIdsByWeek` stay current-week-only. Snapshots that only keyed the current week and later keep **—** on past weeks that are missing from the map.
- **Newly generated reports** freeze `currentWeekEnding` + `approvedTimesheetUserIds` + `approvedTimesheetUserIdsByWeek` (every displayed week) at generation time so NTS matches the budget screen as of that moment.

Viewing a **future month** (e.g. October while still in September): every week in that month is “later,” so empty cells are NTS until each week’s sheet is approved.

## Files

### 1. `lib/utils.ts`

Add:

- `currentWeekEnding(weekStartsOn, asOf?)` → YYYY-MM-DD using app timezone “today” + `endOfWeek`.
- `buildApprovedTimesheetUserIdsByWeek(timesheets, weekEndings, thisWeekEnding)` → `{ [weekEnding]: userId[] }` for every displayed week. The third argument is unused and kept so existing callers stay valid. An empty array means nobody is approved.
- `isNoTimesheetCell({ weekEnding, hours, currentWeekEnding, userId, approvedTimesheetUserIds, approvedTimesheetUserIdsByWeek })`.
  - If this week’s key is present: NTS when hours are 0 and the user is not in that week’s approved list (past, current, and later).
  - If the key is missing and the week is before `currentWeekEnding`: **—** (older snapshots never stored past weeks).
  - If the key is missing and the week is current or later: NTS.
  - Else (old snapshots with only the flat list): NTS only when `weekEnding === currentWeekEnding`.

### 2. `app/api/budget/[poId]/billable-hours/route.ts`

On the monthly payload, add:

- `currentWeekEnding`: today’s week-ending (even if it is not a column in the viewed month)
- `approvedTimesheetUserIds`: user ids with `weekly_timesheets.status = approved` for that current week
- `approvedTimesheetUserIdsByWeek`: approved user ids keyed by week-ending for every displayed column

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
4. 9/6 and 9/13 with no approved timesheet show **NTS**. An approved sheet with 0 hours on this PO stays **—**.
5. Totals ignore NTS.
6. Open an **old** saved report: past weeks that were not keyed stay **—**; NTS only where the snapshot recorded the week. Generate a **new** report for the current month: NTS on every displayed week that has no approved timesheet.
