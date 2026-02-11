import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersAdminPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const [usersResult, sitesResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('user_profiles').select('*').order('name')),
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
  ])

  const allUsers = (usersResult.data || []) as any[]
  const role = user.profile.role

  // Filter who the current user can see: supervisors see only employees reporting to them;
  // managers see only employees/supervisors reporting to them; admins see admin and below;
  // super_admins see all.
  let users: any[] = allUsers
  if (role === 'supervisor') {
    users = allUsers.filter(
      (u) =>
        (u.reports_to_id === user.id || u.supervisor_id === user.id || u.manager_id === user.id) &&
        u.role === 'employee'
    )
  } else if (role === 'manager') {
    users = allUsers.filter(
      (u) =>
        (u.reports_to_id === user.id || u.supervisor_id === user.id || u.manager_id === user.id) &&
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Users" showBack backUrl="/dashboard" user={user} />
      <div className="w-full px-4 py-8 md:px-6 lg:px-8">
        <div className="w-full max-w-[1920px] mx-auto">
          <UserManagement 
            users={users} 
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

