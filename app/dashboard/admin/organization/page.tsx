export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import { getAccessibleSiteIds } from '@/lib/access'
import ConsolidatedManager from '@/components/admin/ConsolidatedManager'

export default async function OrganizationAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; site?: string | string[]; add?: string | string[] }>
}) {
  const params = await searchParams
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const site = Array.isArray(params.site) ? params.site[0] : params.site
  const add = Array.isArray(params.add) ? params.add[0] : params.add
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const [sitesResult, departmentsResult, purchaseOrdersResult, expenseTypesResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('*').order('name')),
    withQueryTimeout(() => supabase.from('departments').select('*').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*').order('po_number')),
    withQueryTimeout(() => supabase.from('po_expense_types').select('*').order('name')),
  ])

  let sites = (sitesResult.data || []) as any[]
  let departments = (departmentsResult.data || []) as any[]
  let purchaseOrders = (purchaseOrdersResult.data || []) as any[]
  const expenseTypes = (expenseTypesResult.data || []) as Array<{ id: string; name: string }>

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
  const isAdminOrAbove = role === 'admin' || role === 'super_admin'
  const initialSiteId = site && sites.some((s: { id: string }) => s.id === site) ? site : ''
  const initialTab = tab === 'purchase-orders' ? 'purchase-orders' : 'sites'
  const initialShowAddForm = add === '1' && !!initialSiteId && !readOnly

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={readOnly ? 'View Organization' : 'Manage Organization'} showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <ConsolidatedManager
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
            expenseTypes={expenseTypes}
            readOnly={readOnly}
            isAdminOrAbove={isAdminOrAbove}
            initialTab={initialTab}
            initialSiteId={initialSiteId}
            initialShowAddForm={initialShowAddForm}
          />
        </div>
      </div>
    </div>
  )
}
