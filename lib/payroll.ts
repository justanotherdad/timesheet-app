import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Payroll earning-type configuration. One row per earning type (Regular,
 * Holiday, PTO, etc.). Drives both the unbillable "Description" dropdown on the
 * timesheet and the payroll export/view allocation.
 *
 * Column meanings mirror the Payroll tab in Manage Organization (see the
 * add_payroll_earning_types.sql migration for the canonical descriptions).
 */
export interface PayrollEarningType {
  id: string
  earning_type: string
  det: string | null
  detcode: string | null
  /** 'Billable' | 'Unbillable' — which area of the timesheet to look in. */
  area: string | null
  /** 'Y' | 'N' — does the unbillable Description field offer this as a choice. */
  dropdown: string | null
  /** '' | 'PTO' | 'Internal' | 'Holiday' — which unbillable row the dropdown lives in. */
  where_value: string | null
  /** 'Y' | 'N' — can these hours push the week over 40 combined. */
  overtime: string | null
  /** '' | "can't go over" | 'can go over' | 'up to' | 'over' */
  rule: string | null
  rule_value: string | null
  /** '' | 'billable' | 'unbillable' | 'billable & unbillable' */
  looks_at: string | null
  sort_order: number
  created_at?: string
  updated_at?: string
}

export const PAYROLL_AREA_OPTIONS = ['Billable', 'Unbillable'] as const
export const PAYROLL_DROPDOWN_OPTIONS = ['Y', 'N'] as const
export const PAYROLL_WHERE_OPTIONS = ['', 'PTO', 'Internal', 'Holiday'] as const
export const PAYROLL_OVERTIME_OPTIONS = ['Y', 'N'] as const
export const PAYROLL_RULE_OPTIONS = ['', "can't go over", 'can go over', 'up to', 'over'] as const
export const PAYROLL_LOOKS_AT_OPTIONS = ['', 'billable', 'unbillable', 'billable & unbillable'] as const

/** Text columns are free-text inputs; the rest are dropdowns. */
export const PAYROLL_TEXT_FIELDS = ['earning_type', 'det', 'detcode', 'rule_value'] as const

export interface PayrollColumnDef {
  key: keyof PayrollEarningType
  label: string
  kind: 'text' | 'dropdown'
  options?: readonly string[]
}

export const PAYROLL_COLUMNS: PayrollColumnDef[] = [
  { key: 'earning_type', label: 'Earning Type', kind: 'text' },
  { key: 'det', label: 'DET', kind: 'text' },
  { key: 'detcode', label: 'DETCODE', kind: 'text' },
  { key: 'area', label: 'Area', kind: 'dropdown', options: PAYROLL_AREA_OPTIONS },
  { key: 'dropdown', label: 'Dropdown', kind: 'dropdown', options: PAYROLL_DROPDOWN_OPTIONS },
  { key: 'where_value', label: 'Where', kind: 'dropdown', options: PAYROLL_WHERE_OPTIONS },
  { key: 'overtime', label: 'Overtime', kind: 'dropdown', options: PAYROLL_OVERTIME_OPTIONS },
  { key: 'rule', label: 'Rule', kind: 'dropdown', options: PAYROLL_RULE_OPTIONS },
  { key: 'rule_value', label: 'Value', kind: 'text' },
  { key: 'looks_at', label: 'Looks at', kind: 'dropdown', options: PAYROLL_LOOKS_AT_OPTIONS },
]

/** Field guide shown on Manage Organization → Payroll. */
export const PAYROLL_FIELD_HELP: { label: string; text: string }[] = [
  {
    label: 'Earning Type',
    text: 'Name on the payroll CSV. When Dropdown is Y, this is also the Description choice on the timesheet.',
  },
  {
    label: 'DET / DETCODE',
    text: 'Values written to the payroll export for this earning type.',
  },
  {
    label: 'Area',
    text: 'Billable or Unbillable section of the timesheet this type comes from.',
  },
  {
    label: 'Dropdown',
    text: 'Y = offer this name in the unbillable Description list for the Type in Where.',
  },
  {
    label: 'Where',
    text: 'Which unbillable Type row (Internal, PTO, or Holiday) the Description lives on. Export maps that Type + Description to this earning type (e.g. Internal + Bereavement → BRVMT).',
  },
  {
    label: 'Overtime',
    text: 'Y = these hours may push the week past the Regular cap. N = they stay on this earning type and do not become Incentive Time.',
  },
  {
    label: 'Rule / Value',
    text: 'Regular uses “up to” (usually 40) on billable hours plus Internal hours that did not match an earning type. Incentive Time uses “over” that same threshold. Leave types keep their entered hours.',
  },
  {
    label: 'Looks at',
    text: 'Which hours feed Regular / Incentive: billable, unbillable, or both. Unmatched Internal hours still count as Regular.',
  },
]

/** The unbillable timesheet row types, matching timesheet_unbillable.description. */
export type UnbillableType = 'HOLIDAY' | 'INTERNAL' | 'PTO'

/**
 * Options for the unbillable "Description" dropdown for a given row type.
 * These are the earning types flagged with dropdown = 'Y' whose Where value
 * matches the row type (e.g. the PTO row offers Bereavement / Comp Time /
 * Jury Duty / Paid Time Off). Employees may still type a free-form value.
 */
export function dropdownOptionsForUnbillableType(
  config: PayrollEarningType[],
  type: UnbillableType
): string[] {
  const where = type === 'HOLIDAY' ? 'Holiday' : type === 'INTERNAL' ? 'Internal' : 'PTO'
  return config
    .filter((c) => (c.dropdown || '').toUpperCase() === 'Y')
    .filter((c) => (c.where_value || '').toLowerCase() === where.toLowerCase())
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => c.earning_type)
    .filter(Boolean)
}

export interface PayrollAllocationInput {
  /** Total billable hours on the week (sum of all billable entries). */
  billableHours: number
  /** Unbillable rows: type + the selected/typed Description + hours. */
  unbillable: Array<{ type: UnbillableType; description?: string | null; hours: number }>
}

export interface PayrollAllocationRow {
  earning_type: string
  det: string
  detcode: string
  hours: number
}

function num(v: string | null | undefined, fallback: number): number {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

function findReg(config: PayrollEarningType[]): PayrollEarningType | undefined {
  return config.find(
    (c) => (c.rule || '').toLowerCase() === 'up to' && (c.area || '').toLowerCase() === 'billable'
  )
}
function findOver(config: PayrollEarningType[]): PayrollEarningType | undefined {
  return config.find(
    (c) => (c.rule || '').toLowerCase() === 'over' && (c.area || '').toLowerCase() === 'billable'
  )
}

function whereLabelForType(type: UnbillableType): string {
  return type === 'HOLIDAY' ? 'holiday' : type === 'INTERNAL' ? 'internal' : 'pto'
}

/** Earning type whose name matches Description and whose Where matches the timesheet row type. */
function findEarningByDescription(
  config: PayrollEarningType[],
  type: UnbillableType,
  description: string | null | undefined
): PayrollEarningType | undefined {
  const desc = (description || '').trim().toLowerCase()
  if (!desc) return undefined
  const where = whereLabelForType(type)
  return config.find(
    (c) =>
      (c.earning_type || '').trim().toLowerCase() === desc &&
      (c.where_value || '').trim().toLowerCase() === where
  )
}

/**
 * Allocate a single employee-week into payroll rows using the configured
 * earning types.
 *
 * Documented rules (driven by the Payroll config table):
 *  - Regular (rule "up to" N, area Billable): billable hours plus INTERNAL
 *    hours that did not match an earning type (blank/unmatched description).
 *  - Incentive/overtime (rule "over" N, area Billable): those same hours beyond N.
 *  - INTERNAL rows whose Description matches an earning type with Where =
 *    Internal (e.g. Bereavement, Jury Duty) export as that DETCODE, not Regular.
 *  - Holiday: emitted as entered under its detcode (overtime allowed).
 *  - PTO rows: mapped to the earning type whose name matches the row's
 *    Description (and Where = PTO when set); if blank/unmatched, defaults to
 *    Paid Time Off (PTO). Leave hours are not silently dropped by the
 *    "can't go over 40" cap.
 *
 * Only rows with hours > 0 are returned.
 */
export function allocatePayrollRows(
  config: PayrollEarningType[],
  input: PayrollAllocationInput
): PayrollAllocationRow[] {
  const out = new Map<string, PayrollAllocationRow>()
  const add = (et: PayrollEarningType | undefined, hours: number, fallbackName?: string) => {
    if (hours <= 0) return
    const detcode = et?.detcode?.trim() || ''
    const key = detcode || (et?.earning_type || fallbackName || 'UNKNOWN')
    const existing = out.get(key)
    if (existing) {
      existing.hours += hours
    } else {
      out.set(key, {
        earning_type: et?.earning_type || fallbackName || 'Unknown',
        det: et?.det?.trim() || '',
        detcode,
        hours,
      })
    }
  }

  const reg = findReg(config)
  const over = findOver(config)
  const regThreshold = num(reg?.rule_value, 40)
  const overThreshold = num(over?.rule_value, 40)

  const mappedInternal: Array<{ et: PayrollEarningType; hours: number }> = []
  let unmatchedInternal = 0
  for (const row of input.unbillable) {
    if (row.type !== 'INTERNAL') continue
    const hours = Number(row.hours) || 0
    if (hours <= 0) continue
    const et = findEarningByDescription(config, 'INTERNAL', row.description)
    if (et) mappedInternal.push({ et, hours })
    else unmatchedInternal += hours
  }

  const workedHours = (Number(input.billableHours) || 0) + unmatchedInternal

  add(reg, Math.min(workedHours, regThreshold), 'Regular Hours')
  if (over) add(over, Math.max(workedHours - overThreshold, 0), 'Incentive Time')
  for (const { et, hours } of mappedInternal) add(et, hours)

  for (const row of input.unbillable) {
    const hours = Number(row.hours) || 0
    if (hours <= 0) continue
    if (row.type === 'INTERNAL') continue

    if (row.type === 'HOLIDAY') {
      const hol =
        findEarningByDescription(config, 'HOLIDAY', row.description) ||
        config.find((c) => (c.where_value || '').toLowerCase() === 'holiday') ||
        config.find((c) => (c.detcode || '').toUpperCase() === 'HOL') ||
        config.find((c) => (c.earning_type || '').toLowerCase() === 'holiday')
      add(hol, hours, 'Holiday')
      continue
    }

    // PTO row: map by Description + Where=PTO, else name-only, else default PTO.
    const desc = (row.description || '').trim().toLowerCase()
    let et: PayrollEarningType | undefined = findEarningByDescription(config, 'PTO', row.description)
    if (!et && desc) {
      et = config.find((c) => (c.earning_type || '').trim().toLowerCase() === desc)
    }
    if (!et) {
      et =
        config.find((c) => (c.detcode || '').toUpperCase() === 'PTO') ||
        config.find((c) => (c.earning_type || '').toLowerCase() === 'paid time off')
    }
    add(et, hours, 'Paid Time Off')
  }

  return [...out.values()].filter((r) => r.hours > 0)
}

/**
 * Build the unbillable "Description" dropdown options map (keyed by row type)
 * for the timesheet form, from the org-wide payroll config.
 */
export async function loadUnbillableDescriptionOptions(): Promise<
  Record<UnbillableType, string[]>
> {
  const config = await loadPayrollConfig()
  return {
    HOLIDAY: dropdownOptionsForUnbillableType(config, 'HOLIDAY'),
    INTERNAL: dropdownOptionsForUnbillableType(config, 'INTERNAL'),
    PTO: dropdownOptionsForUnbillableType(config, 'PTO'),
  }
}

/** Load the org-wide payroll earning-type config, ordered for display. */
export async function loadPayrollConfig(): Promise<PayrollEarningType[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('payroll_earning_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('earning_type', { ascending: true })
    return (data || []) as PayrollEarningType[]
  } catch {
    return []
  }
}

export interface PayrollAuditEntry {
  id: string
  earning_type_id: string | null
  actor_id: string
  actor_name: string | null
  description: string
  created_at: string
}

/** Fire-and-forget audit log entry for a payroll config change. */
export async function logPayrollAudit(params: {
  earningTypeId: string | null
  actorId: string
  actorName?: string | null
  description: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('payroll_earning_type_audit').insert({
      earning_type_id: params.earningTypeId,
      actor_id: params.actorId,
      actor_name: params.actorName ?? null,
      description: params.description,
    })
  } catch (err) {
    console.error('[payroll-audit] Failed to log:', err)
  }
}

/* ------------------------------------------------------------------ */
/* Payroll export / view aggregation (#12)                            */
/* ------------------------------------------------------------------ */

const DAY_FIELDS = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const

/** PostgREST URL/filter length limit — keep `.in()` lists under this size. */
const IN_CHUNK = 150
/** Default PostgREST max rows; unpaged selects silently stop here. */
const PAGE_SIZE = 1000

async function fetchAllPages<T>(
  runPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await runPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return out
}

async function fetchInIdChunks<T>(
  ids: string[],
  runChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...(await runChunk(ids.slice(i, i + IN_CHUNK))))
  }
  return out
}

function sumDays(row: Record<string, unknown>): number {
  return DAY_FIELDS.reduce((s, f) => s + (Number(row[f]) || 0), 0)
}

/**
 * Return the subset of the given user IDs whose employee_type is 'internal'.
 * Payroll export/view only includes internal employees; external resources are
 * excluded. Users with a null/unset type are treated as internal (matches the
 * default elsewhere in the app).
 */
async function loadInternalUserIds(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const internal = new Set<string>()
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK)
    const { data } = await admin.from('user_profiles').select('id, employee_type').in('id', chunk)
    for (const p of (data || []) as Array<{ id: string; employee_type: string | null }>) {
      const type = (p.employee_type || 'internal').toLowerCase()
      if (type === 'internal') internal.add(p.id)
    }
  }
  return internal
}

export interface PayrollWeekSummary {
  weekEnding: string
  billableHours: number
  unbillableHours: number
  totalHours: number
  employeeCount: number
}

export interface PayrollDetailRow {
  weekEnding: string
  userId: string
  employeeName: string
  employeeId: string
  earningType: string
  det: string
  detcode: string
  hours: number
}

/**
 * List week endings (most recent first) with billable / non-billable / total
 * hours summed across ALL approved timesheets in each week.
 */
export async function listPayrollWeeks(): Promise<PayrollWeekSummary[]> {
  const admin = createAdminClient()
  const timesheets = await fetchAllPages<{ id: string; user_id: string; week_ending: string }>((from, to) =>
    admin
      .from('weekly_timesheets')
      .select('id, user_id, week_ending, status')
      .eq('status', 'approved')
      .order('week_ending', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  )

  let tsList = timesheets
  if (tsList.length === 0) return []

  // Payroll only covers internal employees.
  const internalIds = await loadInternalUserIds(admin, [...new Set(tsList.map((t) => t.user_id))])
  tsList = tsList.filter((t) => internalIds.has(t.user_id))
  if (tsList.length === 0) return []

  const tsIds = tsList.map((t) => t.id)
  const hourSelect =
    'id, timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
  const [billable, unbillable] = await Promise.all([
    fetchInIdChunks(tsIds, (chunk) =>
      fetchAllPages<Record<string, unknown>>((from, to) =>
        admin
          .from('timesheet_entries')
          .select(hourSelect)
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      )
    ),
    fetchInIdChunks(tsIds, (chunk) =>
      fetchAllPages<Record<string, unknown>>((from, to) =>
        admin
          .from('timesheet_unbillable')
          .select(hourSelect)
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      )
    ),
  ])

  const billableByTs = new Map<string, number>()
  for (const r of (billable || []) as Array<Record<string, unknown>>) {
    const id = String(r.timesheet_id)
    billableByTs.set(id, (billableByTs.get(id) || 0) + sumDays(r))
  }
  const unbillableByTs = new Map<string, number>()
  for (const r of (unbillable || []) as Array<Record<string, unknown>>) {
    const id = String(r.timesheet_id)
    unbillableByTs.set(id, (unbillableByTs.get(id) || 0) + sumDays(r))
  }

  const byWeek = new Map<string, PayrollWeekSummary & { users: Set<string> }>()
  for (const ts of tsList) {
    const we = String(ts.week_ending).slice(0, 10)
    const cur = byWeek.get(we) || {
      weekEnding: we,
      billableHours: 0,
      unbillableHours: 0,
      totalHours: 0,
      employeeCount: 0,
      users: new Set<string>(),
    }
    cur.billableHours += billableByTs.get(ts.id) || 0
    cur.unbillableHours += unbillableByTs.get(ts.id) || 0
    cur.users.add(ts.user_id)
    byWeek.set(we, cur)
  }

  return [...byWeek.values()]
    .map((w) => ({
      weekEnding: w.weekEnding,
      billableHours: w.billableHours,
      unbillableHours: w.unbillableHours,
      totalHours: w.billableHours + w.unbillableHours,
      employeeCount: w.users.size,
    }))
    .sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))
}

/**
 * Build the detailed payroll rows for a single week ending: one row per
 * employee per applicable earning type, following the payroll config rules.
 */
export async function aggregatePayrollForWeek(weekEnding: string): Promise<PayrollDetailRow[]> {
  return aggregatePayrollForWeeks([weekEnding])
}

/**
 * Build the detailed payroll rows across one or more week endings: one row per
 * employee per applicable earning type **per week**, following the payroll
 * config rules.
 *
 * Allocation is computed independently for each (employee, week) pair so the
 * "up to 40 / over 40" rules apply to each week on its own — combining weeks
 * would incorrectly cap or shift hours.
 */
export async function aggregatePayrollForWeeks(weekEndings: string[]): Promise<PayrollDetailRow[]> {
  const weeks = [...new Set((weekEndings || []).map((w) => String(w).slice(0, 10)).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w)))]
  if (weeks.length === 0) return []

  const admin = createAdminClient()
  const config = await loadPayrollConfig()

  const tsList = (
    await fetchInIdChunks(weeks, (chunk) =>
      fetchAllPages<{ id: string; user_id: string; week_ending: string }>((from, to) =>
        admin
          .from('weekly_timesheets')
          .select('id, user_id, week_ending')
          .eq('status', 'approved')
          .in('week_ending', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      )
    )
  ).filter(Boolean)
  if (tsList.length === 0) return []

  // Payroll only covers internal employees.
  const internalIds = await loadInternalUserIds(admin, [...new Set(tsList.map((t) => t.user_id))])
  const internalTs = tsList.filter((t) => internalIds.has(t.user_id))
  if (internalTs.length === 0) return []

  const tsIds = internalTs.map((t) => t.id)
  const userIds = [...new Set(internalTs.map((t) => t.user_id))]

  const [billable, unbillable, profiles] = await Promise.all([
    fetchInIdChunks(tsIds, (chunk) =>
      fetchAllPages<Record<string, unknown>>((from, to) =>
        admin
          .from('timesheet_entries')
          .select('id, timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      )
    ),
    fetchInIdChunks(tsIds, (chunk) =>
      fetchAllPages<Record<string, unknown>>((from, to) =>
        admin
          .from('timesheet_unbillable')
          .select('id, timesheet_id, description, notes, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours')
          .in('timesheet_id', chunk)
          .order('id', { ascending: true })
          .range(from, to)
      )
    ),
    fetchInIdChunks(userIds, async (chunk) => {
      const { data } = await admin.from('user_profiles').select('id, name, employee_id').in('id', chunk)
      return (data || []) as Array<{ id: string; name: string; employee_id: string | null }>
    }),
  ])

  const profileById = new Map<string, { name: string; employee_id: string | null }>()
  for (const p of profiles) {
    profileById.set(p.id, { name: p.name, employee_id: p.employee_id })
  }

  // timesheet_id -> { userId, week } so we can group allocation per employee per week.
  const tsToUserWeek = new Map<string, { uid: string; week: string }>()
  for (const t of internalTs) tsToUserWeek.set(t.id, { uid: t.user_id, week: String(t.week_ending).slice(0, 10) })

  const groupKey = (uid: string, week: string) => `${uid}|${week}`

  // Accumulate per (user, week) billable totals and unbillable rows.
  const billableByGroup = new Map<string, number>()
  for (const r of (billable || []) as Array<Record<string, unknown>>) {
    const g = tsToUserWeek.get(String(r.timesheet_id))
    if (!g) continue
    const key = groupKey(g.uid, g.week)
    billableByGroup.set(key, (billableByGroup.get(key) || 0) + sumDays(r))
  }
  const unbillableByGroup = new Map<string, Array<{ type: UnbillableType; description?: string | null; hours: number }>>()
  for (const r of (unbillable || []) as Array<Record<string, unknown>>) {
    const g = tsToUserWeek.get(String(r.timesheet_id))
    if (!g) continue
    const key = groupKey(g.uid, g.week)
    const list = unbillableByGroup.get(key) || []
    list.push({
      type: (String(r.description || 'INTERNAL').toUpperCase() as UnbillableType),
      description: (r.notes as string | null) ?? null,
      hours: sumDays(r),
    })
    unbillableByGroup.set(key, list)
  }

  // Every (user, week) pair that has an approved timesheet, so allocation runs once each.
  const groups = new Map<string, { uid: string; week: string }>()
  for (const t of internalTs) {
    const week = String(t.week_ending).slice(0, 10)
    groups.set(groupKey(t.user_id, week), { uid: t.user_id, week })
  }

  const rows: PayrollDetailRow[] = []
  for (const { uid, week } of groups.values()) {
    const key = groupKey(uid, week)
    const profile = profileById.get(uid)
    const alloc = allocatePayrollRows(config, {
      billableHours: billableByGroup.get(key) || 0,
      unbillable: unbillableByGroup.get(key) || [],
    })
    for (const a of alloc) {
      rows.push({
        weekEnding: week,
        userId: uid,
        employeeName: profile?.name || 'Unknown',
        employeeId: profile?.employee_id || '',
        earningType: a.earning_type,
        det: a.det,
        detcode: a.detcode,
        hours: a.hours,
      })
    }
  }

  // Default sort: week ending then employee name.
  rows.sort(
    (a, b) =>
      a.weekEnding.localeCompare(b.weekEnding) ||
      a.employeeName.toLowerCase().localeCompare(b.employeeName.toLowerCase()) ||
      a.detcode.localeCompare(b.detcode)
  )
  return rows
}

/** Build a human-readable change description for the audit trail. */
export function buildPayrollChangeDescription(
  before: Partial<PayrollEarningType> | null,
  after: Partial<PayrollEarningType>
): string {
  const label = (after.earning_type || before?.earning_type || 'earning type').trim()
  if (!before) return `Added earning type "${label}"`
  const fields: Array<keyof PayrollEarningType> = [
    'earning_type', 'det', 'detcode', 'area', 'dropdown', 'where_value', 'overtime', 'rule', 'rule_value', 'looks_at',
  ]
  const parts: string[] = []
  for (const f of fields) {
    const b = (before[f] ?? '') as string
    const a = (after[f] ?? '') as string
    if (String(b) !== String(a)) {
      parts.push(`${f} ${b === '' ? '—' : b} → ${a === '' ? '—' : a}`)
    }
  }
  if (!parts.length) return `Updated "${label}" (no field changes)`
  return `Updated "${label}": ${parts.join('; ')}`
}
