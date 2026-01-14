# Multiple Departments and Purchase Orders for Systems, Activities, and Deliverables

## Overview

Systems, Activities, and Deliverables can now be assigned to **multiple departments** and **multiple purchase orders** using checkboxes instead of single dropdown selections.

## Database Migration Required

**IMPORTANT:** Before using this feature, you must run the database migration to create the junction tables.

### Step 1: Run SQL Migration

1. Go to Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the entire contents of `supabase/add_systems_activities_deliverables_junction_tables.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)

### What the Migration Does

The migration creates 6 junction tables:
- `system_departments` - Links systems to departments
- `system_purchase_orders` - Links systems to purchase orders
- `activity_departments` - Links activities to departments
- `activity_purchase_orders` - Links activities to purchase orders
- `deliverable_departments` - Links deliverables to departments
- `deliverable_purchase_orders` - Links deliverables to purchase orders

The migration also:
- Migrates existing data from single `department_id`/`po_id` columns to junction tables
- Creates indexes for better query performance
- Sets up proper foreign key constraints

## How to Use

### Adding a New System/Activity/Deliverable

1. Select a **Site** (required)
2. Click **"Add [System/Activity/Deliverable]"** button
3. Enter the **Name**
4. **Check multiple departments** from the checkbox list
5. **Check multiple purchase orders** from the checkbox list
6. Click **"Add"**

### Editing an Existing Item

1. Click the **Edit** button (pencil icon) next to the item
2. The popup will show:
   - Name field (editable)
   - **Checkboxes for all departments** (pre-checked for currently assigned)
   - **Checkboxes for all purchase orders** (pre-checked for currently assigned)
3. Check/uncheck departments and POs as needed
4. Click **"Save"**

### Viewing Assignments

The table now shows:
- **Department column**: Lists all assigned departments (comma-separated) or "N/A"
- **PO column**: Lists all assigned purchase orders (comma-separated) or "N/A"

## Technical Details

### Junction Tables Structure

Each junction table has:
- `id` (UUID, primary key)
- `[item]_id` (UUID, foreign key to systems/activities/deliverables)
- `department_id` or `purchase_order_id` (UUID, foreign key)
- `created_at` (timestamp)
- Unique constraint on `([item]_id, department_id)` or `([item]_id, purchase_order_id)`

### Component Changes

- `HierarchicalItemManager.tsx` now uses:
  - `selectedDepartments` (array) instead of `selectedDepartment` (string)
  - `selectedPOs` (array) instead of `selectedPO` (string)
  - Checkbox lists instead of single-select dropdowns
  - Junction table inserts/deletes when saving

## Notes

- The old `department_id` and `po_id` columns in the main tables are still present but no longer used
- You can optionally remove those columns later if desired
- CSV import now uses the selected departments/POs from checkboxes (if any are selected when importing)
