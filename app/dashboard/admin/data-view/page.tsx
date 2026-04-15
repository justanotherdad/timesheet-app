export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import DataViewManager from '@/components/admin/DataViewManager'

export default async function DataViewPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  // Fetch all users with admin client (RLS bypass), then filter by access
  const [usersResult, sitesResult, departmentsResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => adminSupabase.from('user_profiles').select('id, name, email, supervisor_id, manager_id, final_approver_id, role').order('name')),
    withQueryTimeout(() => supabase.from('sites').select('id, name').order('name')),
    withQueryTimeout(() => supabase.from('departments').select('id, name, site_id').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('id, po_number, site_id, department_id').order('po_number')),
  ])

  const allUsers = (usersResult.data || []) as any[]
  const role = user.profile.role

  // Filter users by access (same logic as users page)
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

  const sites = (sitesResult.data || []) as any[]
  const departments = (departmentsResult.data || []) as any[]
  const purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Data View" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto overflow-hidden">
          <DataViewManager 
            users={users}
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
          />
        </div>
      </div>
    </div>
  )
}
