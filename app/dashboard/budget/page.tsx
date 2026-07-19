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

  // "Awaiting Payment" filter data: active POs where every person in the bill
  // rate section has an end date that has already passed (nobody is currently
  // active to log time against the budget). A PO with no bill-rate rows does not
  // qualify. Computed here so the list can filter client-side without an extra
  // round trip. Deactivated POs are never included.
  const activePoIds = purchaseOrders.filter((p: any) => p.active !== false).map((p: any) => p.id as string)
  const todayStr = new Date().toISOString().slice(0, 10)
  // Awaiting Payment: every bill-rate person has a passed end date (no one active).
  const awaitingPaymentPoIds: string[] = []
  // Active bill rates: at least one bill-rate person is still current (the
  // complement used by the "Remove Awaiting Payment" filter).
  const activeBillRatePoIds: string[] = []
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
      // A row counts as "active" when it has no end date (open-ended) or the end
      // date is today or later. Passed = a real end date strictly before today.
      if (r.effective_to_date != null && r.effective_to_date < todayStr) acc.expired += 1
      byPo.set(r.po_id, acc)
    }
    for (const [pid, acc] of byPo) {
      if (acc.total === 0) continue
      if (acc.expired === acc.total) awaitingPaymentPoIds.push(pid)
      else activeBillRatePoIds.push(pid) // at least one still-current rate
    }
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
          awaitingPaymentPoIds={awaitingPaymentPoIds}
          activeBillRatePoIds={activeBillRatePoIds}
        />
      </div>
    </div>
  )
}
