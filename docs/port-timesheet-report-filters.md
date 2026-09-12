# Port notes: Timesheet Options duplicates, Timesheet Report wizard/filters, invoice/PO multi-select

Copy this change set into EquippedBiz. Do **not** include the performance/slowness work (separate pass).

## Behavior to preserve

### Timesheet Options (Systems / Deliverables / Activities)

- Adding, renaming, or CSV-importing a name that already exists **for that same client/site** is blocked.
- Match is **case-insensitive** (`execution` = `Execution`).
- Scope is the **global catalog** (`project_po_id IS NULL`) — the same list Timesheet Options shows.
- Show an error; do not create a second row. Import skips duplicates and reports how many were skipped.

### Timesheet Report wizard only (Budget Status wizard unchanged)

- Week list (newest first): **2 weeks after the previous week ending**, then back a full year. Do **not** change `getWeekEndingSundayOptions` (timesheet entry / Data View stay as they are). Use `getTimesheetReportWeekEndingOptions`.
- After week-ending(s): **Clients** (all or multiple) and **Employees** (all or multiple) on the same step. Empty = All. Picking clients **narrows** employees to people assigned to those clients (`user_sites` plus active bill-rate sites).
- Optional report name is step 3.
- Generate still allowed with All/All.

### Generated timesheet report (before save / print / export)

- Filter dropdowns are **multi-select**: Employees, Status, Type (empty = All). Reuse `MultiSelectDropdown`.
- Column **Submitted for Approval** (`submitted_at`) between Created and Final Approval. Older saved snapshots without the field show —.
- **Export CSV** of the currently filtered/sorted rows.

### Outstanding Invoices and PO Status

- Every filter dropdown is multi-select (empty = All).
- PO list follows selected clients.
- PO Status Active / Include deactivated radios stay as-is (not a dropdown). Client/PO filter client-side; only deactivated toggle refetches.

## Files

1. `lib/utils.ts` — add `getTimesheetReportWeekEndingOptions` (do not change `getWeekEndingSundayOptions`).
2. `lib/generated-report.ts` — `TimesheetReportRow.submittedAt?`.
3. `lib/timesheet-report-employees.ts` — `siteIds` on employees; load from `user_sites` + active `po_bill_rates` → PO `site_id`.
4. `app/api/reports/generate-timesheet/options/route.ts` — **new** GET: `{ clients, employees }`.
5. `app/api/reports/generate-timesheet/route.ts` — `clientIds` / `employeeIds`; select `submitted_at`.
6. `components/admin/HierarchicalItemManager.tsx` — duplicate check on add, update, CSV import.
7. `components/reports/GenerateReportPanel.tsx` — timesheet wizard weeks + clients/employees.
8. `components/reports/TimesheetReportView.tsx` — multi-select filters, submitted column, CSV.
9. `components/reports/OutstandingInvoicesReport.tsx` — multi-select Year / Client / PO / Duration.
10. `components/reports/POStatusReport.tsx` — multi-select Client / PO.
11. `components/admin/MultiSelectDropdown.tsx` — reuse as-is unless EquippedBiz is missing it.

## Manual checks

1. Timesheet Options: add System `Execution` twice on the same client → second is blocked (try `EXECUTION` too). Different client can still use the name.
2. Rename/import cannot create a case-insensitive duplicate.
3. Generate Timesheet Report: week list starts two Sundays after last week ending; Budget Status wizard unchanged.
4. Pick a client → employee list shrinks; All clients restores everyone.
5. After generate: select two statuses and two employees; table and CSV match; Submitted for Approval populated for submitted sheets.
6. Outstanding Invoices / PO Status: pick multiple clients and POs; PO options follow clients.
