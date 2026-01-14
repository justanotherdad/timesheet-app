# Timesheet Workflow Fix & Database Migration

## Issue 1: Database Error - Missing Columns

**Error:** `Could not find the 'activity_id' column of 'timesheet_entries' in the schema cache`

**Solution:** Run the SQL migration to add the missing columns.

### Database Migration Steps:

1. Go to Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the contents of `supabase/add_timesheet_entry_fields.sql`
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Verify the columns were added

The migration adds:
- `system_id` (UUID, nullable, references systems table)
- `deliverable_id` (UUID, nullable, references deliverables table)
- `activity_id` (UUID, nullable, references activities table)
- Indexes for performance

---

## Issue 2: Timesheet Workflow - Save vs Submit

### Current Workflow (After Fix):

1. **Save Button:**
   - Saves timesheet with status = `draft`
   - User can continue editing
   - Timesheet is NOT sent to approver
   - Available when status is `draft`

2. **Submit Button:**
   - Saves timesheet AND sets status = `submitted`
   - Sets `submitted_at` timestamp
   - Sets `employee_signed_at` timestamp
   - Timesheet is sent to approver (based on `reports_to_id` in user profile)
   - Only available when status is `draft`
   - After submission, timesheet becomes read-only for employee

3. **Timesheet Statuses:**
   - `draft` - Employee is editing
   - `submitted` - Sent to approver (supervisor/manager)
   - `approved` - Approved by manager
   - `rejected` - Rejected back to employee (can edit and resubmit)

---

## Issue 3: Approvals Page - Status Visibility

### Current Approvals Page (`/dashboard/approvals`):

- **Who Can Access:** Supervisors, Managers, Admins, Super Admins
- **Currently Shows:** Only `submitted` status timesheets
- **Source:** Timesheets from users where `reports_to_id` = current user's ID

### Proposed Changes (To Be Implemented):

The approvals page should show timesheets based on role:

1. **Supervisors:**
   - See timesheets from employees where `reports_to_id` = supervisor's ID
   - See all statuses: `draft`, `submitted`, `approved`, `rejected`
   - Can approve/reject `submitted` timesheets

2. **Managers:**
   - See timesheets from employees AND supervisors where they are the approver
   - See all statuses: `draft`, `submitted`, `approved`, `rejected`
   - Can approve/reject `submitted` timesheets

3. **Admin/Super Admin:**
   - See ALL timesheets in the system
   - See all statuses
   - Can approve/reject any timesheet

**Note:** The approvals page currently only shows `submitted` timesheets. This may need to be updated to show all statuses with filtering options.

---

## Issue 4: Timesheets List Page - Status Visibility

### Current Timesheets List Page (`/dashboard/timesheets`):

1. **Employees:**
   - See only their own timesheets
   - All statuses shown

2. **Supervisors/Managers:**
   - See their own timesheets + timesheets of direct reports
   - All statuses shown

3. **Admin/Super Admin:**
   - See ALL timesheets
   - All statuses shown

**Status:** This appears to be working correctly based on the code.

---

## How to Deploy

### Quick Deploy Steps:

1. **First, run the database migration** (see Issue 1 above)

2. **Commit and push your changes:**
   ```bash
   git add .
   git commit -m "Fix timesheet workflow: Add Save/Submit buttons and database migration"
   git push
   ```

3. **Wait 3-5 minutes** for Vercel to deploy

4. **Check deployment status:**
   - Go to: https://vercel.com/dashboard
   - Click on your project
   - Go to **Deployments** tab
   - Look for green checkmark ✅

5. **Test the changes:**
   - Visit: https://ctgtimesheet.com
   - Test saving a timesheet (should save as draft)
   - Test submitting a timesheet (should change to submitted status)
   - Test approval workflow

---

## Summary of Changes Made

1. ✅ **Created SQL migration** (`supabase/add_timesheet_entry_fields.sql`)
   - Adds `system_id`, `deliverable_id`, `activity_id` columns
   - Adds indexes for performance

2. ✅ **Updated WeeklyTimesheetForm**:
   - Split `handleSubmit` into `saveTimesheet`, `handleSave`, and `handleSubmit`
   - Added separate "Save Draft" and "Submit for Approval" buttons
   - Save button saves as `draft` status
   - Submit button saves as `submitted` status
   - Submit button only shows when status is `draft`

3. ⚠️ **Approvals Page**: Currently only shows `submitted` timesheets
   - May need updates to show all statuses with filtering
   - Current implementation works for approval workflow
   - Supervisors/managers see timesheets from direct reports

---

## Testing Checklist

After deploying:

- [ ] Run database migration successfully
- [ ] Create new timesheet → Save button works (saves as draft)
- [ ] Draft timesheet → Submit button appears
- [ ] Submit timesheet → Status changes to `submitted`
- [ ] Submitted timesheet → Can no longer edit (Save button disabled)
- [ ] Approver can see submitted timesheet in `/dashboard/approvals`
- [ ] Approver can approve/reject timesheet
- [ ] Rejected timesheet → Employee can edit and resubmit
- [ ] System, Deliverable, Activity fields save correctly

---

## Next Steps (If Needed)

1. **Update Approvals Page** to show all statuses (not just submitted)
   - Add status filter dropdown
   - Show timesheets in all statuses based on role

2. **Add Status Filtering** to Timesheets List Page
   - Allow filtering by status
   - Better organization of timesheet list

3. **Add Email Notifications** (Future)
   - Notify approver when timesheet is submitted
   - Notify employee when timesheet is approved/rejected
