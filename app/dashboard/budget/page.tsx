import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
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
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  const { poId } = await searchParams

  const supabase = await createClient()
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const [sitesResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('id, name, address_street, address_city, address_state, address_zip, contact').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*, departments(id, name), sites(id, name, address_street, address_city, address_state, address_zip, contact)').order('po_number')),
  ])

  let sites = (sitesResult.data || []) as any[]
  let purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  if (accessibleSiteIds !== null) {
    if (accessibleSiteIds.length === 0) {
      sites = []
      purchaseOrders = []
    } else {
      sites = sites.filter((s: any) => accessibleSiteIds.includes(s.id))
      purchaseOrders = purchaseOrders.filter((p: any) => accessibleSiteIds.includes(p.site_id))
    }
  }

  if (poId && !purchaseOrders.some((p: any) => p.id === poId)) {
    redirect('/dashboard/budget')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Budget Detail" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <BudgetPageClient
          sites={sites}
          purchaseOrders={purchaseOrders}
          initialPoId={poId || null}
          user={user}
        />
      </div>
    </div>
  )
}
