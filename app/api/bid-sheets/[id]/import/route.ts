import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { syncBidSheetItemToProject, type BidSheetItemRow } from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

async function canAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, role: string, bidSheetId: string): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase.from('bid_sheet_access').select('user_id').eq('bid_sheet_id', bidSheetId).eq('user_id', userId).maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase.from('user_sites').select('site_id').eq('user_id', userId).eq('site_id', sheet.site_id).maybeSingle()
  return !!siteAccess
}

/** Parse CSV: System_Name, System_Number, Deliverable_Name, Activity_Name (optional: Budgeted_Hours) */
function parseCSV(text: string): Array<{ system: string; systemNumber: string; deliverable: string; activity: string; hours: number }> {
  const normalized = text.replace(/^\uFEFF/, '').trim()
  const lines = normalized.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0]
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(',')
    .map((h) => h.trim().replace(/^\uFEFF/, ''))
  const sysIdx = headers.findIndex((h) => (h.includes('system') && !h.includes('number')) || h === 'system name')
  const numIdx = headers.findIndex((h) => (h.includes('system') && h.includes('number')) || h === 'system number')
  const delIdx = headers.findIndex((h) => h.includes('deliverable'))
  const actIdx = headers.findIndex((h) => h.includes('activity'))
  const hrsIdx = headers.findIndex((h) => h.includes('hour') || h.includes('budget'))

  const rows: Array<{ system: string; systemNumber: string; deliverable: string; activity: string; hours: number }> = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim())
    const system = sysIdx >= 0 ? (cells[sysIdx] || '').trim() : ''
    const systemNumber = numIdx >= 0 ? (cells[numIdx] || '').trim() : ''
    const deliverable = delIdx >= 0 ? (cells[delIdx] || '').trim() : ''
    const activity = actIdx >= 0 ? (cells[actIdx] || '').trim() : ''
    const hours = hrsIdx >= 0 ? parseFloat(String(cells[hrsIdx])) || 0 : 0
    if (system || systemNumber || deliverable || activity) {
      rows.push({ system, systemNumber, deliverable, activity, hours })
    }
  }
  return rows
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { data: sheet } = await supabase.from('bid_sheets').select('site_id, status, converted_po_id').eq('id', id).single()
  if (!sheet) return NextResponse.json({ error: 'Bid sheet not found' }, { status: 404 })

  const body = await req.json()
  const csvText = body.csv || body.text || ''
  if (!csvText) return NextResponse.json({ error: 'csv or text required' }, { status: 400 })

  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          'No valid rows in CSV. Use the header row plus data rows with columns: System_Name, System_Number, Deliverable_Name, Activity_Name, Budgeted_Hours. Re-export from the bid sheet (Export CSV) or ensure Excel did not change the header names; remove a UTF-8 BOM if you edited the file.',
      },
      { status: 400 }
    )
  }

  const db = createAdminClient()

  // Fetch existing bid_sheet_* to reuse
  const [existingSys, existingDel, existingAct] = await Promise.all([
    db.from('bid_sheet_systems').select('id, name, code').eq('bid_sheet_id', id),
    db.from('bid_sheet_deliverables').select('id, name').eq('bid_sheet_id', id),
    db.from('bid_sheet_activities').select('id, name').eq('bid_sheet_id', id),
  ])

  const findOrCreateSystem = async (name: string, code: string) => {
    const n = (name || '').trim()
    const c = (code || '').trim()
    const existing = (existingSys.data || []).find((s: any) => s.name?.toLowerCase() === n.toLowerCase() && (s.code || '') === c)
    if (existing) return existing.id
    const { data: ins } = await db.from('bid_sheet_systems').insert({ bid_sheet_id: id, name: n || c, code: c || null }).select('id').single()
    if (ins) {
      (existingSys.data as any[]).push({ id: ins.id, name: n || c, code: c })
      return ins.id
    }
    return ''
  }
  const findOrCreateDeliverable = async (name: string) => {
    const n = (name || '').trim().toLowerCase()
    const existing = (existingDel.data || []).find((d: any) => d.name?.toLowerCase() === n)
    if (existing) return existing.id
    const { data: ins } = await db.from('bid_sheet_deliverables').insert({ bid_sheet_id: id, name: (name || '').trim() }).select('id').single()
    if (ins) {
      (existingDel.data as any[]).push({ id: ins.id, name: (name || '').trim() })
      return ins.id
    }
    return ''
  }
  const findOrCreateActivity = async (name: string) => {
    const n = (name || '').trim().toLowerCase()
    const existing = (existingAct.data || []).find((a: any) => a.name?.toLowerCase() === n)
    if (existing) return existing.id
    const { data: ins } = await db.from('bid_sheet_activities').insert({ bid_sheet_id: id, name: (name || '').trim() }).select('id').single()
    if (ins) {
      (existingAct.data as any[]).push({ id: ins.id, name: (name || '').trim() })
      return ins.id
    }
    return ''
  }

  const toInsert: Array<{ bid_sheet_id: string; bid_sheet_system_id: string; bid_sheet_deliverable_id: string; bid_sheet_activity_id: string; budgeted_hours: number }> = []
  const skipped: string[] = []

  for (const r of rows) {
    const sysId = await findOrCreateSystem(r.system || r.systemNumber, r.systemNumber)
    const delId = await findOrCreateDeliverable(r.deliverable)
    const actId = await findOrCreateActivity(r.activity)
    if (sysId && delId && actId) {
      toInsert.push({
        bid_sheet_id: id,
        bid_sheet_system_id: sysId,
        bid_sheet_deliverable_id: delId,
        bid_sheet_activity_id: actId,
        budgeted_hours: r.hours,
      })
    } else {
      skipped.push(`${r.system || r.systemNumber}/${r.deliverable}/${r.activity}`)
    }
  }

  if (toInsert.length > 0) {
    const { error } = await db.from('bid_sheet_items').upsert(toInsert, {
      onConflict: 'bid_sheet_id,bid_sheet_system_id,bid_sheet_deliverable_id,bid_sheet_activity_id',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (sheet.status === 'converted' && sheet.converted_po_id && toInsert.length > 0) {
    const { data: itemsWithJoins, error: syncErr } = await db
      .from('bid_sheet_items')
      .select(
        `
        *,
        bid_sheet_systems (id, name, code),
        bid_sheet_deliverables (id, name),
        bid_sheet_activities (id, name)
      `
      )
      .eq('bid_sheet_id', id)
    if (syncErr) return NextResponse.json({ error: syncErr.message }, { status: 500 })
    try {
      for (const row of itemsWithJoins || []) {
        await syncBidSheetItemToProject(db, sheet.site_id, sheet.converted_po_id, row as BidSheetItemRow)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to sync to project budget'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json({ inserted: toInsert.length, skipped: skipped.length, skippedRows: skipped })
}
