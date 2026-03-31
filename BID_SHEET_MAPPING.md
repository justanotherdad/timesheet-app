# Bid Sheet & Project Budget Module – Existing Schema Mapping

**Purpose:** Align on existing database tables and columns before implementing the Bid Sheet & Project Budget module. This document is the output of Phase 1 (Context Discovery) and Step 1 of the Technical Specification.

---

## Phase 1: Context Discovery Summary

### 1. Roles: How Admins, Managers, and Supervisors Are Identified

| Role | Source | Notes |
|------|--------|-------|
| **Super Admin** | `user_profiles.role` = `'super_admin'` | Full system access |
| **Admin** | `user_profiles.role` = `'admin'` | Full access except Super Admins |
| **Manager** | `user_profiles.role` = `'manager'` | Scoped to reports + assigned sites |
| **Supervisor** | `user_profiles.role` = `'supervisor'` | View-only for reports and assigned sites |
| **Employee** | `user_profiles.role` = `'employee'` | Own timesheets only |

**Relevant tables:**
- `user_profiles` – `id`, `name`, `email`, `role`, `reports_to_id`, `supervisor_id`, `manager_id`, `final_approver_id`, `employee_type` (internal/external)
- `user_sites` – `user_id`, `site_id` (sites assigned to user; used for org/bid-sheet scope and similar — **not** the driver for which POs appear on weekly timesheets; those come from `po_bill_rates` / Bill Rates by Person on each PO budget)
- `user_departments` – `user_id`, `department_id` (same: retained for other features, not timesheet PO picklists from Manage Users)
- `user_purchase_orders` – `user_id`, `purchase_order_id` (same)
- `po_budget_access` – `user_id`, `purchase_order_id` (explicit budget access for non-admins)

**Access logic:** `lib/access.ts` – `getAccessibleSiteIds()`, `getSubordinateUserIds()`, `canAccessPoBudget()`

---

### 2. Budgets: Current Table/Object Structure

#### Purchase Orders (POs) – Main Budget Entity

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `purchase_orders` | `id`, `site_id`, `department_id`, `po_number`, `description`, `project_name`, `original_po_amount`, `po_issue_date`, `po_balance`, `proposal_number`, `budget_type` ('basic' \| 'project'), `prior_hours_billed`, `prior_hours_billed_rate`, `prior_amount_spent`, `prior_period_notes`, `client_contact_name`, `net_terms`, `how_to_bill`, `weekly_burn`, `target_end_date` | `budget_type` already distinguishes Basic vs Project |

#### Budget-Related Tables

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `po_change_orders` | `id`, `po_id`, `co_number`, `co_date`, `amount` | Change orders to PO amount |
| `po_invoices` | `id`, `po_id`, `invoice_date`, `invoice_number`, `period`, `payment_received`, `amount`, `notes` | Invoice history |
| `po_bill_rates` | `id`, `po_id`, `user_id`, `rate`, `effective_from_date` | **PO-specific** bill rates per employee |
| `po_expenses` | `id`, `po_id`, `expense_type_id`, `custom_type_name`, `amount`, `expense_date`, `notes`, `created_by` | Additional expenses |
| `po_expense_types` | `id`, `name` | Predefined expense types (Travel, Equipment, etc.) – **global**, not per-site |
| `po_attachments` | `id`, `po_id`, `file_name`, `storage_path`, `file_type` | PO/proposal attachments |
| `po_budget_access` | `user_id`, `purchase_order_id` | Grants budget access to non-admins |

#### Employee Hour Tracking (Actual Hours)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `weekly_timesheets` | `id`, `user_id`, `week_ending`, `week_starting`, `status` (draft/submitted/approved/rejected), `submitted_at`, `approved_by_id`, `approved_at`, etc. | One per user per week |
| `timesheet_entries` | `id`, `timesheet_id`, `client_project_id` (site), `po_id`, `task_description`, `system_id`, `system_name` (custom), `deliverable_id`, `activity_id`, `mon_hours`–`sun_hours` | Billable entries; hours stored per day |
| `timesheet_unbillable` | `id`, `timesheet_id`, `description` (HOLIDAY/INTERNAL/PTO), `mon_hours`–`sun_hours` | Unbillable time |

**Budget summary view:** `BasicBudgetView` aggregates `timesheet_entries` by `po_id` → employee × week matrix. Hours come from approved timesheets; cost = hours × `po_bill_rates.rate` (effective date).

---

### 3. Timesheets: System, Deliverable, Activity Dropdowns

#### Master Tables (Site-Scoped)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `systems` | `id`, `site_id`, `name`, `code`, `description` | Optional `department_id`, `po_id` via junction |
| `deliverables` | `id`, `site_id`, `name`, `code`, `description` | Same pattern |
| `activities` | `id`, `site_id`, `name`, `code`, `description` | Same pattern |

#### Junction Tables (PO/Department Filtering)

| Junction Table | Columns | Purpose |
|----------------|---------|---------|
| `system_departments` | `system_id`, `department_id` | Systems assigned to departments |
| `system_purchase_orders` | `system_id`, `purchase_order_id` | Systems assigned to POs |
| `deliverable_departments` | `deliverable_id`, `department_id` | Deliverables by department |
| `deliverable_purchase_orders` | `deliverable_id`, `purchase_order_id` | Deliverables by PO |
| `activity_departments` | `activity_id`, `department_id` | Activities by department |
| `activity_purchase_orders` | `activity_id`, `purchase_order_id` | Activities by PO |

**Dropdown logic:** `WeeklyTimesheetForm` filters Systems/Deliverables/Activities by:
1. Site (`client_project_id`)
2. PO (`po_id`) – via `*_purchase_orders` and `*_departments` (fallback when no PO assignments)

**System custom value:** `timesheet_entries.system_name` stores free-text when `system_id` is null (SystemInput allows "Select or type").

---

### 4. Labor/Rates: Bill Rates and PO-Specific Rates

| Table | Columns | Notes |
|-------|---------|-------|
| `po_bill_rates` | `po_id`, `user_id`, `rate`, `effective_from_date` | **Per-PO, per-employee** rates; multiple rows per user for rate history |
| `user_profiles` | `id`, `name`, `email`, `employee_type` | Employees; bill rates reference `user_id` |

**Current behavior:**
- Each PO has its own bill rates (`po_bill_rates`).
- Cost = `hours × rate` where rate is the one in effect for that week (`effective_from_date`).
- Managers/Admins can add bill rates for any user with a profile (not limited to those who have logged time).

**Override requirement (spec):** Bid sheet must support external/internal employees not yet in the system and independent bid-sheet rates. This implies new structures (see Phase 2 notes below).

---

## Summary: Tables by Domain

### Budgets
- `purchase_orders`, `po_change_orders`, `po_invoices`, `po_bill_rates`, `po_expenses`, `po_expense_types`, `po_attachments`, `po_budget_access`

### Employees / Users
- `user_profiles`, `user_sites`, `user_departments`, `user_purchase_orders`

### Timesheets & Hours
- `weekly_timesheets`, `timesheet_entries`, `timesheet_unbillable`, `timesheet_signatures`

### System / Deliverable / Activity
- `systems`, `deliverables`, `activities`
- `system_departments`, `system_purchase_orders`
- `deliverable_departments`, `deliverable_purchase_orders`
- `activity_departments`, `activity_purchase_orders`

### Organization
- `sites`, `departments` (linked to `site_id`)

---

## Naming Conventions Observed

- **Tables:** `snake_case` (e.g. `purchase_orders`, `timesheet_entries`)
- **Columns:** `snake_case` (e.g. `client_project_id`, `effective_from_date`)
- **TypeScript:** `camelCase` for object properties in components
- **Foreign keys:** `{table_singular}_id` (e.g. `po_id`, `user_id`, `system_id`)

---

## Gaps / New Structures Likely Needed (Phase 2)

Based on the spec, these areas will likely need **new** tables or columns:

1. **Bid Sheets** – New entity (e.g. `bid_sheets` table) with Import CSV and Clone.
2. **Bid Sheet Matrix** – Rows = Systems, Columns = Deliverables, Activities toggled per cell. Likely needs `bid_sheet_cells` or similar.
3. **External/Override Labor** – Employees not in `user_profiles` and rates independent of `po_bill_rates`. New table(s) for bid-sheet-specific labor/rates.
4. **Indirect Costs** – Project Management, Document Coordinator, Project Controls, T&L. `po_expense_types` exists; may need mapping or new categories.
5. **Project Details (granular breakdown)** – For `budget_type = 'project'`, a linked breakdown by System/Deliverable/Activity. No equivalent exists today; `timesheet_entries` has the fields but no pre-defined "project plan" structure.
6. **Timesheet validation for Project POs** – When PO is Project, filter System/Deliverable/Activity to only those in Project Details. Requires storing that mapping (e.g. `project_details` or `po_system_deliverable_activities`).

---

## Questions for Alignment

1. **Bid Sheet access:** Use `user_sites` / `user_departments` / `user_purchase_orders` for "assigned sheets," or introduce `bid_sheet_access` (or similar)? The spec says "do not create a new permissions table if the current one can handle record-level access."
2. **Project Details vs Basic:** Should `project_details` (or equivalent) be a separate table linked to `purchase_orders` when `budget_type = 'project'`, or an extension of the existing PO structure?
3. **System Numbers:** Spec mentions "option for associated System Numbers." Is this `systems.code` or a new field?
4. **Indirect cost categories:** Should Project Management, Document Coordinator, Project Controls, T&L be new `po_expense_types`, or a separate structure (e.g. `po_indirect_costs` with a category enum)?

---

## Phase 2: New Tables (Migration 20260224)

### bid_sheets
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| site_id | UUID | FK → sites |
| name | TEXT | Required |
| description | TEXT | Optional |
| status | TEXT | 'draft' \| 'converted' |
| converted_po_id | UUID | FK → purchase_orders; set when converted |
| created_by | UUID | FK → user_profiles |
| created_at, updated_at | TIMESTAMPTZ | |

### bid_sheet_access
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| bid_sheet_id | UUID | FK → bid_sheets |
| user_id | UUID | FK → user_profiles |
| created_at | TIMESTAMPTZ | |
| UNIQUE(bid_sheet_id, user_id) | | |

### bid_sheet_items (Matrix Cells)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| bid_sheet_id | UUID | FK → bid_sheets |
| system_id | UUID | FK → systems |
| deliverable_id | UUID | FK → deliverables |
| activity_id | UUID | FK → activities |
| budgeted_hours | NUMERIC(10,2) | ≥ 0 |
| created_at, updated_at | TIMESTAMPTZ | |
| UNIQUE(bid_sheet_id, system_id, deliverable_id, activity_id) | | |

### bid_sheet_labor
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| bid_sheet_id | UUID | FK → bid_sheets |
| user_id | UUID | FK → user_profiles (optional) |
| placeholder_name | TEXT | For external/new people when user_id is null |
| bid_rate | NUMERIC(10,2) | Independent of po_bill_rates |
| notes | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |
| CHECK: (user_id IS NOT NULL) OR (placeholder_name IS NOT NULL AND trim != '') | | |

### bid_sheet_indirect_labor
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| bid_sheet_id | UUID | FK → bid_sheets |
| category | TEXT | 'project_management' \| 'document_coordinator' \| 'project_controls' |
| hours | NUMERIC(10,2) | ≥ 0 |
| rate | NUMERIC(10,2) | ≥ 0 |
| notes | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |
| UNIQUE(bid_sheet_id, category) | | |

*T&L uses po_expenses when converted to PO.*

### project_details
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| po_id | UUID | FK → purchase_orders |
| system_id | UUID | FK → systems |
| deliverable_id | UUID | FK → deliverables |
| activity_id | UUID | FK → activities |
| budgeted_hours | NUMERIC(10,2) | ≥ 0 |
| created_at, updated_at | TIMESTAMPTZ | |
| UNIQUE(po_id, system_id, deliverable_id, activity_id) | | |

*Populated when converting bid sheet → Project PO. Used for timesheet dropdown filtering.*

---

*Generated from repository scan. Phase 2 schema added after alignment.*
