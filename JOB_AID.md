# CTG Timesheet Site – Job Aid  
## How to Use the Site (Employees Through Admins)

This job aid explains how to use the CTG Timesheet Management site for all roles: **Employee**, **Supervisor**, **Manager**, **Admin**, and **Super Admin**.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Timesheets](#3-timesheets)
4. [Approvals (Supervisors, Managers, Admins)](#4-approvals-supervisors-managers-admins)
5. [Manage Users](#5-manage-users)
6. [Organization, Systems, Activities, Deliverables](#6-organization-systems-activities-deliverables)
7. [View Timesheet Data & Export](#7-view-timesheet-data--export)
8. [Quick Reference by Role](#8-quick-reference-by-role)

---

## 1. Getting Started

### Logging in

1. Go to the site URL (e.g. **ctgtimesheet.com**).
2. Enter your **email** and **password**.
3. Click **Sign In**.
4. You are taken to the **Dashboard**.

### First-time login (invitation link)

If an admin or manager sent you an **invitation link** (e.g. to set your password):

1. Click the link they sent (by email, Teams, etc.).
2. If you are taken to an **Invite** or **Set up password** page, create a password and confirm it.
3. After setting your password, you will be signed in and can use the site as usual.

### Changing your password

- From the Dashboard, use the **header menu** (your name or profile) to open **Change Password** if that option is available, or ask an admin how to change it.

### Logging out

- Use the **header menu** and choose **Log out** (or the equivalent link).

---

## 2. Dashboard Overview

After login, you see the **Timesheet Dashboard**. The cards and links you see depend on your **role**.

### Everyone sees

- **New Timesheet** – Start a new timesheet for the current week.
- **My Timesheets** – List of your timesheets (and, for supervisors/managers, timesheets of people who report to you).
- **Current Week** – Quick view of this week’s timesheet (if one exists) with a link to view or create.

### Supervisors, Managers, Admins, and Super Admins also see

- **Manage Users** – Open the user management page (supervisors: view only; managers and above: add/edit as allowed).
- **Pending Approvals** – Timesheets waiting for your approval (with count).
- **Manage Organization** – Sites, departments, purchase orders (supervisors: view only).
- **Manage Systems** – System options for timesheet rows (supervisors: view only).
- **Manage Activities** – Activity options (supervisors: view only).
- **Manage Deliverables** – Deliverable options (supervisors: view only).

### Managers, Admins, and Super Admins also see

- **View Timesheet Data** – View and filter all timesheet entries.
- **Export Timesheets** – Export timesheets for any week.

**Employees** see only **New Timesheet**, **My Timesheets**, and the **Current Week** section.

---

## 3. Timesheets

### 3.1 Creating a new timesheet

1. From the Dashboard, click **New Timesheet** (or **Create one** under Current Week).
2. You are on **New Weekly Timesheet** for the current week.
3. Optionally use **Copy Previous Week** to bring in rows from last week (see below).
4. Add **billable** rows: Site/Client, PO, Task description, System/Deliverable/Activity as needed, and hours per day (Mon–Sun).
5. Add or adjust **unbillable** rows (Holiday, Internal, PTO) if applicable.
6. Click **Save as Draft** to save and continue later, or **Submit** when the week is complete.

### 3.2 Copy Previous Week (import from last week)

- On **New Timesheet** or **Edit Timesheet**, if you had a timesheet the **previous week** with entries, a green **Copy Previous Week** button appears next to the week selector.
1. Click **Copy Previous Week**.
2. Read the modal message (it copies all billable and unbillable entries from the previous week).
3. Click **Copy Data**.
4. Rows are added to the current timesheet; you can edit or delete any of them and then save or submit.

### 3.3 Editing a timesheet

- You can edit your timesheet when it is **Draft** or **Rejected** (after you get a rejection note).
1. Go to **My Timesheets**.
2. Click the timesheet (or **Edit** if shown).
3. You are on the edit page; change rows, hours, or unbillable as needed.
4. **Save as Draft** or **Submit** when done.
- **Admins/Super Admins** can edit any timesheet; others can only edit their own (when draft or rejected).

### 3.4 Submitting a timesheet

1. On the new or edit timesheet page, fill in all required rows and hours.
2. Click **Submit**.
3. The timesheet moves to **Submitted** and goes to the approval chain (typically Manager → Supervisor → Final Approver, depending on how your profile is set up).

### 3.5 Viewing a timesheet (detail)

1. Go to **My Timesheets** (or **Pending Approvals** for approvers).
2. Click the timesheet or **View** / **View Details**.
3. You see the full timesheet: status, week, all rows, unbillable, and (if submitted/approved) approval/signature info.
4. From here you can use **Edit** (if allowed), **Export PDF**, or **Recall** (if submitted and your org allows it).

### 3.6 Deleting a timesheet

- **Draft** timesheets: The owner can delete (e.g. **Delete** on the timesheet view or edit page).
- **Admins/Super Admins** can delete timesheets in other statuses if the system allows.
- Deletion is permanent; use with care.

### 3.7 Recall (unsubmit) a timesheet

- If your timesheet is **Submitted** and your organization allows it, you may see a **Recall** option to bring it back to **Draft** so you can edit and resubmit. Use this only when you need to change something before approval.

### 3.8 Export PDF

- From the timesheet **detail** page, use **Export PDF** (or **Export**) to download a PDF of that timesheet. Available to the timesheet owner and to Admins/Super Admins.

---

## 4. Approvals (Supervisors, Managers, Admins)

If you are a **Supervisor**, **Manager**, **Admin**, or **Super Admin**, you may have timesheets waiting for your approval.

### 4.1 Seeing pending approvals

- On the **Dashboard**, the **Pending Approvals** card shows how many timesheets are pending.
- Click **Pending Approvals** (or the **Review** link on the dashboard) to open the list.
- You see: employee name, email, week ending, and submitted date.

### 4.2 Approving a timesheet

1. On the **Pending Approvals** page, find the timesheet.
2. Click **Approve** (green button).
3. Your approval is recorded; the timesheet may then go to the next approver in the chain (e.g. Supervisor → Final Approver) or become **Approved** if you are the last approver.

You can also open **View Details** first to review the timesheet, then approve from the list or from the detail page if that option is shown.

### 4.3 Rejecting a timesheet

1. On the **Pending Approvals** page, click **Reject** (red button) for the timesheet.
2. You are taken to the **Reject timesheet** page.
3. Enter a **required note** for the employee (e.g. “Please correct Friday hours for Project X”).
4. Submit the rejection.
5. The timesheet status becomes **Rejected**. The employee sees your note when they open the timesheet and can edit and resubmit.

### 4.4 Clearing a rejection note (Admin/Super Admin only)

- **Admins** and **Super Admins** can clear the rejection note on a rejected timesheet (e.g. so the employee can resubmit without seeing the old note). Use the option on the timesheet detail page if available.

---

## 5. Manage Users

**Who can open it:** Supervisors, Managers, Admins, Super Admins.  
**Who appears in the list:** Depends on your role (see [Quick Reference by Role](#8-quick-reference-by-role)).

### 5.1 Opening Manage Users

- From the Dashboard, click **Manage Users**.

### 5.2 Viewing users (all roles that have access)

- You see a table (or on mobile, cards) with: Name, Email, Role, Sites, Departments, Purchase Orders, Supervisor, Final Approver, and a **View** button.
- Use **Search** (name/email) and **Role** filter to narrow the list.
- Click **View** (or the user name, where applicable) to open that user’s details.

### 5.3 Supervisor: view only

- Supervisors see only **employees** who report to them.
- You can open a user and see: Name, Email, Role, Supervisor, Final Approver, Sites, Departments, Purchase Orders.
- You **cannot** add users, edit users, send password links, or delete users.

### 5.4 Manager: add and edit users

- You see **employees and supervisors** who report to you.
- **Add user:** Click **Add User**, fill in name, email, role (Employee, Supervisor, or Manager), Supervisor, Manager, Final Approver, and site/department/PO assignments. Set **Supervisor** to yourself if they report to you. Save.
- **Edit user:** Open the user with **View**, then use **Edit** (or the edit form). Change name, role, Supervisor, Manager, Final Approver, or assignments as allowed. Save.
- You can **generate a password/invite link** for users who report to you and send it to them (e.g. by email).

### 5.5 Admin / Super Admin: full user management

- **Admin:** Sees all users except Super Admins. Can add and edit users (any role except Super Admin), delete users (except self), and generate password links for any user.
- **Super Admin:** Sees all users including Super Admins. Can add, edit, and delete any user (except self) and set any role, including Super Admin.
- Use **Manage Users** the same way as managers for add/edit/view; delete and password links are available as above.

---

## 6. Organization, Systems, Activities, Deliverables

These areas set up the options that appear on timesheets (sites, departments, POs, systems, activities, deliverables). What you see and whether you can change anything depends on your role.

### 6.1 Manage Organization (Sites, Departments, Purchase Orders)

- **Where:** Dashboard → **Manage Organization**.
- **Supervisors:** View only. You see **sites you are assigned to**; no add/edit/delete. Page may be titled “View Organization.”
- **Managers:** You see sites assigned to you or your reports. You can **add, edit, and delete** sites, and manage **departments** and **purchase orders** for those sites.
- **Admins / Super Admins:** See and manage **all** sites, departments, and purchase orders.

Typical tasks: add a site, add a department to a site, add a purchase order and link it to a department/site.

### 6.2 Manage Systems

- **Where:** Dashboard → **Manage Systems**.
- **Supervisors:** View only (sites you are assigned to). Page may be titled “View Systems.” No add, edit, delete, or import.
- **Managers:** Full add/edit/delete/import for systems at sites you or your reports can access.
- **Admins / Super Admins:** Full access for all sites.

Use this to define the **System** (and optional custom system name) options that appear when entering timesheet rows.

### 6.3 Manage Activities

- **Where:** Dashboard → **Manage Activities**.
- **Supervisors:** View only (sites you are assigned to). Page may be titled “View Activities.”
- **Managers:** Full add/edit/delete/import for activities at sites you or your reports can access.
- **Admins / Super Admins:** Full access for all sites.

Use this to define **Activity** options for timesheet rows.

### 6.4 Manage Deliverables

- **Where:** Dashboard → **Manage Deliverables**.
- **Supervisors:** View only (sites you are assigned to). Page may be titled “View Deliverables.”
- **Managers:** Full add/edit/delete/import for deliverables at sites you or your reports can access.
- **Admins / Super Admins:** Full access for all sites.

Use this to define **Deliverable** options for timesheet rows.

### 6.5 Departments and Purchase Orders (stand-alone admin pages)

- **Departments** and **Purchase Orders** may also have their own admin pages under the dashboard (e.g. **Manage Organization** or separate **Departments** / **Purchase Orders** links). Use them to maintain department and PO lists and their links to sites; access follows the same role rules as Organization.

---

## 7. View Timesheet Data & Export

Available only to **Managers**, **Admins**, and **Super Admins**. Employees and Supervisors do not see these.

### 7.1 View Timesheet Data

- **Where:** Dashboard → **View Timesheet Data**.
- Use this to **view and filter** all timesheet entries (e.g. by week, user, site, PO). Useful for checking what was entered across the organization. No role-based filtering; managers and admins see the full dataset they have access to.

### 7.2 Export Timesheets

- **Where:** Dashboard → **Export Timesheets**.
- Use this to **export** timesheet data for a chosen week (or range). Export format and options depend on what is implemented (e.g. Excel/CSV). Use for payroll, billing, or reporting.

---

## 8. Quick Reference by Role

| Feature | Employee | Supervisor | Manager | Admin | Super Admin |
|--------|----------|------------|---------|-------|-------------|
| **Dashboard** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **New Timesheet** | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) |
| **My Timesheets** | Own only | Own + reports | Own + reports | All | All |
| **Copy Previous Week** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Edit/Delete own (draft)** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Edit any timesheet** | — | — | — | ✓ | ✓ |
| **Pending Approvals** | — | ✓ | ✓ | ✓ | ✓ |
| **Approve / Reject** | — | ✓ (in chain) | ✓ (in chain) | ✓ | ✓ |
| **Manage Users** | — | View only (employees) | Add/Edit (reports) | Full (no Super Admin) | Full |
| **Delete user** | — | — | — | ✓ | ✓ |
| **Password/invite link** | — | — | Reports only | Any | Any |
| **Organization** | — | View only (assigned sites) | Edit (assigned/reports’ sites) | Full | Full |
| **Systems / Activities / Deliverables** | — | View only (assigned sites) | Edit (assigned/reports’ sites) | Full | Full |
| **View Timesheet Data** | — | — | ✓ | ✓ | ✓ |
| **Export Timesheets** | — | — | ✓ | ✓ | ✓ |

---

## Need Help?

- **Login or password:** Contact your manager or an administrator.
- **Missing options or access:** Your role or assignments (sites, reports) may need to be updated in **Manage Users** (admin/manager).
- **Approval chain:** Manager, Supervisor, and Final Approver are set on each user’s profile in **Manage Users**. If a timesheet is not reaching the right person, have an admin or manager check that user’s Supervisor, Manager, and Final Approver.

---

*Last updated to match the current CTG Timesheet Management site (employees through admins).*
