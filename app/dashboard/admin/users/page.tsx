import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersAdminPage() {
  const user = await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  // Fetch users, sites, and departments
  const [usersResult, sitesResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('user_profiles').select('*').order('name')),
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
  ])

  const users = (usersResult.data || []) as any[]
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
      <Header title="Manage Users" showBack backUrl="/dashboard/admin" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <UserManagement 
            users={users} 
            currentUserRole={user.profile.role}
            sites={sites}
            departments={allDepartments}
            purchaseOrders={purchaseOrders}
          />
        </div>
      </div>
    </div>
  )
}

