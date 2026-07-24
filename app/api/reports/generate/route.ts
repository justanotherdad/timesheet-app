import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { GET as projectMatrixGET } from '@/app/api/budget/[poId]/project-matrix/route'
import { GET as balanceGET } from '@/app/api/budget/[poId]/balance/route'
import type {
  GeneratedReportSnapshot,
  ReportOverageRow,
  ReportPoSummary,
  DollarChartDatum,
  HoursChartDatum,
} from '@/lib/generated-report'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EPS = 1e-6

type MatrixRow = {
  systemLabel?: string
  deliverableName?: string
  activityName?: string
  budgetedHours?: number
  actualHours?: number
  budgetCost?: number
  actualCost?: number
}

type MatrixResponse = {
  rows?: MatrixRow[]
  totals?: {
    budgetedHours?: number
    actualHoursAllEntries?: number
    budgetCost?: number
    actualCost?: number
    costVariance?: number
  }
}

type BalanceResponse = {
  budgetBalance?: number
  totalAvailable?: number
}

async function callInternal<T>(
  handler: (req: Request, ctx: { params: Promise<{ poId: string }> }) => Promise<Response>,
  poId: string
): Promise<T | null> {
  try {
    const res = await handler(new Request('http://internal/'), { params: Promise.resolve({ poId }) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    poIds?: unknown
    includeHours?: unknown
    blendedRates?: unknown
    title?: unknown
  }
  const poIds = Array.isArray(body.poIds) ? (body.poIds.filter((x) => typeof x === 'string') as string[]) : []
  const includeHours = body.includeHours !== false
  const blendedRates =
    body.blendedRates && typeof body.blendedRates === 'object'
      ? (body.blendedRates as Record<string, number>)
      : {}
  const titleInput = typeof body.title === 'string' ? body.title.trim() : ''

  if (poIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one PO.' }, { status: 400 })
  }

  const supabase = await createClient()
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Access check: user must be able to access every selected PO.
  for (const poId of poIds) {
    if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
      return NextResponse.json({ error: 'Access denied for one or more selected POs.' }, { status: 403 })
    }
  }

  const { data: poRows } = await admin
    .from('purchase_orders')
    .select('id, po_number, project_name, description, site_id, budget_type')
    .in('id', poIds)
  const poById = new Map<string, {
    id: string
    po_number: string | null
    project_name: string | null
    description: string | null
    site_id: string | null
    budget_type: string | null
  }>()
  for (const p of poRows || []) poById.set((p as { id: string }).id, p as never)

  const siteIds = [...new Set((poRows || []).map((p) => (p as { site_id: string | null }).site_id).filter(Boolean))] as string[]
  const siteName = new Map<string, string>()
  if (siteIds.length > 0) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', siteIds)
    for (const s of sites || []) siteName.set((s as { id: string }).id, (s as { name: string }).name || '')
  }

  const pos: ReportPoSummary[] = []
  const chartDollars: DollarChartDatum[] = []
  const chartHours: HoursChartDatum[] = []

  // Preserve the caller's selection order.
  for (const poId of poIds) {
    const po = poById.get(poId)
    if (!po) continue
    const poNumber = po.po_number || '(no PO #)'
    const projectName = (po.project_name || po.description || '').trim()
    const clientName = siteName.get(po.site_id || '') || 'Unknown'
    const budgetType: 'project' | 'basic' = po.budget_type === 'project' ? 'project' : 'basic'

    if (budgetType === 'project') {
      const matrix = await callInternal<MatrixResponse>(projectMatrixGET, poId)
      const totals = matrix?.totals || {}
      const rows = matrix?.rows || []
      const totalBudgetHours = Number(totals.budgetedHours) || 0
      const totalActualHours = Number(totals.actualHoursAllEntries) || 0
      const totalBudgetDollars = Number(totals.budgetCost) || 0
      const totalActualDollars = Number(totals.actualCost) || 0
      const remainingDollars =
        totals.costVariance != null ? Number(totals.costVariance) : totalBudgetDollars - totalActualDollars

      const overages: ReportOverageRow[] = rows
        .filter((r) => (Number(r.actualHours) || 0) > (Number(r.budgetedHours) || 0) + EPS)
        .map((r) => {
          const bh = Number(r.budgetedHours) || 0
          const ah = Number(r.actualHours) || 0
          const bc = Number(r.budgetCost) || 0
          const ac = Number(r.actualCost) || 0
          return {
            system: r.systemLabel || '—',
            deliverable: r.deliverableName || '—',
            activity: r.activityName || '—',
            budgetHours: bh,
            actualHours: ah,
            overHours: ah - bh,
            budgetDollars: bc,
            actualDollars: ac,
            overDollars: ac - bc,
          }
        })
        .sort((a, b) => b.overHours - a.overHours)

      pos.push({
        poId,
        poNumber,
        projectName,
        clientName,
        budgetType,
        blendedRate: null,
        totalBudgetHours: includeHours ? totalBudgetHours : null,
        totalActualHours: includeHours ? totalActualHours : null,
        remainingHours: includeHours ? totalBudgetHours - totalActualHours : null,
        totalBudgetDollars,
        totalActualDollars,
        remainingDollars,
        overageLineItems: overages.length,
        onTrackLineItems: Math.max(0, rows.length - overages.length),
        overages,
      })

      chartDollars.push({ poNumber, originalBudget: totalBudgetDollars, budgetRemaining: remainingDollars })
      if (includeHours) {
        chartHours.push({ poNumber, originalHours: totalBudgetHours, remainingHours: totalBudgetHours - totalActualHours })
      }
    } else {
      const bal = await callInternal<BalanceResponse>(balanceGET, poId)
      const totalBudgetDollars = Number(bal?.totalAvailable) || 0
      const remainingDollars = Number(bal?.budgetBalance) || 0
      const totalActualDollars = totalBudgetDollars - remainingDollars
      const rate = Number(blendedRates[poId]) || 0

      let totalBudgetHours: number | null = null
      let remainingHours: number | null = null
      let totalActualHours: number | null = null
      if (includeHours && rate > 0) {
        totalBudgetHours = totalBudgetDollars / rate
        remainingHours = remainingDollars / rate
        totalActualHours = totalBudgetHours - remainingHours
      }

      pos.push({
        poId,
        poNumber,
        projectName,
        clientName,
        budgetType,
        blendedRate: rate > 0 ? rate : null,
        totalBudgetHours,
        totalActualHours,
        remainingHours,
        totalBudgetDollars,
        totalActualDollars,
        remainingDollars,
        overageLineItems: null,
        onTrackLineItems: null,
        overages: [],
      })

      chartDollars.push({ poNumber, originalBudget: totalBudgetDollars, budgetRemaining: remainingDollars })
      if (includeHours && totalBudgetHours != null && remainingHours != null) {
        chartHours.push({ poNumber, originalHours: totalBudgetHours, remainingHours })
      }
    }
  }

  if (pos.length === 0) {
    return NextResponse.json({ error: 'No accessible POs to report on.' }, { status: 400 })
  }

  const snapshot: GeneratedReportSnapshot = {
    generatedAt: new Date().toISOString(),
    generatedByName: user.profile.name || user.profile.email || 'Unknown',
    includeHours,
    pos,
    chartDollars,
    chartHours: includeHours && chartHours.length > 0 ? chartHours : null,
  }

  const defaultTitle =
    pos.length === 1
      ? `${pos[0].poNumber}${pos[0].projectName ? ` — ${pos[0].projectName}` : ''} — Budget Status Report`
      : `Budget Status Report — ${pos.length} POs (${new Date().toLocaleDateString('en-US')})`
  const title = titleInput || defaultTitle

  const { data: inserted, error: insertErr } = await admin
    .from('generated_reports')
    .insert({
      title,
      created_by: user.id,
      created_by_name: snapshot.generatedByName,
      include_hours: includeHours,
      po_ids: pos.map((p) => p.poId),
      po_numbers: pos.map((p) => p.poNumber),
      project_names: pos.map((p) => p.projectName).filter(Boolean),
      client_names: [...new Set(pos.map((p) => p.clientName).filter(Boolean))],
      snapshot,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to save report' }, { status: 500 })
  }

  return NextResponse.json({ id: (inserted as { id: string }).id, snapshot, title })
}
