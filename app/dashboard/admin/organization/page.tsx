import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import { getAccessibleSiteIds } from '@/lib/access'
import ConsolidatedManager from '@/components/admin/ConsolidatedManager'

export default async function OrganizationAdminPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const [sitesResult, departmentsResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('departments').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
  ])

  let sites = (sitesResult.data || []) as any[]
  let departments = (departmentsResult.data || []) as any[]
  let purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  const role = user.profile.role as 'supervisor' | 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)
  if (accessibleSiteIds !== null) {
    if (accessibleSiteIds.length === 0) {
      sites = []
      departments = []
      purchaseOrders = []
    } else {
      sites = sites.filter((s: { id: string }) => accessibleSiteIds.includes(s.id))
      departments = departments.filter((d: { site_id: string }) => accessibleSiteIds.includes(d.site_id))
      purchaseOrders = purchaseOrders.filter((p: { site_id: string }) => accessibleSiteIds.includes(p.site_id))
    }
  }

  const readOnly = role === 'supervisor'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={readOnly ? 'View Organization' : 'Manage Organization'} showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <ConsolidatedManager
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  )
}
