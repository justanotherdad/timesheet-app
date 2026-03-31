# Timesheet Management System

A comprehensive timesheet management system built with Next.js, TypeScript, and Supabase. This application provides role-based access control, weekly timesheet entry with daily hours breakdown, and administrative management capabilities.

## Features

### User Roles
- **Employee**: Enter and submit weekly timesheets with daily hours
- **Supervisor**: Approve timesheets for direct reports
- **Manager**: Approve timesheets for direct reports and manage POs
- **Admin**: Full system management (users, dropdowns, timesheets)
- **Super Admin**: All admin capabilities plus user role management

### Core Functionality
- ✅ User authentication with Supabase
- ✅ Role-based access control
- ✅ **Weekly timesheet PO eligibility** from **Bill Rates by Person** on each PO budget (`po_bill_rates`), not from Manage Users
- ✅ **Weekly timesheet format** matching standard timesheet layout:
  - Daily hours breakdown (Monday through Sunday)
  - Multiple billable entries per week
  - Client/Project, PO#, and Task Description fields
  - Unbillable time tracking (HOLIDAY, INTERNAL, PTO)
  - Automatic totals and subtotals
- ✅ Timesheet approval workflow (employee → supervisor/manager)
- ✅ Timesheet export to PDF matching exact format
- ✅ Timesheet history view
- ✅ Admin panel for managing:
  - Users and user roles
  - Reporting relationships
  - Sites (Client/Project), Purchase Orders
  - Export all timesheets

### Manager/Supervisor Features
- View and approve timesheets from direct reports
- Export weekly hours for their reports
- Managers and admins: use **Export Timesheets** / filters to export by week, site, PO, etc. (not tied to legacy per-user PO assignments)

### Budget Detail (PO Budgets)
- PO-level budget view: Client & PO Information (including client contact per PO), budget summary, invoices, billable hours and cost, expenses, bill rates
- **Billable Activities** – Hours from approved timesheets by employee/week (to hundredths place)
- **Billable Cost** – Cost (hours × rate) by employee/week
- **Budget Access** – Admins can grant budget access to any user with a profile; users with access see the full budget (all timesheets, hours, expenses, invoices, etc.)
- **Bill Rates** – Add rates for any user with a profile (not only those who have logged time to the PO yet)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Set Up Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. **First, run the base schema** from `supabase/schema.sql` to create all base tables, indexes, and RLS policies
4. **Then, run the migration** from `supabase/schema_v2.sql` to create the new weekly timesheet structure:
   - `weekly_timesheets` table (one per week per user)
   - `timesheet_entries` table (billable entries with daily hours)
   - `timesheet_unbillable` table (unbillable time entries)

**Note:** The new schema uses `weekly_timesheets` instead of the old `timesheets` table. The old structure is kept for reference but the application now uses the weekly format.

### 4. Run the Application

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## Database Schema

### New Weekly Timesheet Structure

- **weekly_timesheets** - Multiple timesheets per week per user allowed (contains status, signatures, etc.)
- **timesheet_entries** - Multiple billable entries per timesheet with:
  - Client/Project (references sites)
  - PO# (references purchase_orders)
  - Task Description
  - Daily hours: mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours
  - Total hours (calculated)
- **timesheet_unbillable** - Unbillable time entries (HOLIDAY, INTERNAL, PTO) with daily hours
- **timesheet_signatures** - Approval signatures (references weekly_timesheets)

All tables have Row Level Security (RLS) policies enabled for data protection.

## Weekly Timesheet Format

The timesheet matches the standard weekly format with:

1. **Billable Time Section:**
   - Multiple rows for different projects/tasks
   - Columns: Client/Project #, PO#, Task Description
   - Daily hours columns (Mon, Tue, Wed, Thu, Fri, Sat, Sun) with dates
   - Total column (auto-calculated)
   - Sub Totals row (yellow highlight)

2. **Signature Section:**
   - Employee Signature / Date
   - Supervisor Approval by / Date
   - Manager Approval by / Date

3. **Unbillable Time Section:**
   - HOLIDAY, INTERNAL, PTO rows
   - Daily hours for each
   - Sub Totals row (yellow highlight)

4. **Grand Total:**
   - Green highlighted row showing total of all hours

## Deployment

### Cloudflare Pages

1. Build the application:
```bash
npm run build
```

2. Deploy to Cloudflare Pages:
   - Connect your repository to Cloudflare Pages
   - Set build command: `npm run build`
   - Set output directory: `.next`
   - Add environment variables from `.env.local`

3. Update `NEXT_PUBLIC_SITE_URL` to your Cloudflare Pages URL

### Environment Variables

Make sure to set all environment variables in your deployment platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

## Usage

### For Employees
1. Log in to the system
2. Navigate to "New Timesheet" from the dashboard
3. Select the week ending date
4. Add billable time entries:
   - Select Client/Project and PO#
   - Enter Task Description
   - Enter daily hours for each day of the week
5. Enter unbillable time (HOLIDAY, INTERNAL, PTO) if applicable
6. Review totals and save as draft or submit for approval
7. View timesheet history and export approved timesheets

### For Supervisors/Managers
1. Log in to the system
2. Navigate to "Pending Approvals" to see submitted timesheets
3. Review and approve or reject timesheets
4. Export timesheets for your direct reports

### For Admins
1. Log in to the system
2. Access the Admin Panel
3. Manage users, roles, and reporting relationships
4. Manage dropdown options (Sites/Projects, POs)
5. Export all timesheets for any week

## Export Format

The export feature generates a PDF that exactly matches the standard weekly timesheet format with:
- Company header with logo area
- Week ending date and employee name
- Billable time table with all entries
- Signature section
- Unbillable time section
- Grand total

## Future Enhancements

- Email notifications for timesheet submissions and approvals
- Signature capture/image upload for approvals
- Advanced reporting and analytics
- Mobile-responsive improvements
- Bulk timesheet operations
- Timesheet templates
- Integration with payroll systems

## License

This project is proprietary software.
