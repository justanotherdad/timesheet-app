import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { effectiveIndirectTreatAs, indirectLineDollarTotal } from '@/lib/bid-sheet-indirect'
import { upsertIndirectActivityForProject } from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

/**
 * POST /api/budget/[poId]/sync-indirect-activities
 *
 * Repairs a converted project budget whose activity-type indirect rows (PM, DocCoord,
 * ProjControls, and any custom 'activity' rows) were not written to project_details
 * during the original bid sheet conversion (e.g. converted before this logic existed).
 *
 * Body (optional): { bidSheetRowIds?: string[] }
 *   - If omitted, syncs ALL activity-type rows from the linked bid sheet.
 *   - If provided, syncs only the listed bid_sheet_indirect_labor row IDs.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  let admin = supabase
  try { admin = createAdminClient() } catch { /* use user client */ }

  const body = await req.json().catch(() => ({}))
  const filterIds: string[] | undefined =
    Array.isArray(body?.bidSheetRowIds) ? body.bidSheetRowIds : undefined

  const { data: po } = await admin
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .maybeSingle()

  const siteId: string | null = (po as { site_id?: string } | null)?.site_id ?? null
  if (!siteId) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

  const { data: sheet } = await admin
    .from('bid_sheets')
    .select('id')
    .eq('converted_po_id', poId)
    .maybeSingle()

  const bidSheetId: string | null = (sheet as { id?: string } | null)?.id ?? null
  if (!bidSheetId) {
    return NextResponse.json({ error: 'No linked bid sheet found for this PO' }, { status: 404 })
  }

  let query = admin
    .from('bid_sheet_indirect_labor')
    .select('id, category, notes, hours, rate')
    .eq('bid_sheet_id', bidSheetId)

  if (filterIds && filterIds.length > 0) {
    query = query.in('id', filterIds)
  }

  const { data: indirectRows, error: rowsErr } = await query
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const row of indirectRows || []) {
    const r = row as {
      id: string
      category: string
      notes?: string | null
      hours?: number | null
      rate?: number | null
    }
    if (effectiveIndirectTreatAs(r.category, r.notes) !== 'activity') {
      skipped++
      continue
    }
    const hours = Number(r.hours) || 0
    const rate = Number(r.rate) || 0
    const amt = indirectLineDollarTotal(hours, rate, r.category, r.notes)
    if (amt <= 0 && hours <= 0) {
      skipped++
      continue
    }
    try {
      await upsertIndirectActivityForProject(admin, siteId, poId, r.category, hours, r.notes ?? null)
      synced++
    } catch (e) {
      errors.push(`Row ${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ synced, skipped, errors })
}
