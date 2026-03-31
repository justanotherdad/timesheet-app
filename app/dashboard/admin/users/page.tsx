import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import { getBillRatePoSummaryByUserIds } from '@/lib/timesheet-bill-rate-access'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersAdminPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const adminSupabase = createAdminClient()

  // Use admin client so RLS does not block supervisors/managers from seeing user_profiles of their reports
  const usersResult = await withQueryTimeout(() => adminSupabase.from('user_profiles').select('*').order('name'))

  const allUsers = (usersResult.data || []) as any[]
  const role = user.profile.role

  // Filter who the current user can see: supervisors see employees who have them as supervisor/manager/final approver;
  // managers see employees and supervisors who have them as supervisor or manager; admins see admin and below; super_admins see all.
  let users: any[] = allUsers
  if (role === 'supervisor') {
    users = allUsers.filter(
      (u) =>
        (u.supervisor_id === user.id || u.manager_id === user.id || u.final_approver_id === user.id) &&
        u.role === 'employee'
    )
  } else if (role === 'manager') {
    users = allUsers.filter(
      (u) =>
        (u.supervisor_id === user.id || u.manager_id === user.id || u.final_approver_id === user.id) &&
        ['employee', 'supervisor'].includes(u.role)
    )
  } else if (role === 'admin') {
    users = allUsers.filter((u) => u.role !== 'super_admin')
  }
  // super_admin: no filter
  const userIds = users.map((u) => u.id)
  const billRateTimesheetSummaryByUserId =
    userIds.length > 0 ? await getBillRatePoSummaryByUserIds(adminSupabase, userIds) : {}

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Users" showBack backUrl="/dashboard" user={user} />
      <div className="flex-1 min-h-0 w-full px-4 py-4 md:px-6 lg:px-8 flex flex-col overflow-hidden">
        <div className="w-full max-w-[1920px] mx-auto flex-1 flex flex-col min-h-0 overflow-hidden">
          <UserManagement 
            users={users} 
            lookupUsers={allUsers}
            billRateTimesheetSummaryByUserId={billRateTimesheetSummaryByUserId}
            currentUserRole={user.profile.role}
            currentUserId={user.id}
          />
        </div>
      </div>
    </div>
  )
}

