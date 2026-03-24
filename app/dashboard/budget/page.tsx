import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import BudgetPageClient from '@/components/budget/BudgetPageClient'
import { withQueryTimeout } from '@/lib/timeout'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  const user = await requireAuth()
  const { poId } = await searchParams

  const supabase = await createClient()
  const role = user.profile.role as string

  // Only Admin/Super Admin see all POs. Everyone else (Manager, Supervisor, Employee) needs explicit po_budget_access grant.
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  const [sitesResult, purchaseOrdersResult, accessResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('sites').select('id, name, address_street, address_city, address_state, address_zip, contact').order('name')),
    withQueryTimeout(() => supabase.from('purchase_orders').select('*, departments(id, name)').order('po_number')),
    isAdminOrAbove ? Promise.resolve({ data: null }) : withQueryTimeout(() =>
      supabase.from('po_budget_access').select('purchase_order_id').eq('user_id', user.id)
    ),
  ])

  let sites = (sitesResult.data || []) as any[]
  let purchaseOrders = (purchaseOrdersResult.data || []) as any[]

  if (isAdminOrAbove) {
    // Admin/Super Admin: see all POs
  } else {
    // Manager, Supervisor, Employee: only POs where admin has granted them access
    const accessRows = Array.isArray(accessResult?.data) ? accessResult.data : []
    const budgetAccessPoIds = accessRows.map((r: { purchase_order_id?: string }) => r.purchase_order_id).filter(Boolean) as string[]
    const allPOs = (purchaseOrdersResult.data || []) as any[]
    purchaseOrders = allPOs.filter((p: any) => budgetAccessPoIds.includes(p.id))
    const accessSiteIds = [...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean))]
    const allSites = (sitesResult.data || []) as any[]
    sites = allSites.filter((s: any) => accessSiteIds.includes(s.id))
  }

  if (poId && !purchaseOrders.some((p: any) => p.id === poId)) {
    redirect('/dashboard/budget')
  }

  // Full view for all users with access: if granted budget access, they see all info (timesheets, hours, expenses, etc.)
  const hasLimitedAccess = false

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
