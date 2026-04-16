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

function coerceBillRate(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Picks the PO bill rate for a week-ending date. Postgres / JSON may return `rate` as a string — always coerced.
 * If no row strictly covers the week (gap between effective_to and the next effective_from), falls back to the
 * latest rate with effective_from on or before that week so UI cost stays aligned with hours after rate edits.
 */
export function pickEffectiveRateForWeek<
  T extends {
    rate?: number | string | null
    effective_from_date?: string | null
    effective_to_date?: string | null
  }
>(rows: T[], weekEnding: string): number {
  const we = (weekEnding || '').slice(0, 10)
  if (!we) return 0

  const applicable = rows
    .filter((br: any) => billRateAppliesToWeekEnding(br, we))
    .sort((a: any, b: any) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )
  if (applicable.length > 0) {
    return coerceBillRate(applicable[0]?.rate)
  }

  const prior = rows
    .filter((br: any) => {
      const from = (br.effective_from_date || '').slice(0, 10)
      return from && from <= we
    })
    .sort((a: any, b: any) =>
      (b.effective_from_date || '').localeCompare(a.effective_from_date || '')
    )[0]
  return prior ? coerceBillRate(prior.rate) : 0
}
