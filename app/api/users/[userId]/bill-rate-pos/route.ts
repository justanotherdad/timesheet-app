import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { billRateIsActiveOnDate } from '@/lib/po-bill-rate-utils'

export const dynamic = 'force-dynamic'

type BillRateRow = {
  po_id: string
  rate: number | null
  effective_from_date: string | null
  effective_to_date: string | null
}

type HistoryRateRow = BillRateRow & { current: boolean }

/**
 * GET: the POs a given employee currently has a bill rate on, with the current
 * effective rate for each. Used by the "Bill Rates by Person" quick-view popup.
 *
 * `?history=1` returns every rate row (current and ended) with effective dates,
 * including inactive POs, for the add-bill-rate dialog. The default response
 * stays current-rates-only so the name-click popup is unchanged.
 *
 * Scope:
 *   - default: only active POs where the employee has a current (non-ended) rate,
 *   - history: every rate row the viewer can open,
 *   - restricted to POs the *viewer* can access (admins: all; others: the
 *     explicit po_budget_access grants) so every returned PO link is reachable.
 *
 * Returns: { rows: [{ po_id, po_number, site_name, project_description, rate, ... }] }
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: brData } = await admin
    .from('po_bill_rates')
    .select('po_id, rate, effective_from_date, effective_to_date')
    .eq('user_id', userId)
  const brRows = (brData || []) as BillRateRow[]
  if (brRows.length === 0) return NextResponse.json({ rows: [] })

  const history = new URL(req.url).searchParams.get('history') === '1'
  const today = new Date().toISOString().slice(0, 10)

  // Default: one current rate per PO. History: every rate row, current and ended.
  const currentRateByPo = new Map<string, { rate: number; from: string }>()
  const historyRows: HistoryRateRow[] = []
  for (const r of brRows) {
    if (!r.po_id) continue
    const current = billRateIsActiveOnDate(r, today)
    if (history) {
      historyRows.push({ ...r, current })
      continue
    }
    if (!current) continue
    const from = r.effective_from_date || ''
    const existing = currentRateByPo.get(r.po_id)
    if (!existing || from > existing.from) {
      currentRateByPo.set(r.po_id, { rate: Number(r.rate) || 0, from })
    }
  }
  const poIds = history
    ? [...new Set(historyRows.map((r) => r.po_id))]
    : [...currentRateByPo.keys()]
  if (poIds.length === 0) return NextResponse.json({ rows: [] })

  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id, site_id, po_number, description, project_name, active')
    .in('id', poIds)
  let accessible = ((pos || []) as {
    id: string
    site_id: string | null
    po_number: string | null
    description: string | null
    project_name: string | null
    active: boolean | null
  }[]).filter((p) => history || p.active !== false)

  // Non-admins: restrict to POs the viewer has been explicitly granted.
  const role = user.profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (!isAdmin) {
    const { data: grants } = await admin
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const granted = new Set(
      (grants || []).map((g) => (g as { purchase_order_id: string }).purchase_order_id)
    )
    accessible = accessible.filter((p) => granted.has(p.id))
  }
  if (accessible.length === 0) return NextResponse.json({ rows: [] })

  const siteIds = [...new Set(accessible.map((p) => p.site_id).filter(Boolean))] as string[]
  const siteNameById = new Map<string, string>()
  if (siteIds.length > 0) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', siteIds)
    for (const s of sites || []) {
      siteNameById.set((s as { id: string }).id, (s as { name: string }).name || '')
    }
  }

  const poById = new Map(accessible.map((p) => [p.id, p]))
  const describe = (poId: string) => {
    const p = poById.get(poId)
    if (!p) return null
    return {
      po_id: p.id,
      po_number: p.po_number || '(no PO #)',
      site_name: siteNameById.get(p.site_id || '') || 'Unknown',
      project_description: (p.project_name || p.description || '').trim() || '—',
    }
  }

  const rows = history
    ? historyRows
        .map((r) => {
          const po = describe(r.po_id)
          if (!po) return null
          return {
            ...po,
            rate: Number(r.rate) || 0,
            effective_from_date: r.effective_from_date,
            effective_to_date: r.effective_to_date,
            current: r.current,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => {
          const s = a.site_name.localeCompare(b.site_name, undefined, { sensitivity: 'base' })
          if (s !== 0) return s
          const n = a.po_number.localeCompare(b.po_number, undefined, { numeric: true })
          if (n !== 0) return n
          return (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
        })
    : accessible
        .map((p) => ({
          po_id: p.id,
          po_number: p.po_number || '(no PO #)',
          site_name: siteNameById.get(p.site_id || '') || 'Unknown',
          project_description: (p.project_name || p.description || '').trim() || '—',
          rate: currentRateByPo.get(p.id)?.rate ?? 0,
        }))
        .sort((a, b) => {
          const s = a.site_name.localeCompare(b.site_name, undefined, { sensitivity: 'base' })
          if (s !== 0) return s
          return a.po_number.localeCompare(b.po_number, undefined, { numeric: true })
        })

  return NextResponse.json({ rows })
}
