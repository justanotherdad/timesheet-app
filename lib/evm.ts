/**
 * Earned Value Management (EVM) calculations used by the
 * "By system" tab of the project budget screen.
 *
 * Conventions
 * -----------
 *   • status_pct is stored as a fraction in [0, 1] (so 50% = 0.5)
 *   • Auto status (when no manual override is set) = clamp(actual_hours / budget_hours, 0, 1)
 *   • Earned Value (EV) = effective_status × budget_cost
 *   • ETC (Estimate To Complete) hours = (1 − effective_status) × budget_hours
 *   • ETC cost = ETC hours × bid line rate
 *   • CPI (Cost Performance Index) = EV / actual_cost  (undefined when actual_cost = 0)
 *
 * The "bid line rate" is the per-hour rate from the original bid sheet item:
 *   bidLineCost / bidLineHours.  When no bid line exists for a cell, callers
 *   fall back to the PO's blended labor rate (same fallback the matrix uses
 *   for Est. budget $).
 */

export type EvmCellInput = {
  /** Hours budgeted for this matrix cell (project_details.budgeted_hours). */
  budgetHours: number
  /** $ budgeted for this cell — usually budgetHours × bid line rate. */
  budgetCost: number
  /** Sum of approved-timesheet hours that landed on this cell. */
  actualHours: number
  /** Sum of (entry hours × user effective rate per week) for this cell. */
  actualCost: number
  /**
   * Per-hour rate to use for ETC cost. Should be the bid-sheet line rate when
   * available; otherwise the PO blended rate.
   */
  rate: number
  /**
   * Manual completion override stored on project_details.status_pct, as a
   * fraction in [0, 1]. NULL/undefined means "auto-compute from actuals".
   */
  manualStatusPct: number | null | undefined
}

export type EvmCellResult = {
  budgetHours: number
  budgetCost: number
  actualHours: number
  actualCost: number
  /** Effective completion as a fraction in [0, 1]. */
  statusPct: number
  /** True when the effective status came from a manual override. */
  isManualStatus: boolean
  /** What the auto formula would yield given current actuals/budget. */
  autoStatusPct: number
  etcHours: number
  etcCost: number
  /** Earned Value in dollars. */
  ev: number
  /**
   * Cost Performance Index = ev / actualCost. NULL when actualCost is 0
   * (a defined CPI requires actuals to compare against).
   */
  cpi: number | null
}

const EPS = 1e-6

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function safeDiv(a: number, b: number): number {
  if (Math.abs(b) <= EPS) return 0
  return a / b
}

/**
 * Compute auto status as actual_hours / budget_hours, clamped to [0, 1].
 * When budget_hours is zero we treat status as 0 (no plan to compare against).
 */
export function autoStatusPct(actualHours: number, budgetHours: number): number {
  if (budgetHours <= EPS) return 0
  return clamp01(actualHours / budgetHours)
}

/**
 * Resolve the effective status: manual override when set, otherwise auto.
 * Returns the effective fraction and a flag indicating which path was used.
 */
export function effectiveStatusPct(
  manualStatusPct: number | null | undefined,
  actualHours: number,
  budgetHours: number
): { statusPct: number; isManual: boolean; autoStatusPct: number } {
  const auto = autoStatusPct(actualHours, budgetHours)
  if (manualStatusPct == null) {
    return { statusPct: auto, isManual: false, autoStatusPct: auto }
  }
  return { statusPct: clamp01(Number(manualStatusPct)), isManual: true, autoStatusPct: auto }
}

/**
 * Run the full EVM math for a single matrix cell. All inputs are expected to
 * already reflect the same time window (e.g. all approved timesheets to date).
 */
export function computeCellEvm(input: EvmCellInput): EvmCellResult {
  const budgetHours = Math.max(0, Number(input.budgetHours) || 0)
  const budgetCost = Math.max(0, Number(input.budgetCost) || 0)
  const actualHours = Math.max(0, Number(input.actualHours) || 0)
  const actualCost = Math.max(0, Number(input.actualCost) || 0)
  const rate = Math.max(0, Number(input.rate) || 0)

  const status = effectiveStatusPct(input.manualStatusPct, actualHours, budgetHours)
  const etcHours = Math.max(0, (1 - status.statusPct) * budgetHours)
  const etcCost = etcHours * rate
  const ev = status.statusPct * budgetCost
  const cpi = actualCost > EPS ? safeDiv(ev, actualCost) : null

  return {
    budgetHours,
    budgetCost,
    actualHours,
    actualCost,
    statusPct: status.statusPct,
    isManualStatus: status.isManual,
    autoStatusPct: status.autoStatusPct,
    etcHours,
    etcCost,
    ev,
    cpi,
  }
}

/**
 * Sum a collection of cell results into a system / project rollup.
 * The rolled-up status_pct is a *budget-weighted* average of the cell statuses,
 * which equals (Σ ev / Σ budget_cost) — the standard EVM definition.
 */
export function rollupEvm(cells: EvmCellResult[]): EvmCellResult {
  let budgetHours = 0
  let budgetCost = 0
  let actualHours = 0
  let actualCost = 0
  let etcHours = 0
  let etcCost = 0
  let ev = 0
  for (const c of cells) {
    budgetHours += c.budgetHours
    budgetCost += c.budgetCost
    actualHours += c.actualHours
    actualCost += c.actualCost
    etcHours += c.etcHours
    etcCost += c.etcCost
    ev += c.ev
  }
  const statusPct = budgetCost > EPS ? clamp01(ev / budgetCost) : 0
  const cpi = actualCost > EPS ? safeDiv(ev, actualCost) : null
  return {
    budgetHours,
    budgetCost,
    actualHours,
    actualCost,
    statusPct,
    isManualStatus: false,
    autoStatusPct: statusPct,
    etcHours,
    etcCost,
    ev,
    cpi,
  }
}
