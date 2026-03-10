import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import Header from '@/components/Header'
import BudgetPageClient from '@/components/budget/BudgetPageClient'
import { withQueryTimeout } from '@/lib/timeout'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  const user = await requireAuth()
  const { poId } = await searchParams

  const supabase = await createClient()
  const role = user.profile.role as string

  // Supervisor/employee: only POs from po_budget_access. Manager/admin/super_admin: site-based or all.
  const isManagerOrAbove = ['manager', 'admin', 'super_admin'].includes(role)
  const accessibleSiteIds = isManagerOrAbove
    ? await getAccessibleSiteIds(supabase, user.id, role as any)
    : null

  let budgetAccessPoIds: string[] = []
  if (!isManagerOrAbove) {
    const result = await withQueryTimeout(() =>
      supabase.from('po_budget_access').select('purchase_order_id').eq('user_id', user.id)
    )
    const accessRows = Array.isArray(result?.data) ? result.data : []
    budgetAccessPoIds = accessRows.map((r: { purchase_order_id?: string }) => r.purchase_order_id).filter(Boolean) as string[]
  }

  const [sitesResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('id, name, address_street, address_city, address_state, address_zip, contact').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*, departments(id, name)').order('po_number')),
  ])

  let sites = (sitesResult.data || []) as any[]
  let purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  if (isManagerOrAbove) {
    if (accessibleSiteIds !== null) {
      if (accessibleSiteIds.length === 0) {
        sites = []
        purchaseOrders = []
      } else {
        sites = sites.filter((s: any) => accessibleSiteIds.includes(s.id))
        purchaseOrders = purchaseOrders.filter((p: any) => accessibleSiteIds.includes(p.site_id))
      }
    }
  } else {
    // Supervisor/employee: only POs they have budget access to
    const allPOs = (purchaseOrdersResult.data || []) as any[]
    purchaseOrders = allPOs.filter((p: any) => budgetAccessPoIds.includes(p.id))
    const accessSiteIds = [...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean))]
    const allSites = (sitesResult.data || []) as any[]
    sites = allSites.filter((s: any) => accessSiteIds.includes(s.id))
  }

  if (poId && !purchaseOrders.some((p: any) => p.id === poId)) {
    redirect('/dashboard/budget')
  }

  const hasLimitedAccess = !isManagerOrAbove

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Budget Detail" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <BudgetPageClient
          sites={sites}
          purchaseOrders={purchaseOrders}
          initialPoId={poId || null}
          user={user}
          hasLimitedAccess={hasLimitedAccess}
        />
      </div>
    </div>
  )
}
