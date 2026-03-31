# Access Levels

This document describes what each role can see and do: screens, data scope, and approval workflow as implemented.

---

## Roles (highest to lowest)

- **Super Admin** – full system access
- **Admin** – full access except cannot create/edit Super Admins
- **Manager** – scoped to their organization and direct/indirect reports; can update users and org/systems/activities/deliverables for their team and assigned sites
- **Supervisor** – view-only access to users reporting to them and to sites they are assigned to (Organization, Systems, Activities, Deliverables)
- **Employee** – own timesheets and profile only

---

## Dashboard & Navigation

| Area                     | Employee      | Supervisor        | Manager         | Admin     | Super Admin |
| ------------------------ | ------------- | ----------------- | --------------- | --------- | ----------- |
| **Dashboard (home)**     | ✓             | ✓                 | ✓               | ✓         | ✓           |
| New Timesheet            | ✓             | ✓                 | ✓               | ✓         | ✓           |
| My Timesheets            | ✓ (own only)  | ✓ (own only)      | ✓ (own only)      | ✓ (all) | ✓ (all)     |
| Pending Approvals card   | —             | ✓                 | ✓               | ✓         | ✓           |
| Approved Timesheets card | —             | ✓                 | ✓               | ✓         | ✓           |
| Manage Users card        | —             | ✓ (view only)     | ✓               | ✓         | ✓           |
| Manage Organization      | —             | ✓ (view only)     | ✓               | ✓         | ✓           |
| Manage Systems           | —             | ✓ (view only)     | ✓               | ✓         | ✓           |
| Manage Activities        | —             | ✓ (view only)     | ✓               | ✓         | ✓           |
| Manage Deliverables      | —             | ✓ (view only)     | ✓               | ✓         | ✓           |
| View Timesheet Data      | —             | —                 | ✓               | ✓         | ✓           |
| Export Timesheets        | —             | —                 | ✓               | ✓         | ✓           |
| Budget Detail            | —             | ✓ (if granted)    | ✓ (if granted)  | ✓ (all)   | ✓ (all)     |

- **Employee:** No “Manage” or admin cards.
- **Supervisor:** Sees Manage Users, My Timesheets (own only), Pending Approvals, Approved Timesheets, and Organization/Systems/Activities/Deliverables; all except Pending Approvals are **view-only**. Sees others’ timesheets via **Pending Approvals** and **Approved Timesheets** (not on My Timesheets). Does not see View Timesheet Data or Export.
- **Manager / Admin / Super Admin:** Full access to the cards they see; Manager is scoped to their team and assigned sites (see below).
- **Budget Detail:** Only Admin and Super Admin see all POs automatically. Managers, Supervisors, and Employees see only POs where an Admin has explicitly granted them budget access (see [Budget Detail](#budget-detail) below).

---

## Timesheets

### Who sees which timesheets

- **Employee, Supervisor, Manager:** Only their **own** timesheets on **My Timesheets**. To review or approve others’ timesheets, use **Pending Approvals** and **Approved Timesheets** (and open detail from there).
- **Admin / Super Admin:** All timesheets on **My Timesheets**, with filters (person, week, status).

### Create / Edit / Delete

- **New timesheet:** Any logged-in user (own only).
- **Edit timesheet:** Owner when status is draft or rejected; Admin/Super Admin can edit any.
- **Delete timesheet:** Owner when draft; Admin/Super Admin can delete any status.
- **Export (PDF):** Timesheet owner or Admin/Super Admin from the detail page. Supervisors and managers open a report’s timesheet from **Pending Approvals** or **Approved Timesheets**, then export from the detail page.

### Approval workflow (submitted timesheets)

- **Chain:** Employee → Supervisor → Manager → Final Approver. Built from `user_profiles` (supervisor_id, manager_id, final_approver_id). If a field is “None,” the next person in the structure is used.
- **Who can approve:** Next person in chain who hasn’t signed; Admin/Super Admin can always approve (treated as final).
- **Who can reject:** Same as approve; reject requires a note (reject-form page).
- **Clear rejection note:** Admin/Super Admin only (before employee resubmits).

---

## Manage Users

### Who can open the page

Supervisor, Manager, Admin, Super Admin. (Employees have no access.)

### Who appears in the list

- **Supervisor:** Only **employees** who report to them (`reports_to_id` / `supervisor_id` / `manager_id` = current user). View-only; no add or edit.
- **Manager:** Only **employees and supervisors** who report to them (same “reports to” check).
- **Admin:** All users with role **Admin or lower** (no Super Admins).
- **Super Admin:** All users.

### Add user

- **Supervisor:** Cannot add users (view-only).
- **Manager:** Employee, Supervisor, or Manager; must report to current user.
- **Admin:** Employee, Supervisor, Manager, or Admin (not Super Admin).
- **Super Admin:** Any role.

### Edit user

- **Supervisor:** View only. Can open a user to see name, email, role, Supervisor, and site/department/PO assignments; no Save, no password link, no delete.
- **Single Supervisor field:** The edit form has one Supervisor dropdown (reports_to_id); supervisor_id is synced to the same value for the approval chain.
- **Manager:** Full edit for users they see; can set role only to Manager, Supervisor, or Employee.
- **Admin:** Full edit for non–Super Admins; can set any role except Super Admin.
- **Super Admin:** Full edit and any role.

### Delete user

Admin and Super Admin only (and not self).

### Password reset link

- **Manager:** Only for users who report to them.
- **Admin / Super Admin:** Any user.

---

## Organization (Sites, Departments, Purchase Orders)

- **Supervisor:** Can open the page; sees only **sites assigned to them** (via `user_sites`). **View only** – no add, edit, or delete for sites, departments, or POs. Page title: “View Organization.”
- **Manager:** Sees only **sites assigned to them or their subordinates** (`user_sites` for current user + users who report to them). Full add/edit/delete for those sites and their departments and POs.
- **Admin / Super Admin:** See and manage all sites, departments, and POs.

---

## Systems, Activities, Deliverables

- **Supervisor:** Can open Systems, Activities, and Deliverables; sees only **sites they are assigned to** (via `user_sites`). **View only** – no add, edit, delete, CSV import, or bulk actions. Page titles: “View Systems,” “View Activities,” “View Deliverables.”
- **Manager:** Sees only **sites they or their subordinates are assigned to** (same `user_sites`-based logic as Organization). Full add/edit/delete/import for systems, activities, or deliverables under those sites.
- **Admin / Super Admin:** See and manage all systems, activities, and deliverables (all sites).

---

## Budget Detail

PO budgets show Client & PO Information, Budget Summary, invoices, billable hours/cost, expenses, and bill rates.

### Who can access

- **Admin / Super Admin:** All POs (full access to view, edit, and grant budget access).
- **Manager / Supervisor / Employee:** Only POs where an **Admin or Super Admin** has granted them explicit access via the **Budget Access** section on each PO budget. No automatic access based on role or site. When granted access, they see the **full view** (all employee timesheets, hours, expenses, invoices, etc.).

### Budget Access (Admin only)

On each PO budget, Admins and Super Admins see a **Budget Access** container. They can:
- **Grant access:** Add any user with a profile to view that PO's budget.
- **Revoke access:** Remove a user from the access list.

Users granted access see the **full view:** Client & PO Information, Budget Summary, Invoice History, Billable Activities (all employees' hours), Billable Cost, Budget Balance, Additional Expenses, and Bill Rates.

### Client & PO Information

Each PO can have a **Client Contact Name** (stored per PO, shown below Client / Site). Admins and Managers can edit this along with PO#, Department, Project, etc.

### Billable Activities & Cost

- **Billable Activities:** Hours from approved timesheets, by employee and week. Hours are shown to the hundredths place (e.g. 40.00).
- **Billable Cost:** Same layout as hours, but shows cost ($) = hours × bill rate per employee/week.

### Budget Balance (labor total)

- **Budget Balance** is computed from total labor (rates × hours) for **all** approved timesheet hours on the PO. Users with **budget access** (including grantees who are not admins) must see the **same** totals as admins; the balance API aggregates timesheets with the service role so row-level security does not hide other employees’ hours from the calculation.

### Bill Rates

Managers and Admins can add **bill rates** for any user with a profile—not only those who have already logged time to the PO. Rates have an effective date; historical cost uses the rate in effect at that time.

---

## View Timesheet Data & Export

- **View Timesheet Data:** Manager, Admin, Super Admin only. No per-role scoping; shows all data.
- **Export Timesheets:** Manager, Admin, Super Admin only.

---

## Summary: Implemented access

1. **Supervisor**
   - **Manage Users:** View only – list of employees reporting to them; click to see read-only user details. No add, edit, password link, or delete.
   - **Organization, Systems, Activities, Deliverables:** View only – sites assigned to them via `user_sites`; no add/edit/delete/import.
   - **Pending Approvals:** Full (approve/reject as in chain).
   - **My Timesheets:** Own timesheets only. **Approved Timesheets:** Can see approved timesheets for their reports (filter/list).
   - No access to View Timesheet Data or Export.

2. **Manager**
   - **My Timesheets:** Own timesheets only. **Pending Approvals** and **Approved Timesheets** list reports’ timesheets for approval and review.
   - **Users:** Add/edit only users reporting to them (directly or through a supervisor); role limited to Manager, Supervisor, or Employee; can send password reset to their reports.
   - **Organization:** Add/edit/delete only sites (and their departments/POs) assigned to them or their subordinates.
   - **Systems / Activities / Deliverables:** Add/edit/delete/import only for sites they or their subordinates have access to.
   - **Data View & Export:** Full access (no scoping).

3. **Admin / Super Admin**
   - **Admin:** Full access except cannot create or edit Super Admin users.
   - **Super Admin:** Full access including Super Admin users.

4. **Employee**
   - No access to Manage Users, Organization, Systems, Activities, Deliverables, Data View, or Export. Only own timesheets and profile.
   - **Budget Detail:** Can access only POs where an admin has granted them explicit budget access. When granted, they see the full view (all timesheets, hours, expenses, invoices, etc.).

---

## Implementation notes

- **Sites “assigned to” a user:** Stored in `user_sites` (user_id, site_id). Used for both supervisors and managers.
- **Accessible sites:** `lib/access.ts` – `getAccessibleSiteIds(supabase, userId, role)` returns site IDs the user can access: null = all (admin/super_admin), else sites from `user_sites` for the current user (supervisor) or current user + subordinates (manager). `getSubordinateUserIds(supabase, managerId)` returns user IDs that report to the manager.
- **Manager subordinates:** Users with `reports_to_id`, `supervisor_id`, `manager_id`, or `final_approver_id` equal to the manager’s id. `getSubordinateUserIds` includes all four.
- **My Timesheets (non-admin):** Lists only `weekly_timesheets` for the logged-in user (standard client + RLS). **Pending Approvals / Approved Timesheets** use `createAdminClient()` where needed so approvers can read subordinates’ timesheets. **Budget Balance API** (`GET /api/budget/[poId]/balance`): labor cost uses `createAdminClient()` for `timesheet_entries` / `weekly_timesheets` so totals match **Billable Hours** for grantees (RLS alone would undercount labor and skew Budget Balance).
- **Timesheet dropdowns:** On New/Edit timesheet, Activity, Deliverable, and System options are filtered to sites assigned to the user (`user_sites`); admins see all.
- **Purchase Orders:** Cascading from profile: Site → Departments (all at site if blank) → POs. If no POs explicitly assigned, employee sees all POs at their sites (filtered by department if departments are assigned). If POs are assigned, only those show.
- **Read-only UI:** Organization uses `ConsolidatedManager` with `readOnly={true}` for supervisors; Systems/Activities/Deliverables use `HierarchicalItemManager` with `readOnly={true}` (hides Add, Import, Edit, Delete, bulk actions).
- **Server actions:** create-user, update-user-assignments, and generate-password-link allow only Manager, Admin, Super Admin (not Supervisor).
- **Budget access:** `po_budget_access` table stores explicit grants (user_id, purchase_order_id). Only Admin/Super Admin have automatic access to all POs. Managers, Supervisors, and Employees must be explicitly granted per PO via the Budget Access section.
