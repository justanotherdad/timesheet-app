import type { SupabaseClient } from '@supabase/supabase-js'
import { getWeekEndingsForMonth } from '@/lib/utils'
import { pickEffectiveRateForWeek } from '@/lib/po-bill-rate-utils'
import type {
  ReportBillableActivitiesMonth,
  ReportBillableCostMonth,
} from '@/lib/generated-report'

type BillRateRow = {
  user_id: string
  rate?: number | string | null
  effective_from_date?: string | null
  effective_to_date?: string | null
}

function normWeekEnding(v: unknown): string {
  return String(v ?? '')
    .trim()
    .slice(0, 10)
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

/**
 * Distinct YYYY-MM months that have approved billable hours on any of the given POs.
 */
export async function listActivityMonthsForPos(
  admin: SupabaseClient,
  poIds: string[]
): Promise<string[]> {
  if (poIds.length === 0) return []

  // Pull approved timesheet weeks that have entries on these POs.
  // Strategy: load entry timesheet_ids for the POs (chunked + paged), then filter to approved.
  const entryTsIds = new Set<string>()
  const PO_CHUNK = 50
  const PAGE = 1000
  for (let i = 0; i < poIds.length; i += PO_CHUNK) {
    const poChunk = poIds.slice(i, i + PO_CHUNK)
    let from = 0
    for (;;) {
      const { data: entries } = await admin
        .from('timesheet_entries')
        .select('timesheet_id')
        .in('po_id', poChunk)
        .range(from, from + PAGE - 1)
      const rows = entries || []
      for (const e of rows) {
        const id = (e as { timesheet_id: string }).timesheet_id
        if (id) entryTsIds.add(id)
      }
      if (rows.length < PAGE) break
      from += PAGE
    }
  }

  const tsIds = [...entryTsIds]
  if (tsIds.length === 0) return []

  const months = new Set<string>()
  const CHUNK = 150
  for (let i = 0; i < tsIds.length; i += CHUNK) {
    const chunk = tsIds.slice(i, i + CHUNK)
    const { data: sheets } = await admin
      .from('weekly_timesheets')
      .select('id, week_ending, status')
      .in('id', chunk)
      .eq('status', 'approved')
    for (const ts of sheets || []) {
      const we = normWeekEnding((ts as { week_ending: string }).week_ending)
      if (!we || we.length < 7) continue
      months.add(we.slice(0, 7))
    }
  }

  return [...months].sort()
}

async function loadBillRatesForPo(admin: SupabaseClient, poId: string): Promise<BillRateRow[]> {
  const { data } = await admin
    .from('po_bill_rates')
    .select('user_id, rate, effective_from_date, effective_to_date')
    .eq('po_id', poId)
  return (data || []) as BillRateRow[]
}

/**
 * Build Billable Activities (hours) and/or Billable Cost ($) for one PO + month,
 * matching the budget screen employee × week-ending grids.
 */
export async function buildBillableTablesForPoMonth(
  admin: SupabaseClient,
  poId: string,
  monthKey: string,
  opts: { includeActivities: boolean; includeCost: boolean }
): Promise<{
  activities: ReportBillableActivitiesMonth | null
  cost: ReportBillableCostMonth | null
}> {
  if (!opts.includeActivities && !opts.includeCost) {
    return { activities: null, cost: null }
  }

  const parsed = parseMonthKey(monthKey)
  if (!parsed) return { activities: null, cost: null }
  const { year, month } = parsed

  const { data: po } = await admin.from('purchase_orders').select('site_id').eq('id', poId).single()
  if (!po) return { activities: null, cost: null }

  const { data: site } = await admin
    .from('sites')
    .select('week_starting_day')
    .eq('id', (po as { site_id: string }).site_id)
    .maybeSingle()
  const weekStartsOn = (site as { week_starting_day?: number } | null)?.week_starting_day ?? 1

  let weekEndings = getWeekEndingsForMonth(year, month, weekStartsOn).map(normWeekEnding)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startDate = firstDay.toISOString().split('T')[0]
  const endDate = lastDay.toISOString().split('T')[0]

  const { data: timesheets } = await admin
    .from('weekly_timesheets')
    .select('id, user_id, week_ending')
    .gte('week_ending', startDate)
    .lte('week_ending', endDate)
    .eq('status', 'approved')

  const tsIds = (timesheets || []).map((t) => (t as { id: string }).id)
  const entries: Array<Record<string, unknown>> = []
  const CHUNK = 150
  for (let i = 0; i < tsIds.length; i += CHUNK) {
    const chunk = tsIds.slice(i, i + CHUNK)
    const { data } = await admin
      .from('timesheet_entries')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
      .eq('po_id', poId)
      .in('timesheet_id', chunk)
    for (const row of data || []) entries.push(row as Record<string, unknown>)
  }

  const hoursByUserWeek: Record<string, Record<string, number>> = {}
  const weekSet = new Set<string>(weekEndings)

  for (const ts of timesheets || []) {
    const row = ts as { id: string; user_id: string; week_ending: string }
    const tsEntries = entries.filter((e) => e.timesheet_id === row.id)
    const totalHours = tsEntries.reduce((sum, e) => {
      return (
        sum +
        (Number(e.mon_hours) || 0) +
        (Number(e.tue_hours) || 0) +
        (Number(e.wed_hours) || 0) +
        (Number(e.thu_hours) || 0) +
        (Number(e.fri_hours) || 0) +
        (Number(e.sat_hours) || 0) +
        (Number(e.sun_hours) || 0)
      )
    }, 0)
    if (totalHours <= 0) continue
    const we = normWeekEnding(row.week_ending)
    if (!we) continue
    weekSet.add(we)
    if (!hoursByUserWeek[row.user_id]) hoursByUserWeek[row.user_id] = {}
    hoursByUserWeek[row.user_id][we] = (hoursByUserWeek[row.user_id][we] || 0) + totalHours
  }

  weekEndings = [...new Set([...weekEndings, ...Array.from(weekSet).map(normWeekEnding)])].sort()
  const userIds = Object.keys(hoursByUserWeek)

  // Skip empty months (no activity for this PO).
  if (userIds.length === 0) {
    return { activities: null, cost: null }
  }

  const { data: profiles } = await admin.from('user_profiles').select('id, name').in('id', userIds)
  const profileMap = new Map<string, string>()
  for (const p of profiles || []) {
    profileMap.set((p as { id: string }).id, (p as { name: string | null }).name || 'Unknown')
  }

  const label = monthLabel(year, month)

  let activities: ReportBillableActivitiesMonth | null = null
  if (opts.includeActivities) {
    const rows = userIds
      .map((uid) => {
        const weekHours: Record<string, number> = {}
        let rowTotal = 0
        for (const we of weekEndings) {
          const h = hoursByUserWeek[uid][we] || 0
          weekHours[we] = h
          rowTotal += h
        }
        return {
          userId: uid,
          userName: profileMap.get(uid) || 'Unknown',
          weekHours,
          rowTotal,
        }
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }))

    const columnTotals: Record<string, number> = {}
    for (const we of weekEndings) {
      columnTotals[we] = rows.reduce((sum, r) => sum + (r.weekHours[we] || 0), 0)
    }
    const grandTotal = rows.reduce((sum, r) => sum + r.rowTotal, 0)
    activities = { monthKey, monthLabel: label, weekEndings, rows, columnTotals, grandTotal }
  }

  let cost: ReportBillableCostMonth | null = null
  if (opts.includeCost) {
    const rates = await loadBillRatesForPo(admin, poId)
    const ratesByUser = new Map<string, BillRateRow[]>()
    for (const r of rates) {
      if (!ratesByUser.has(r.user_id)) ratesByUser.set(r.user_id, [])
      ratesByUser.get(r.user_id)!.push(r)
    }

    const rows = userIds
      .map((uid) => {
        const userRates = ratesByUser.get(uid) || []
        const weekCosts: Record<string, number> = {}
        let rowTotal = 0
        for (const we of weekEndings) {
          const h = hoursByUserWeek[uid][we] || 0
          const rate = pickEffectiveRateForWeek(userRates, we)
          const dollars = h * rate
          weekCosts[we] = dollars
          rowTotal += dollars
        }
        return {
          userId: uid,
          userName: profileMap.get(uid) || 'Unknown',
          weekCosts,
          rowTotal,
        }
      })
      .sort((a, b) => a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' }))

    const columnTotals: Record<string, number> = {}
    for (const we of weekEndings) {
      columnTotals[we] = rows.reduce((sum, r) => sum + (r.weekCosts[we] || 0), 0)
    }
    const grandTotal = rows.reduce((sum, r) => sum + r.rowTotal, 0)
    cost = { monthKey, monthLabel: label, weekEndings, rows, columnTotals, grandTotal }
  }

  return { activities, cost }
}
