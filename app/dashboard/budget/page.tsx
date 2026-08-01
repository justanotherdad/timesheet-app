import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import BudgetPageClient from '@/components/budget/BudgetPageClient'
import { withQueryTimeout } from '@/lib/timeout'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PO_SELECT = '*, departments(id, name)'
const SITE_SELECT = 'id, name, address_street, address_city, address_state, address_zip, contact'

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  const user = await requireAuth()
  const { poId } = await searchParams

  const supabase = await createClient()
  const role = user.profile.role as string
  const isClient = role === 'client'

  // Only Admin/Super Admin see all POs. Everyone else needs explicit po_budget_access
  // with can_view_budget. Load granted POs/sites via service role so Clients (and
  // other non-admins) are not blocked by sites/purchase_orders RLS.
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  let sites: any[] = []
  let purchaseOrders: any[] = []

  if (isAdminOrAbove) {
    const [sitesResult, purchaseOrdersResult] = await Promise.all([
      withQueryTimeout(() => supabase.from('sites').select(SITE_SELECT).order('name')),
      withQueryTimeout(() => supabase.from('purchase_orders').select(PO_SELECT).order('po_number')),
    ])
    sites = (sitesResult.data || []) as any[]
    purchaseOrders = (purchaseOrdersResult.data || []) as any[]
  } else {
    const accessResult = await withQueryTimeout(() =>
      supabase
        .from('po_budget_access')
        .select('purchase_order_id, can_view_budget')
        .eq('user_id', user.id)
    )
    const accessRows = Array.isArray(accessResult?.data) ? accessResult.data : []
    let budgetAccessPoIds = accessRows
      .filter((r: { can_view_budget?: boolean | null }) => r.can_view_budget !== false)
      .map((r: { purchase_order_id?: string }) => r.purchase_order_id)
      .filter(Boolean) as string[]

    if (budgetAccessPoIds.length > 0) {
      let admin
      try {
        admin = createAdminClient()
      } catch {
        admin = null
      }
      const db = admin || supabase
      const purchaseOrdersResult = await withQueryTimeout(() =>
        db.from('purchase_orders').select(PO_SELECT).in('id', budgetAccessPoIds).order('po_number')
      )
      purchaseOrders = (purchaseOrdersResult.data || []) as any[]

      // Clients: only active budgets they were granted
      if (isClient) {
        purchaseOrders = purchaseOrders.filter((p: any) => p.active !== false)
        budgetAccessPoIds = purchaseOrders.map((p: any) => p.id)
      }

      const accessSiteIds = [
        ...new Set(purchaseOrders.map((p: any) => p.site_id).filter(Boolean)),
      ] as string[]
      if (accessSiteIds.length > 0) {
        const sitesResult = await withQueryTimeout(() =>
          db.from('sites').select(SITE_SELECT).in('id', accessSiteIds).order('name')
        )
        sites = (sitesResult.data || []) as any[]
      }
    }
  }

  // Clients with no viewable budgets: leave budget page
  if (isClient && purchaseOrders.length === 0) {
    redirect('/dashboard')
  }

  if (poId && !purchaseOrders.some((p: any) => p.id === poId)) {
    redirect('/dashboard/budget')
  }

  // "Awaiting Payment" filter data — not used for Clients (filters hidden).
  const awaitingPaymentPoIds: string[] = []
  const activeBillRatePoIds: string[] = []
  if (!isClient) {
    const activePoIds = purchaseOrders
      .filter((p: any) => p.active !== false)
      .map((p: any) => p.id as string)
    const todayStr = new Date().toISOString().slice(0, 10)
    if (activePoIds.length > 0) {
      const rateRows: { po_id: string; effective_to_date: string | null }[] = []
      for (let i = 0; i < activePoIds.length; i += 100) {
        const chunk = activePoIds.slice(i, i + 100)
        const { data: rows } = await withQueryTimeout(() =>
          supabase.from('po_bill_rates').select('po_id, effective_to_date').in('po_id', chunk)
        )
        if (Array.isArray(rows)) rateRows.push(...(rows as typeof rateRows))
      }
      const byPo = new Map<string, { total: number; expired: number }>()
      for (const r of rateRows) {
        const acc = byPo.get(r.po_id) || { total: 0, expired: 0 }
        acc.total += 1
        if (r.effective_to_date != null && r.effective_to_date < todayStr) acc.expired += 1
        byPo.set(r.po_id, acc)
      }
      for (const [pid, acc] of byPo) {
        if (acc.total === 0) continue
        if (acc.expired === acc.total) awaitingPaymentPoIds.push(pid)
        else activeBillRatePoIds.push(pid)
      }
    }
  }

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
          awaitingPaymentPoIds={awaitingPaymentPoIds}
          activeBillRatePoIds={activeBillRatePoIds}
          simplifiedPicker={isClient}
        />
      </div>
    </div>
  )
}
