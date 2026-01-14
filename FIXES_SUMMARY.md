# Summary of Fixes Applied

## 1. Timesheet Creation - Filter Sites and POs by User Assignments ✅

**Fixed:** Sites and Purchase Orders dropdowns now filter based on user's assigned sites/POs from their profile.

**Files Changed:**
- `app/dashboard/timesheets/new/page.tsx`
- `app/dashboard/timesheets/[id]/edit/page.tsx`

**How it works:**
- Queries `user_sites` and `user_purchase_orders` junction tables
- Filters sites and POs to only show those assigned to the user
- Admins and Super Admins see all sites/POs (no filtering)

---

## 2. System Field - Allow Custom Input ✅

**Fixed:** System dropdown now allows typing custom values that are NOT saved to the systems table.

**Files Changed:**
- Created `components/SystemInput.tsx` - New component for system input with custom value support
- Updated `components/WeeklyTimesheetForm.tsx` - Uses SystemInput instead of SearchableSelect for system field
- Created `supabase/add_system_name_column.sql` - Migration to add `system_name` column to `timesheet_entries`

**How it works:**
- Users can select from dropdown OR type a custom system name
- Custom values are stored in `timesheet_entries.system_name` (not in `systems` table)
- When displaying, shows custom name if `system_name` exists, otherwise shows system name from `system_id`

**Database Migration Required:**
Run `supabase/add_system_name_column.sql` in Supabase SQL Editor to add the `system_name` column.

---

## 3. Task Description Text Selection Closing Popup ✅

**Fixed:** Selecting text in the task description field no longer closes the modal.

**Files Changed:**
- `components/WeeklyTimesheetForm.tsx`

**How it works:**
- Changed backdrop click handler from `onClick` to `onMouseDown`
- Only closes if clicking directly on backdrop (not on selected text)
- Removed the `useEffect` click-outside handler that was interfering

---

## 4. Organization Management - Edit Buttons ✅

**Fixed:** Edit buttons for Sites, Departments, and Purchase Orders now work.

**Files Changed:**
- `components/admin/ConsolidatedManager.tsx`

**How it works:**
- Added edit modal forms for each type (site, department, PO)
- Edit forms appear when clicking edit button
- Forms include all necessary fields and save functionality

---

## 5. PO Creation - Department Selection ✅

**Fixed:** When adding a new Purchase Order, there's now a department dropdown.

**Files Changed:**
- `components/admin/ConsolidatedManager.tsx`

**How it works:**
- Added department dropdown to PO creation form
- Department selection is optional
- Selected department is saved with the PO

---

## 6. Admin Delete Timesheet Permission ✅

**Fixed:** Admins and Super Admins can now delete any timesheet regardless of status.

**Files Changed:**
- `components/DeleteTimesheetButton.tsx` - Added `userRole` prop and logic to show for admins
- `app/dashboard/timesheets/page.tsx` - Passes user role to DeleteTimesheetButton
- `app/actions/delete-timesheet.ts` - Already had server-side permission check (no change needed)

**How it works:**
- Delete button shows for:
  - Draft timesheets (any user)
  - Any timesheet if user is admin/super_admin
- Server-side enforces the same permissions

---

## 7. Black Page Issue - Submitted Timesheet View

**Status:** Investigating - The detail page should work for submitted timesheets. The issue might be:
- An error in the entries query
- Missing error handling
- A redirect issue

**Potential Fix:** Added better error handling and ensured entries query includes `system_name` field.

---

## 8. Logo Location in Header

**Location:** `components/Header.tsx` (lines 47-71)

**Current Setup:**
- Text-based logo is currently active (lines 58-70)
- Image logo code is commented out (lines 49-55)

**To Change Logo:**
1. Add your logo image to `/public/ctg-logo.png` (or `.svg`, `.jpg`)
2. In `components/Header.tsx`:
   - Uncomment lines 49-55 (Image component)
   - Comment out lines 58-70 (text logo)
   - Adjust `width` and `height` if needed

**See:** `updating-favicon-and-logo.md` for detailed instructions

---

## Database Migrations Required

1. **System Name Column:**
   - Run `supabase/add_system_name_column.sql`
   - Adds `system_name TEXT` column to `timesheet_entries` table

---

## Testing Checklist

- [ ] Sites/POs filter correctly for non-admin users
- [ ] System field allows typing custom values
- [ ] Custom system names are saved and displayed
- [ ] Task description text selection doesn't close modal
- [ ] Edit buttons work for sites, departments, and POs
- [ ] Department selection appears when creating PO
- [ ] Admins can delete submitted/approved timesheets
- [ ] Submitted timesheets display correctly (no black page)
- [ ] Logo can be changed in Header.tsx

---

## Notes

- Custom system names are stored in `timesheet_entries.system_name` and are NOT added to the `systems` table
- User assignments are stored in junction tables: `user_sites`, `user_departments`, `user_purchase_orders`
- The black page issue may require checking browser console for JavaScript errors
