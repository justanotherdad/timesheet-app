# Remaining Features Implementation Guide

This document outlines the remaining features that need to be implemented:

## 1. Multiple Sites, POs, and Departments per User

### Database Migration
✅ **Created:** `supabase/add_user_junction_tables.sql`
- Run this SQL migration in Supabase to create junction tables
- This allows users to have multiple sites, departments, and purchase orders

### Implementation Steps

1. **Update UserManagement Component:**
   - Replace single select dropdowns with multi-select checkboxes
   - Load existing assignments from junction tables
   - Save assignments using `updateUserAssignments` server action

2. **Update create-user.ts:**
   - Accept arrays of site_ids, department_ids, and purchase_order_ids
   - Insert into junction tables instead of single fields

3. **Update User Display:**
   - Show all assigned sites/departments/POs in the table
   - Update edit form to show checkboxes for all options

## 2. Import from Excel for Systems, Activities, and Deliverables

### Implementation Steps

1. **Add Import Button to HierarchicalItemManager:**
   - Add "Import CSV/Excel" button similar to SiteDepartmentManager
   - Parse CSV/Excel files
   - Insert multiple items at once

2. **CSV Format Expected:**
   ```
   Name,Description (for systems only)
   System Name 1,Description 1
   System Name 2,Description 2
   ```

3. **Add to each page:**
   - `/dashboard/admin/systems`
   - `/dashboard/admin/activities`
   - `/dashboard/admin/deliverables`

## 3. Data View Page with Filters

### Implementation Steps

1. **Create new page:** `/dashboard/admin/data-view`

2. **Features:**
   - Filter by:
     - User
     - Site
     - Department
     - Date range (week ending)
     - Status (submitted, approved, pending)
   - Display timesheet entries in a table
   - Export filtered data to CSV/Excel

3. **Add button to admin panel:**
   - "View Timesheet Data" button in admin dashboard

## Next Steps

1. Run the SQL migration: `supabase/add_user_junction_tables.sql`
2. Update UserManagement component for multiple assignments
3. Add import functionality to HierarchicalItemManager
4. Create data view page with filters
5. Test all features
