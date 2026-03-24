import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

function sumEntryHours(e: Record<string, unknown>): number {
  const days = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const
  return days.reduce((s, k) => s + (Number(e[k]) || 0), 0)
}

export async function GET(_req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: po } = await supabase.from('purchase_orders').select('id, budget_type').eq('id', poId).single()
  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }
  if (po.budget_type !== 'project') {
    return NextResponse.json({ error: 'Not a project budget' }, { status: 400 })
  }

  let db = supabase
  try {
    db = createAdminClient()
  } catch {
    /* fall back to user client */
  }

  const { data: detailRows, error: detErr } = await db
    .from('project_details')
    .select(
      `
      id,
      budgeted_hours,
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)

  if (detErr) {
    return NextResponse.json({ error: detErr.message }, { status: 500 })
  }

  const { data: timesheets } = await db.from('weekly_timesheets').select('id').eq('status', 'approved')

  const tsIds = (timesheets || []).map((t: { id: string }) => t.id)
  let entries: Record<string, unknown>[] = []
  if (tsIds.length > 0) {
    const { data: entData } = await db
      .from('timesheet_entries')
      .select(
        'system_id, deliverable_id, activity_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
      )
      .eq('po_id', poId)
      .in('timesheet_id', tsIds)
    entries = entData || []
  }

  const actualMap = new Map<string, number>()
  let totalAllEntries = 0
  for (const e of entries) {
    const h = sumEntryHours(e)
    totalAllEntries += h
    const sid = e.system_id as string | null | undefined
    const did = e.deliverable_id as string | null | undefined
    const aid = e.activity_id as string | null | undefined
    if (!sid || !did || !aid) continue
    const key = `${sid}|${did}|${aid}`
    actualMap.set(key, (actualMap.get(key) || 0) + h)
  }

  const rows = (detailRows || []).map((r: Record<string, unknown>) => {
    const sys = r.systems as { name?: string; code?: string | null } | null
    const del = r.deliverables as { name?: string } | null
    const act = r.activities as { name?: string } | null
    const systemId = r.system_id as string
    const deliverableId = r.deliverable_id as string
    const activityId = r.activity_id as string
    const key = `${systemId}|${deliverableId}|${activityId}`
    const actual = actualMap.get(key) || 0
    const budgeted = Number(r.budgeted_hours) || 0
    const name = sys?.name || ''
    const code = sys?.code
    const systemLabel = code
      ? `${name}${name ? ' ' : ''}(${code})`.trim()
      : name || '—'
    return {
      id: r.id as string,
      systemLabel: systemLabel || '—',
      deliverableName: del?.name || '—',
      activityName: act?.name || '—',
      budgetedHours: budgeted,
      actualHours: actual,
      variance: budgeted - actual,
    }
  })

  rows.sort((a, b) => {
    const aLabel = `${a.systemLabel}|${a.deliverableName}|${a.activityName}`
    const bLabel = `${b.systemLabel}|${b.deliverableName}|${b.activityName}`
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' })
  })

  const totalBudgeted = rows.reduce((s, r) => s + r.budgetedHours, 0)
  const totalActualMatrix = rows.reduce((s, r) => s + r.actualHours, 0)
  const unmatchedActualHours = Math.max(0, totalAllEntries - totalActualMatrix)

  return NextResponse.json(
    {
      rows,
      totals: {
        budgetedHours: totalBudgeted,
        actualHoursInMatrix: totalActualMatrix,
        actualHoursAllEntries: totalAllEntries,
        unmatchedActualHours,
      },
    },
    noStore
  )
}
