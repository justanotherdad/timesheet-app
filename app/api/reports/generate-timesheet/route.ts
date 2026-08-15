import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { getTimesheetReportEmployees } from '@/lib/timesheet-report-employees'
import type { TimesheetReportRow, TimesheetReportSnapshot } from '@/lib/generated-report'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/
const IN_CHUNK = 150

function parseWeekEndings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && WEEK_RE.test(x)))].sort()
}

function isTimesheetSnapshot(value: unknown): value is TimesheetReportSnapshot {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as TimesheetReportSnapshot).kind === 'timesheet' &&
    Array.isArray((value as TimesheetReportSnapshot).rows) &&
    Array.isArray((value as TimesheetReportSnapshot).weekEndings)
  )
}

async function fetchTimesheetsForUsers(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  weekEndings: string[]
) {
  type TsRow = {
    id: string
    user_id: string
    week_ending: string
    status: string
    created_at: string | null
    approved_at: string | null
  }
  const out: TsRow[] = []
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK)
    const { data, error } = await admin
      .from('weekly_timesheets')
      .select('id, user_id, week_ending, status, created_at, approved_at')
      .in('user_id', chunk)
      .in('week_ending', weekEndings)
    if (error) throw new Error(error.message)
    if (data) out.push(...(data as TsRow[]))
  }
  return out
}

function defaultTitle(weekEndings: string[]): string {
  const n = weekEndings.length
  if (n === 1) return `Timesheet Report — week ending ${weekEndings[0]}`
  return `Timesheet Report — ${n} week endings (${new Date().toLocaleDateString('en-US')})`
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.profile.role
  if (!['manager', 'admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const save = body.save === true
  const titleInput = typeof body.title === 'string' ? body.title.trim() : ''

  // Save a previously generated live snapshot without recomputing.
  if (save && isTimesheetSnapshot(body.snapshot)) {
    const snapshot = body.snapshot
    const title = titleInput || defaultTitle(snapshot.weekEndings)
    const { data: inserted, error: insertErr } = await admin
      .from('generated_reports')
      .insert({
        title,
        created_by: user.id,
        created_by_name: snapshot.generatedByName,
        include_hours: false,
        report_type: 'timesheet',
        po_ids: [],
        po_numbers: [],
        project_names: [],
        client_names: [],
        snapshot,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return NextResponse.json({ error: insertErr?.message || 'Failed to save report' }, { status: 500 })
    }
    return NextResponse.json({ id: (inserted as { id: string }).id, snapshot, title, saved: true })
  }

  const weekEndings = parseWeekEndings(body.weekEndings)
  if (weekEndings.length === 0) {
    return NextResponse.json({ error: 'Select at least one week ending.' }, { status: 400 })
  }

  const employees = await getTimesheetReportEmployees(admin, user.profile)
  const timesheets =
    employees.length === 0 ? [] : await fetchTimesheetsForUsers(admin, employees.map((e) => e.id), weekEndings)

  const byUserWeek = new Map<string, typeof timesheets>()
  for (const ts of timesheets) {
    const key = `${ts.user_id}__${ts.week_ending}`
    const list = byUserWeek.get(key) || []
    list.push(ts)
    byUserWeek.set(key, list)
  }

  const rows: TimesheetReportRow[] = []
  for (const emp of employees) {
    for (const weekEnding of weekEndings) {
      const sheets = byUserWeek.get(`${emp.id}__${weekEnding}`) || []
      if (sheets.length === 0) {
        rows.push({
          timesheetId: null,
          userId: emp.id,
          employeeName: emp.name,
          employeeType: emp.employeeType,
          weekEnding,
          status: 'not_created',
          createdAt: null,
          approvedAt: null,
        })
        continue
      }
      sheets.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      for (const ts of sheets) {
        const status = ts.status
        rows.push({
          timesheetId: ts.id,
          userId: emp.id,
          employeeName: emp.name,
          employeeType: emp.employeeType,
          weekEnding,
          status:
            status === 'draft' || status === 'submitted' || status === 'approved' || status === 'rejected'
              ? status
              : 'draft',
          createdAt: ts.created_at,
          approvedAt: ts.approved_at,
        })
      }
    }
  }

  const snapshot: TimesheetReportSnapshot = {
    kind: 'timesheet',
    generatedAt: new Date().toISOString(),
    generatedByName: user.profile.name || user.profile.email || 'Unknown',
    weekEndings,
    rows,
  }
  const title = titleInput || defaultTitle(weekEndings)

  if (!save) {
    return NextResponse.json({ snapshot, title, saved: false })
  }

  const { data: inserted, error: insertErr } = await admin
    .from('generated_reports')
    .insert({
      title,
      created_by: user.id,
      created_by_name: snapshot.generatedByName,
      include_hours: false,
      report_type: 'timesheet',
      po_ids: [],
      po_numbers: [],
      project_names: [],
      client_names: [],
      snapshot,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message || 'Failed to save report' }, { status: 500 })
  }

  return NextResponse.json({ id: (inserted as { id: string }).id, snapshot, title, saved: true })
}
