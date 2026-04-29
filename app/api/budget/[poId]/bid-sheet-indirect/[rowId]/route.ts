import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { decodeIndirectNotes, effectiveIndirectTreatAs } from '@/lib/bid-sheet-indirect'
import { deleteIndirectActivityForProject, upsertIndirectActivityForProject } from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ poId: string; rowId: string }> }
) {
  const { poId, rowId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  /** Single total edits from the matrix (adjust rate holding hours steady). */
  const totalAmountRaw = body.total_amount ?? body.amount
  const parsedTotal = Number(totalAmountRaw)
  let hoursNext = Number(body.hours ?? body.budgeted_hours)
  let rateNext = Number(body.rate ?? body.bid_rate)

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: row, error: rowErr } = await admin
    .from('bid_sheet_indirect_labor')
    .select('id, bid_sheet_id, category, hours, rate, notes')
    .eq('id', rowId)
    .maybeSingle()

  if (rowErr || !row) {
    return NextResponse.json({ error: rowErr?.message || 'Row not found' }, { status: 404 })
  }

  const { data: sheet } = await admin
    .from('bid_sheets')
    .select('id, converted_po_id, site_id')
    .eq('id', row.bid_sheet_id)
    .maybeSingle()

  if (!sheet?.converted_po_id || sheet.converted_po_id !== poId) {
    return NextResponse.json({ error: 'This indirect line is not linked to this project budget' }, { status: 403 })
  }

  const treatAs = effectiveIndirectTreatAs(row.category, row.notes)
  if (treatAs !== 'expense') {
    return NextResponse.json(
      { error: 'Loggable indirect activities are edited as labor matrix rows, not here.' },
      { status: 400 }
    )
  }

  const hoursPrev = Number(row.hours) || 0
  const ratePrev = Number(row.rate) || 0

  if (Number.isFinite(parsedTotal) && parsedTotal >= 0 && !Number.isFinite(hoursNext) && !Number.isFinite(rateNext)) {
    const h = hoursPrev > 0 ? hoursPrev : 1
    hoursNext = h
    rateNext = parsedTotal / h
  } else {
    if (!Number.isFinite(hoursNext)) hoursNext = hoursPrev
    if (!Number.isFinite(rateNext)) rateNext = ratePrev
  }

  const notesVal = body.notes != null ? String(body.notes).trim() || null : (row.notes as string | null)

  const { error: upErr } = await admin
    .from('bid_sheet_indirect_labor')
    .update({
      hours: hoursNext,
      rate: rateNext,
      notes: notesVal,
    })
    .eq('id', rowId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  if (sheet.site_id) {
    try {
      await deleteIndirectActivityForProject(admin, sheet.site_id, poId, row.category, notesVal)
    } catch {
      /* expense lines should not have PD; ignore */
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; rowId: string }> }
) {
  const { poId, rowId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: rowBefore, error: rowErr } = await admin
    .from('bid_sheet_indirect_labor')
    .select('id, bid_sheet_id, category, notes')
    .eq('id', rowId)
    .maybeSingle()

  if (rowErr || !rowBefore) {
    return NextResponse.json({ error: rowErr?.message || 'Row not found' }, { status: 404 })
  }

  const { data: sheet } = await admin
    .from('bid_sheets')
    .select('converted_po_id, site_id')
    .eq('id', rowBefore.bid_sheet_id)
    .maybeSingle()

  if (!sheet?.converted_po_id || sheet.converted_po_id !== poId) {
    return NextResponse.json({ error: 'This indirect line is not linked to this project budget' }, { status: 403 })
  }

  const treatAs = effectiveIndirectTreatAs(rowBefore.category, rowBefore.notes)
  if (treatAs !== 'expense') {
    return NextResponse.json(
      { error: 'Use the matrix labor row Delete action for loggable indirect activities.' },
      { status: 400 }
    )
  }

  const { error: delErr } = await admin.from('bid_sheet_indirect_labor').delete().eq('id', rowId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (sheet.site_id && rowBefore.category) {
    try {
      await deleteIndirectActivityForProject(
        admin,
        sheet.site_id,
        poId,
        rowBefore.category,
        rowBefore.notes
      )
    } catch {
      /* ignore — expense lines typically have nothing to drop */
    }
  }

  return NextResponse.json({ ok: true })
}
