/**
 * Shared helpers for project budget cost calculations.
 *
 * Extracted out of app/api/budget/[poId]/project-matrix/route.ts so the
 * "By system" and "By individual" tabs can reuse the exact same logic for
 *   • mapping a (system, deliverable, activity) cell to its bid-sheet line
 *     rate (used for Est. budget $ and ETC cost), and
 *   • computing the PO's blended labor rate (the fallback when no bid-sheet
 *     line exists for a cell).
 *
 * The existing matrix route also imports these so all three views agree.
 */

import { billRateIsActiveOnDate } from '@/lib/po-bill-rate-utils'
import {
  effectiveIndirectTreatAs,
  indirectActivityName,
  indirectLineDollarTotal,
  INDIRECT_SYSTEM_NAME,
  INDIRECT_DELIVERABLE_NAME,
} from '@/lib/bid-sheet-indirect'

const EPS = 1e-6

export type BillRateRow = {
  user_id: string
  rate: number
  effective_from_date?: string | null
  effective_to_date?: string | null
}

export type BidLineAgg = { hours: number; lineCost: number }

const nk = (s: string | null | undefined): string => (s ?? '').trim()

/**
 * Build the case-insensitive cell key used to match bid_sheet_items rows to
 * project_details rows after a conversion. Same shape both sides include
 * system code so two systems with the same name but different codes don't
 * collide.
 */
export function matrixMatchKey(
  sysName: string,
  sysCode: string | null | undefined,
  delName: string,
  actName: string
): string {
  return [nk(sysName), nk(sysCode ?? ''), nk(delName), nk(actName)].join('|').toLowerCase()
}

/**
 * Load the (hours, lineCost) aggregate per (system, deliverable, activity)
 * cell from the source bid sheet — i.e. the dollar amount that was actually
 * budgeted on the proposal. Activity-type indirect rows (PM, Doc Coord,
 * Project Controls, custom rows marked treatAs='activity') are folded in too
 * so their Est. budget $ uses the bid-sheet indirect dollars instead of the
 * fallback blended labor rate.
 *
 * Returns an empty map when the PO didn't come from a bid sheet conversion.
 */
export async function loadBidSheetLineCostMap(
  db: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  poId: string
): Promise<Map<string, BidLineAgg>> {
  const { data: sheet } = await db.from('bid_sheets').select('id').eq('converted_po_id', poId).maybeSingle()
  const sheetRow = sheet as { id?: string } | null
  if (!sheetRow?.id) return new Map()

  const { data: items, error: itemsErr } = await db
    .from('bid_sheet_items')
    .select(
      `
      budgeted_hours,
      labor_id,
      bid_sheet_systems (name, code),
      bid_sheet_deliverables (name),
      bid_sheet_activities (name)
    `
    )
    .eq('bid_sheet_id', sheetRow.id)

  if (itemsErr || !items?.length) return new Map()

  const laborIds = [
    ...new Set(
      (items as { labor_id?: string | null }[]).map((i) => i.labor_id).filter(Boolean)
    ),
  ] as string[]
  const { data: labRows } =
    laborIds.length > 0
      ? await db.from('bid_sheet_labor').select('id, bid_rate').in('id', laborIds)
      : { data: [] as { id: string; bid_rate?: number | null }[] }

  const rateByLabor = new Map<string, number>(
    (labRows || []).map((l: { id: string; bid_rate?: number | null }) => [l.id, Number(l.bid_rate) || 0])
  )

  const map = new Map<string, BidLineAgg>()
  for (const it of items as Array<Record<string, unknown>>) {
    const sys = it.bid_sheet_systems as { name?: string; code?: string | null } | null
    const del = it.bid_sheet_deliverables as { name?: string } | null
    const act = it.bid_sheet_activities as { name?: string } | null
    if (!sys?.name || !del?.name || !act?.name) continue
    const key = matrixMatchKey(sys.name, sys.code ?? null, del.name, act.name)
    const hrs = Number(it.budgeted_hours) || 0
    const rate = it.labor_id ? rateByLabor.get(it.labor_id as string) ?? 0 : 0
    const line = hrs * rate
    const cur = map.get(key) ?? { hours: 0, lineCost: 0 }
    cur.hours += hrs
    cur.lineCost += line
    map.set(key, cur)
  }

  // Fold activity-type indirect rows (PM / Doc Coord / Project Controls and
  // custom rows marked treatAs='activity') into the cost map under their
  // canonical "Indirect / Indirect / <activity>" key so their Est. budget $
  // uses bid-sheet indirect dollars instead of falling back to blended rate.
  const { data: indirectRows } = await db
    .from('bid_sheet_indirect_labor')
    .select('category, notes, hours, rate')
    .eq('bid_sheet_id', sheetRow.id)

  for (const row of (indirectRows || []) as Array<{
    category: string
    notes?: string | null
    hours?: number | null
    rate?: number | null
  }>) {
    if (effectiveIndirectTreatAs(row.category, row.notes) !== 'activity') continue
    const activityName = indirectActivityName(row.category, row.notes)
    const hours = Number(row.hours) || 0
    const lineCost = indirectLineDollarTotal(hours, Number(row.rate) || 0, row.category, row.notes)
    if (hours <= EPS || lineCost <= EPS) continue
    const key = matrixMatchKey(INDIRECT_SYSTEM_NAME, null, INDIRECT_DELIVERABLE_NAME, activityName)
    const cur = map.get(key) ?? { hours: 0, lineCost: 0 }
    cur.hours += hours
    cur.lineCost += lineCost
    map.set(key, cur)
  }

  return map
}

/**
 * Compute the PO's blended labor rate as of `asOf` (yyyy-mm-dd). One rate
 * per user — pick the most-recently-effective active rate for each, then
 * arithmetic mean across users. Used as the fallback Est. budget $ rate
 * for cells with no matching bid-sheet line.
 */
export function blendedBudgetRate(rows: BillRateRow[], asOf: string): number {
  const byUser = new Map<string, BillRateRow[]>()
  for (const r of rows) {
    if (!r.user_id) continue
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id)!.push(r)
  }
  let sum = 0
  let n = 0
  for (const [, userRows] of byUser) {
    const applicable = userRows.filter((br) => billRateIsActiveOnDate(br, asOf))
    if (applicable.length === 0) continue
    const best = [...applicable].sort((a, b) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )[0]
    sum += Number(best.rate) || 0
    n++
  }
  return n > 0 ? sum / n : 0
}

/** Sum the seven-day fields on a timesheet_entries-shaped row. */
export function sumEntryHours(e: Record<string, unknown>): number {
  const days = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const
  return days.reduce((s, k) => s + (Number(e[k]) || 0), 0)
}

/**
 * Per-cell budget cost: prefer the bid-sheet line rate (cost ÷ hours), fall
 * back to the PO blended rate when no bid-sheet line exists. Used by the
 * matrix and the By-system / By-individual tabs to keep all three in sync.
 */
export function effectiveLineRate(
  bidLine: BidLineAgg | undefined,
  blendedRate: number
): number {
  if (bidLine && bidLine.hours > EPS) return bidLine.lineCost / bidLine.hours
  return blendedRate
}
