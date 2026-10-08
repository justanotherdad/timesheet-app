import type { SupabaseClient } from '@supabase/supabase-js'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import type { LaborWeek } from '@/lib/labor-profit-math'

export type LaborTimeframe =
  | { kind: 'all' }
  | { kind: 'months'; months: string[] }
  | { kind: 'range'; start: string; end: string }

export type LaborFilters = {
  employeeType: 'all' | 'internal' | 'external'
  employeeIds: string[]
  clientIds: string[]
  poIds: string[]
  timeframe: LaborTimeframe
}

type Profile = { id: string; name: string; employeeType: 'internal' | 'external' }
type PoInfo = { id: string; poNumber: string; projectName: string; clientName: string }

const PAGE = 1000

function dayHours(row: Record<string, unknown>): number {
  return (
    (Number(row.mon_hours) || 0) +
    (Number(row.tue_hours) || 0) +
    (Number(row.wed_hours) || 0) +
    (Number(row.thu_hours) || 0) +
    (Number(row.fri_hours) || 0) +
    (Number(row.sat_hours) || 0) +
    (Number(row.sun_hours) || 0)
  )
}

function normDay(v: unknown): string {
  return String(v ?? '').trim().slice(0, 10)
}

async function pageAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data || []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export function parseLaborFilters(body: unknown): LaborFilters | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const employeeType = b.employeeType === 'internal' || b.employeeType === 'external' ? b.employeeType : 'all'
  const employeeIds = Array.isArray(b.employeeIds) ? b.employeeIds.filter((id) => typeof id === 'string') : []
  const clientIds = Array.isArray(b.clientIds) ? b.clientIds.filter((id) => typeof id === 'string') : []
  const poIds = Array.isArray(b.poIds) ? b.poIds.filter((id) => typeof id === 'string') : []
  const tf = b.timeframe
  if (!tf || typeof tf !== 'object') return null
  const kind = (tf as { kind?: string }).kind
  if (kind === 'all') return { employeeType, employeeIds, clientIds, poIds, timeframe: { kind: 'all' } }
  if (kind === 'months') {
    const months = Array.isArray((tf as { months?: unknown }).months)
      ? (tf as { months: unknown[] }).months.filter((m): m is string => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m))
      : []
    if (months.length === 0) return null
    return { employeeType, employeeIds, clientIds, poIds, timeframe: { kind: 'months', months } }
  }
  if (kind === 'range') {
    const start = String((tf as { start?: unknown }).start || '').slice(0, 10)
    const end = String((tf as { end?: unknown }).end || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return null
    return { employeeType, employeeIds, clientIds, poIds, timeframe: { kind: 'range', start, end } }
  }
  return null
}

export async function buildLaborWeeks(admin: SupabaseClient, filters: LaborFilters): Promise<LaborWeek[]> {
  const profiles = await pageAll<Record<string, unknown>>((from, to) =>
    admin
      .from('user_profiles')
      .select('id, name, role, employee_type')
      .neq('role', 'client')
      .order('id')
      .range(from, to)
  )

  const people = new Map<string, Profile>()
  for (const row of profiles) {
    const id = String(row.id)
    const employeeType = String(row.employee_type || 'internal') === 'external' ? 'external' : 'internal'
    if (filters.employeeType !== 'all' && employeeType !== filters.employeeType) continue
    if (filters.employeeIds.length > 0 && !filters.employeeIds.includes(id)) continue
    people.set(id, { id, name: String(row.name || 'Unknown'), employeeType })
  }
  if (people.size === 0) return []

  const poRows = await pageAll<Record<string, unknown>>((from, to) =>
    admin
      .from('purchase_orders')
      .select('id, po_number, project_name, description, site_id')
      .order('id')
      .range(from, to)
  )
  const siteRows = await pageAll<Record<string, unknown>>((from, to) =>
    admin.from('sites').select('id, name').order('id').range(from, to)
  )
  const siteName = new Map(siteRows.map((s) => [String(s.id), String(s.name || 'Unknown')]))

  const pos = new Map<string, PoInfo>()
  for (const row of poRows) {
    const id = String(row.id)
    if (filters.poIds.length > 0 && !filters.poIds.includes(id)) continue
    const siteId = String(row.site_id || '')
    if (filters.clientIds.length > 0 && !filters.clientIds.includes(siteId)) continue
    pos.set(id, {
      id,
      poNumber: String(row.po_number || '(no PO #)'),
      projectName: String(row.project_name || row.description || '').trim(),
      clientName: siteName.get(siteId) || 'Unknown',
    })
  }
  if (pos.size === 0) return []

  const rateRows = await pageAll<Record<string, unknown>>((from, to) =>
    admin
      .from('po_bill_rates')
      .select('po_id, user_id, rate, effective_from_date, effective_to_date')
      .order('po_id')
      .range(from, to)
  )
  const ratesByUserPo = new Map<string, Array<{ rate?: number | string | null; effective_from_date?: string | null; effective_to_date?: string | null }>>()
  for (const row of rateRows) {
    const poId = String(row.po_id || '')
    if (!pos.has(poId)) continue
    const key = `${row.user_id}|${poId}`
    const list = ratesByUserPo.get(key) || []
    list.push({
      rate: row.rate as number | string | null,
      effective_from_date: row.effective_from_date as string | null,
      effective_to_date: row.effective_to_date as string | null,
    })
    ratesByUserPo.set(key, list)
  }

  const monthSet =
    filters.timeframe.kind === 'months' ? new Set(filters.timeframe.months) : null
  let start: string | null = null
  let end: string | null = null
  if (filters.timeframe.kind === 'range') {
    start = filters.timeframe.start
    end = filters.timeframe.end
  } else if (filters.timeframe.kind === 'months') {
    const sorted = [...filters.timeframe.months].sort()
    start = `${sorted[0]}-01`
    const [y, m] = sorted[sorted.length - 1].split('-').map(Number)
    const last = new Date(y, m, 0)
    end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  }

  const timesheets = await pageAll<Record<string, unknown>>((from, to) => {
    let q: {
      gte: (col: string, val: string) => typeof q
      lte: (col: string, val: string) => typeof q
      range: (a: number, b: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
    } = admin
      .from('weekly_timesheets')
      .select('id, user_id, week_ending')
      .eq('status', 'approved')
      .order('id') as typeof q
    if (start) q = q.gte('week_ending', start)
    if (end) q = q.lte('week_ending', end)
    return q.range(from, to)
  })

  const sheetById = new Map<string, { userId: string; weekEnding: string }>()
  for (const row of timesheets) {
    const userId = String(row.user_id || '')
    if (!people.has(userId)) continue
    const weekEnding = normDay(row.week_ending)
    if (!weekEnding) continue
    if (monthSet && !monthSet.has(weekEnding.slice(0, 7))) continue
    sheetById.set(String(row.id), { userId, weekEnding })
  }

  const tsIds = [...sheetById.keys()]
  const hours = new Map<string, { userId: string; poId: string; weekEnding: string; hours: number }>()
  const CHUNK = 150
  for (let i = 0; i < tsIds.length; i += CHUNK) {
    const chunk = tsIds.slice(i, i + CHUNK)
    const entries = await pageAll<Record<string, unknown>>((from, to) =>
      admin
        .from('timesheet_entries')
        .select('id, timesheet_id, po_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
        .in('timesheet_id', chunk)
        .order('id')
        .range(from, to)
    )
    for (const entry of entries) {
      const poId = String(entry.po_id || '')
      if (!pos.has(poId)) continue
      const h = dayHours(entry)
      if (h <= 0) continue
      const sheet = sheetById.get(String(entry.timesheet_id))
      if (!sheet) continue
      const key = `${sheet.userId}|${poId}|${sheet.weekEnding}`
      const prev = hours.get(key)
      if (prev) prev.hours += h
      else hours.set(key, { userId: sheet.userId, poId, weekEnding: sheet.weekEnding, hours: h })
    }
  }

  const weeks: LaborWeek[] = []
  for (const row of hours.values()) {
    const person = people.get(row.userId)
    const po = pos.get(row.poId)
    if (!person || !po) continue
    const billRate = pickEffectiveRateForWeek(ratesByUserPo.get(`${row.userId}|${row.poId}`) || [], row.weekEnding)
    weeks.push({
      userId: person.id,
      userName: person.name,
      employeeType: person.employeeType,
      poId: po.id,
      poNumber: po.poNumber,
      projectName: po.projectName,
      clientName: po.clientName,
      weekEnding: row.weekEnding,
      hours: row.hours,
      billRate,
    })
  }

  weeks.sort((a, b) => {
    const name = a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' })
    if (name !== 0) return name
    const client = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
    if (client !== 0) return client
    const po = a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true, sensitivity: 'base' })
    if (po !== 0) return po
    return a.weekEnding.localeCompare(b.weekEnding)
  })
  return weeks
}
