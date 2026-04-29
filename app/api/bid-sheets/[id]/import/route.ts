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

/**
 * RFC 4180-style CSV tokenizer. Walks character-by-character so it honors
 * quoted fields (commas/newlines inside `"…"` are part of the cell), the
 * `""` doubled-quote escape that Excel emits for embedded quotes, and both
 * `\r\n` and `\n` row terminators.
 *
 * The previous implementation did a naive `lines[i].split(',')` which broke
 * rows like `"System Level Impact Assessment (SLIA, etc.)"`: the inner comma
 * shifted every following column, the Budgeted_Hours value was read from a
 * non-numeric column, and `parseFloat` returned NaN → 0. The matrix then
 * imported the system/deliverable/activity rows fine but every cell came in
 * with 0 hours, which is the symptom we just hit.
 */
function tokenizeCsv(text: string): string[][] {
  const stripped = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const finishCell = () => {
    row.push(cell)
    cell = ''
  }
  const finishRow = () => {
    finishCell()
    // Drop trailing empty rows produced by a final newline.
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (inQuotes) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') {
          cell += '"'
          i += 1
          continue
        }
        inQuotes = false
        continue
      }
      cell += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      finishCell()
      continue
    }
    if (ch === '\r') {
      if (stripped[i + 1] === '\n') i += 1
      finishRow()
      continue
    }
    if (ch === '\n') {
      finishRow()
      continue
    }
    cell += ch
  }
  // Trailing cell on a file that doesn't end in a newline.
  if (cell.length > 0 || row.length > 0) finishRow()

  return rows
}

type ParsedRow = {
  lineNumber: number
  system: string
  systemNumber: string
  deliverable: string
  activity: string
  hours: number
}

/** Parse CSV: System_Name, System_Number, Deliverable_Name, Activity_Name (optional: Budgeted_Hours) */
function parseCSV(text: string): ParsedRow[] {
  const tokens = tokenizeCsv(text)
  if (tokens.length < 2) return []

  const headers = tokens[0].map((h) =>
    (h || '')
      .toLowerCase()
      .replace(/_/g, ' ')
      .trim()
      .replace(/^\uFEFF/, '')
  )
  const sysIdx = headers.findIndex((h) => (h.includes('system') && !h.includes('number')) || h === 'system name')
  const numIdx = headers.findIndex((h) => (h.includes('system') && h.includes('number')) || h === 'system number')
  const delIdx = headers.findIndex((h) => h.includes('deliverable'))
  const actIdx = headers.findIndex((h) => h.includes('activity'))
  const hrsIdx = headers.findIndex((h) => h.includes('hour') || h.includes('budget'))

  const rows: ParsedRow[] = []
  for (let i = 1; i < tokens.length; i++) {
    const cells = tokens[i].map((c) => (c || '').trim())
    const system = sysIdx >= 0 ? (cells[sysIdx] || '') : ''
    const systemNumber = numIdx >= 0 ? (cells[numIdx] || '') : ''
    const deliverable = delIdx >= 0 ? (cells[delIdx] || '') : ''
    const activity = actIdx >= 0 ? (cells[actIdx] || '') : ''
    const hoursRaw = hrsIdx >= 0 ? cells[hrsIdx] || '' : ''
    const hours = parseFloat(hoursRaw.replace(/[",\s]/g, '')) || 0
    if (system || systemNumber || deliverable || activity) {
      rows.push({ lineNumber: i + 1, system, systemNumber, deliverable, activity, hours })
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

  // Collapse duplicate cells before upserting. The matrix cell key is
  // (bid_sheet_id, system, deliverable, activity) and Postgres aborts a bulk
  // INSERT…ON CONFLICT DO UPDATE with "cannot affect row a second time" when
  // the same key appears more than once in a single statement. CSVs exported
  // from Excel often repeat the same combo (e.g. one (system, deliverable,
  // activity) listed in multiple groups). When that happens we sum the
  // budgeted hours so the imported total still matches the source file.
  const cellMap = new Map<
    string,
    { bid_sheet_id: string; bid_sheet_system_id: string; bid_sheet_deliverable_id: string; bid_sheet_activity_id: string; budgeted_hours: number }
  >()
  const skipped: Array<{ line: number; row: string; reason: string; hours: number }> = []
  let mergedDuplicates = 0
  // Track CSV vs imported hour totals so the UI can flag any discrepancy
  // between the source spreadsheet's total and what actually landed in the
  // matrix. Skipped rows contribute to csvHoursTotal but not to merged.
  let csvHoursTotal = 0

  for (const r of rows) {
    const hrs = Number(r.hours) || 0
    csvHoursTotal += hrs

    const sysId = await findOrCreateSystem(r.system || r.systemNumber, r.systemNumber)
    const delId = await findOrCreateDeliverable(r.deliverable)
    const actId = await findOrCreateActivity(r.activity)

    const missing: string[] = []
    if (!sysId) missing.push('system')
    if (!delId) missing.push('deliverable')
    if (!actId) missing.push('activity')
    if (missing.length > 0) {
      skipped.push({
        line: r.lineNumber,
        row: `${r.system || r.systemNumber || '(blank system)'} / ${r.deliverable || '(blank deliverable)'} / ${r.activity || '(blank activity)'}`,
        reason: `missing ${missing.join(', ')}`,
        hours: hrs,
      })
      continue
    }
    const cellKey = `${sysId}|${delId}|${actId}`
    const existing = cellMap.get(cellKey)
    if (existing) {
      existing.budgeted_hours += hrs
      mergedDuplicates += 1
    } else {
      cellMap.set(cellKey, {
        bid_sheet_id: id,
        bid_sheet_system_id: sysId,
        bid_sheet_deliverable_id: delId,
        bid_sheet_activity_id: actId,
        budgeted_hours: hrs,
      })
    }
  }

  const toInsert = [...cellMap.values()]

  if (toInsert.length > 0) {
    const { error } = await db.from('bid_sheet_items').upsert(toInsert, {
      onConflict: 'bid_sheet_id,bid_sheet_system_id,bid_sheet_deliverable_id,bid_sheet_activity_id',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const importedHoursTotal = toInsert.reduce((sum, r) => sum + (Number(r.budgeted_hours) || 0), 0)

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

  return NextResponse.json({
    inserted: toInsert.length,
    skipped: skipped.length,
    skippedRows: skipped,
    merged: mergedDuplicates,
    csvRowCount: rows.length,
    csvHoursTotal,
    importedHoursTotal,
  })
}
