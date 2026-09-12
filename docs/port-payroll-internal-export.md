# Port notes: Payroll menu, Internal earning-type export, week list paging

Copy this change set into EquippedBiz. Menu: EquippedBiz already has a Payroll hamburger link; keep it visible for admin/super_admin (alphabetical: after Pending Approvals, before Site Guide).

## Behavior to preserve

### Menu

- Admin and Super Admin see **Payroll** (`/dashboard/admin/payroll`) in the hamburger menu.
- Alphabetical with the other items (Pending Approvals → Payroll → Site Guide).

### Export classification

- INTERNAL timesheet rows whose **Description** matches an earning type with **Where = Internal** export as that DETCODE (Bereavement → BRVMT, Jury Duty → JURY). They are **not** folded into Regular Hours.
- INTERNAL hours with a blank or unmatched description still count as Regular Hours (REG), and still feed the “up to 40 / over 40” Regular vs Incentive split.
- PTO rows still map by Description (Where = PTO when set); unmatched PTO still defaults to Paid Time Off.
- Holiday rows unchanged.

### Payroll week list

- List every week that has at least one **approved internal** timesheet, newest first.
- Page past PostgREST’s ~1000-row cap so recent weeks (e.g. Sep 6) are not dropped. Same paging/chunking on the week export/detail queries.

### Manage Organization → Payroll

- Show the field guide (`PAYROLL_FIELD_HELP`) under the tab intro so Area / Dropdown / Where / Overtime / Rule / Looks at are explained.

## Files

1. `components/Header.tsx` — `canManagePayroll`; Payroll link (skip if EquippedBiz already has it in the right place).
2. `components/GuideModal.tsx` — Payroll under Managers and Admins.
3. `lib/payroll.ts` — `findEarningByDescription`; INTERNAL mapping in `allocatePayrollRows`; `fetchAllPages` / `fetchInIdChunks` in `listPayrollWeeks` and `aggregatePayrollForWeeks`; `PAYROLL_FIELD_HELP`.
4. `components/admin/PayrollEarningTypesManager.tsx` — render the field guide.

## Manual checks

1. Super Admin hamburger: Payroll appears between Pending Approvals and Site Guide; opens the week list.
2. Chad-style sheet: INTERNAL / Bereavement 24 + PTO 16 → export BRVMT 24 and PTO 16, not REG 24.
3. INTERNAL with no description still exports as REG.
4. Payroll by Week Ending includes the latest week that has approved internal timesheets (not stuck on an older cap).
5. Manage Organization → Payroll shows the field explanations.
