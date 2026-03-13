# Audit Log Setup

The audit trail records who did what, when. It is visible only to Admins and Super Admins.

## 1. Run the migration

Run the SQL in `supabase/migrations/20250324000000_create_audit_log.sql` in your Supabase SQL Editor, or use:

```bash
supabase db push
```

if you use the Supabase CLI.

## 2. What gets logged

| Action | Entity | When |
|--------|--------|------|
| User create/update | user | Create user, update profile |
| User delete | user | Delete user |
| User role change | user | Update user profile (role) |
| Timesheet approve | timesheet | Approve submitted timesheet |
| Timesheet reject | timesheet | Reject timesheet |
| Bid sheet create | bid_sheet | Create new bid sheet |
| Bid sheet convert | bid_sheet | Convert to project budget |
| Bid sheet delete | bid_sheet | Delete bid sheet |
| Bid sheet access grant/revoke | bid_sheet_access | Grant/revoke user access |
| Budget access grant/revoke | po_budget_access | Grant/revoke PO budget access |

## 3. Viewing the audit log

Admins and Super Admins see an **Audit Log** card on the dashboard. Click it to view, filter, and paginate the audit trail.
