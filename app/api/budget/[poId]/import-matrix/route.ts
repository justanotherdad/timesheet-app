import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { upsertProjectDetailByNames } from '@/lib/syncBidSheetToProject'
import { INDIRECT_SYSTEM_NAME } from '@/lib/bid-sheet-indirect'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

type SourceRow = {
  systems?: { name?: string; code?: string | null } | null
  deliverables?: { name?: string } | null
  activities?: { name?: string } | null
}

/** Normalized key for a system/deliverable/activity combo (code null-aware). */
function comboKey(sysName: string, sysCode: string | null, delName: string, actName: string): string {
  return [
    sysName.trim().toLowerCase(),
    (sysCode || '').trim().toLowerCase(),
    delName.trim().toLowerCase(),
    actName.trim().toLowerCase(),
  ].join('||')
}

/**
 * POST: import the labor matrix STRUCTURE (system / deliverable / activity) from
 * another project PO's matrix into this one.
 *
 * Body: { sourcePoId: string }
 *
 * Rules (agreed design):
 *   - Structure only: each imported row is created with budgeted_hours = 0,
 *     bill_rate = null, description = null. Numbers are filled in afterward.
 *   - Labor only: rows whose system is the "Indirect" system are skipped.
 *   - Add missing only: combos already present on this PO are left untouched
 *     (never overwrites existing hours/rates).
 *   - Access: the caller must have budget access to BOTH this PO and the source.
 */
export async function POST(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const sourcePoId = (body as { sourcePoId?: string }).sourcePoId
  if (!sourcePoId || typeof sourcePoId !== 'string') {
    return NextResponse.json({ error: 'sourcePoId is required' }, { status: 400 })
  }
  if (sourcePoId === poId) {
    return NextResponse.json({ error: 'Source and destination are the same PO' }, { status: 400 })
  }

  const supabase = await createClient()
  if (
    !(await canAccessPoBudget(supabase, user.id, user.profile.role, poId)) ||
    !(await canAccessPoBudget(supabase, user.id, user.profile.role, sourcePoId))
  ) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: destPo } = await admin
    .from('purchase_orders')
    .select('id, budget_type, site_id')
    .eq('id', poId)
    .single()
  if (!destPo) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (destPo.budget_type !== 'project') {
    return NextResponse.json({ error: 'This PO is not a project budget' }, { status: 400 })
  }
  if (!destPo.site_id) {
    return NextResponse.json({ error: 'This PO has no site; cannot import.' }, { status: 400 })
  }

  const { data: srcPo } = await admin
    .from('purchase_orders')
    .select('id, budget_type')
    .eq('id', sourcePoId)
    .single()
  if (!srcPo || srcPo.budget_type !== 'project') {
    return NextResponse.json({ error: 'Source is not a project budget' }, { status: 400 })
  }

  // Source labor rows (with names). Indirect system rows are excluded.
  const { data: srcRows } = await admin
    .from('project_details')
    .select('systems (name, code), deliverables (name), activities (name)')
    .eq('po_id', sourcePoId)

  // Existing combos on the destination — skip these (add-missing-only).
  const { data: destRows } = await admin
    .from('project_details')
    .select('systems (name, code), deliverables (name), activities (name)')
    .eq('po_id', poId)
  const existing = new Set<string>()
  for (const r of (destRows || []) as SourceRow[]) {
    const sysName = (r.systems?.name || '').trim()
    const delName = (r.deliverables?.name || '').trim()
    const actName = (r.activities?.name || '').trim()
    if (!sysName || !delName || !actName) continue
    existing.add(comboKey(sysName, r.systems?.code ?? null, delName, actName))
  }

  let imported = 0
  let skipped = 0
  const seenThisRun = new Set<string>()

  for (const r of (srcRows || []) as SourceRow[]) {
    const sysName = (r.systems?.name || '').trim()
    const sysCode = r.systems?.code ?? null
    const delName = (r.deliverables?.name || '').trim()
    const actName = (r.activities?.name || '').trim()
    if (!sysName || !delName || !actName) continue
    // Labor only.
    if (sysName.toLowerCase() === INDIRECT_SYSTEM_NAME.toLowerCase()) continue

    const key = comboKey(sysName, sysCode, delName, actName)
    if (existing.has(key) || seenThisRun.has(key)) {
      skipped++
      continue
    }
    seenThisRun.add(key)

    try {
      await upsertProjectDetailByNames(admin, destPo.site_id, poId, {
        systemName: sysName,
        systemCode: sysCode,
        deliverableName: delName,
        activityName: actName,
        budgetedHours: 0,
        description: null,
        billRate: null,
      })
      imported++
    } catch {
      // Skip a single bad row rather than fail the whole import.
      skipped++
    }
  }

  return NextResponse.json({ ok: true, imported, skipped })
}
