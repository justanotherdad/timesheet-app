import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersAdminPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  // Use admin client so RLS does not block supervisors/managers from seeing user_profiles of their reports
  const [usersResult, sitesResult] = await Promise.all([
    withQueryTimeout(() => adminSupabase.from('user_profiles').select('*').order('name')),
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
  ])

  const allUsers = (usersResult.data || []) as any[]
  const role = user.profile.role

  // Filter who the current user can see: supervisors see only employees who have them as supervisor/reports_to/manager;
  // managers see employees and supervisors reporting to them; admins see admin and below; super_admins see all.
  let users: any[] = allUsers
  if (role === 'supervisor') {
    users = allUsers.filter(
      (u) =>
        (u.reports_to_id === user.id || u.supervisor_id === user.id || u.manager_id === user.id || u.final_approver_id === user.id) &&
        u.role === 'employee'
    )
  } else if (role === 'manager') {
    users = allUsers.filter(
      (u) =>
        (u.reports_to_id === user.id || u.supervisor_id === user.id || u.manager_id === user.id || u.final_approver_id === user.id) &&
        ['employee', 'supervisor'].includes(u.role)
    )
  } else if (role === 'admin') {
    users = allUsers.filter((u) => u.role !== 'super_admin')
  }
  // super_admin: no filter
  const sites = (sitesResult.data || []) as any[]

  // Fetch departments and purchase orders
  const [departmentsResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('departments').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])
  const allDepartments = (departmentsResult.data || []) as any[]
  const purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  // Load assignments (sites, departments, POs) for visible users with admin client so supervisors/managers can see their reports' data
  const userIds = users.map((u) => u.id)
  let initialUserAssignments: Record<string, { sites: string[]; departments: string[]; purchaseOrders: string[] }> = {}
  if (userIds.length > 0) {
    const [userSitesResult, userDeptsResult, userPOsResult] = await Promise.all([
      withQueryTimeout(() => adminSupabase.from('user_sites').select('user_id, site_id').in('user_id', userIds)),
      withQueryTimeout(() => adminSupabase.from('user_departments').select('user_id, department_id').in('user_id', userIds)),
      withQueryTimeout(() => adminSupabase.from('user_purchase_orders').select('user_id, purchase_order_id').in('user_id', userIds)),
    ])
    const sitesByUser = (userSitesResult.data || []) as { user_id: string; site_id: string }[]
    const deptsByUser = (userDeptsResult.data || []) as { user_id: string; department_id: string }[]
    const posByUser = (userPOsResult.data || []) as { user_id: string; purchase_order_id: string }[]
    userIds.forEach((uid) => {
      initialUserAssignments[uid] = {
        sites: sitesByUser.filter((r) => r.user_id === uid).map((r) => r.site_id),
        departments: deptsByUser.filter((r) => r.user_id === uid).map((r) => r.department_id),
        purchaseOrders: posByUser.filter((r) => r.user_id === uid).map((r) => r.purchase_order_id),
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Users" showBack backUrl="/dashboard" user={user} />
      <div className="w-full px-4 py-8 md:px-6 lg:px-8">
        <div className="w-full max-w-[1920px] mx-auto">
          <UserManagement 
            users={users} 
            lookupUsers={allUsers}
            initialUserAssignments={initialUserAssignments}
            currentUserRole={user.profile.role}
            currentUserId={user.id}
            sites={sites}
            departments={allDepartments}
            purchaseOrders={purchaseOrders}
          />
        </div>
      </div>
    </div>
  )
}

