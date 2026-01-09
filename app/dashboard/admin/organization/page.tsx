import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import ConsolidatedManager from '@/components/admin/ConsolidatedManager'

export default async function OrganizationAdminPage() {
  const user = await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  // Fetch all data
  const [sitesResult, departmentsResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('departments').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])

  const sites = (sitesResult.data || []) as any[]
  const departments = (departmentsResult.data || []) as any[]
  const purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Organization" showBack backUrl="/dashboard/admin" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <ConsolidatedManager 
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
          />
        </div>
      </div>
    </div>
  )
}
