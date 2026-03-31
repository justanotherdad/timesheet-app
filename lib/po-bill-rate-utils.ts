/**
 * Shared rules for po_bill_rates: effective_from_date / effective_to_date vs a week-ending date (YYYY-MM-DD).
 */

export function billRateAppliesToWeekEnding(
  row: { effective_from_date?: string | null; effective_to_date?: string | null },
  weekEnding: string
): boolean {
  const we = (weekEnding || '').slice(0, 10)
  const from = (row.effective_from_date || '').slice(0, 10)
  const to = row.effective_to_date ? String(row.effective_to_date).slice(0, 10) : ''
  if (!we) return false
  if (from && from > we) return false
  if (to && to < we) return false
  return true
}

/** Rate row is "active" for new work as of `asOfDate` (YYYY-MM-DD): started and not ended before asOf. */
export function billRateIsActiveOnDate(
  row: { effective_from_date?: string | null; effective_to_date?: string | null },
  asOfDate: string
): boolean {
  const d = (asOfDate || '').slice(0, 10)
  const from = (row.effective_from_date || '').slice(0, 10)
  const to = row.effective_to_date ? String(row.effective_to_date).slice(0, 10) : ''
  if (!d) return false
  if (from && from > d) return false
  if (to && to < d) return false
  return true
}

export function pickEffectiveRateForWeek<T extends { rate?: number; effective_from_date?: string | null }>(
  rows: T[],
  weekEnding: string
): number {
  const applicable = rows
    .filter((br: any) => billRateAppliesToWeekEnding(br, weekEnding))
    .sort((a: any, b: any) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )
  const r = applicable[0]?.rate
  return typeof r === 'number' && !Number.isNaN(r) ? r : 0
}
