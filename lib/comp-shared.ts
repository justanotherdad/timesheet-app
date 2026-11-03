export const COMP_APPROVER_IDS_KEY = 'comp_request_approver_ids'
export const COMP_THRESHOLD_KEY = 'comp_bank_threshold_hours'
export const DEFAULT_COMP_THRESHOLD = 40

export type CompKind = 'bank' | 'use' | 'admin_add'
export type CompStatus = 'pending' | 'approved' | 'denied' | 'cancelled'
export type CompAuditDecision = 'approved' | 'denied' | 'added' | 'removed' | 'cancelled'

export interface CompRequest {
  id: string
  user_id: string
  kind: CompKind
  week_ending: string
  hours: number
  client_acknowledged: boolean
  status: CompStatus
  submitted_at: string
  reviewed_by_id?: string | null
  reviewed_at?: string | null
  reviewer_note?: string | null
  cancelled_at?: string | null
  cancelled_by_id?: string | null
  decision_seen_at?: string | null
  created_at: string
  updated_at: string
}

export function roundHours(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatHours(value: number): string {
  return roundHours(value).toFixed(2)
}

export function parseCompApproverIds(settings: Record<string, string>): string[] {
  const raw = settings[COMP_APPROVER_IDS_KEY]?.trim()
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function stringifyCompApproverIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

export function isCompApprover(userId: string, approverIds: string[]): boolean {
  return approverIds.length > 0 && approverIds.includes(userId)
}

export function parseCompThreshold(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 999) return DEFAULT_COMP_THRESHOLD
  return roundHours(n)
}

export function parseCompHours(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  const rounded = roundHours(n)
  if (rounded <= 0 || rounded > 9999) return null
  return rounded
}

export function isSundayYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0
}

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin' || role === 'super_admin'
}

export interface CompTallyRow {
  id?: string
  kind: string
  status: string
  hours: number
  week_ending?: string
}

export interface CompTally {
  banked: number
  held: number
  available: number
  weekCommitted: number
}

/** Approved banks and admin adds, minus approved uses. Pending uses are held. */
export function summarizeComp(rows: CompTallyRow[], weekEnding?: string, exceptId?: string): CompTally {
  let banked = 0
  let held = 0
  let weekCommitted = 0
  for (const row of rows) {
    const hours = Number(row.hours) || 0
    if (row.status === 'approved' && (row.kind === 'bank' || row.kind === 'admin_add')) banked += hours
    if (row.status === 'approved' && row.kind === 'use') banked -= hours
    if (row.status === 'pending' && row.kind === 'use') held += hours
    if (
      weekEnding &&
      row.week_ending === weekEnding &&
      row.kind === 'bank' &&
      (row.status === 'pending' || row.status === 'approved') &&
      row.id !== exceptId
    ) {
      weekCommitted += hours
    }
  }
  banked = roundHours(banked)
  held = roundHours(held)
  return {
    banked,
    held,
    available: roundHours(banked - held),
    weekCommitted: roundHours(weekCommitted),
  }
}

export function maxBankHours(billable: number, threshold: number): number {
  return Math.max(0, roundHours(billable - threshold))
}

export function bankRequestError(input: {
  submitted: boolean
  hasTimesheet: boolean
  billable: number
  threshold: number
  alreadyHours: number
  requestHours: number
}): string | null {
  if (!input.hasTimesheet) {
    return 'There is no timesheet for this week ending yet.'
  }
  if (!input.submitted) {
    return 'Bank Comp stays blocked until that week’s timesheet is submitted.'
  }
  const limit = maxBankHours(input.billable, input.threshold)
  const remaining = Math.max(0, roundHours(limit - input.alreadyHours))
  if (input.requestHours > remaining) {
    if (limit <= 0) {
      return `Submitted billable hours are ${formatHours(input.billable)}. Nothing is over ${formatHours(input.threshold)}.`
    }
    return `This week’s limit is ${formatHours(limit)} hours and ${formatHours(input.alreadyHours)} is already approved or pending, so ${formatHours(remaining)} is left.`
  }
  return null
}

/**
 * Approve check for a pending Use that is already included in `tally.held`.
 * Other pending Uses stay reserved.
 */
export function approveUseError(requestHours: number, tally: Pick<CompTally, 'banked' | 'held'>): string | null {
  const otherHeld = roundHours(Math.max(0, tally.held - requestHours))
  const left = roundHours(tally.banked - otherHeld)
  if (requestHours > left) {
    if (otherHeld > 0) {
      return 'Pending Use hours are held and this request no longer fits in the bank.'
    }
    return `Only ${formatHours(Math.max(0, left))} hours are available.`
  }
  return null
}

export function requestUseError(requestHours: number, available: number): string | null {
  if (requestHours > roundHours(available)) {
    return `Only ${formatHours(Math.max(0, available))} hours are available. Pending Use hours are already held.`
  }
  return null
}

export interface CompPreview {
  hasTimesheet: boolean
  submitted: boolean
  billable: number
  unbillable: number
  threshold: number
  maxBank: number
  alreadyHours: number
  remaining: number
  banked: number
  held: number
  available: number
}

export function compKindLabel(kind: string): string {
  if (kind === 'bank') return 'Bank'
  if (kind === 'use') return 'Use'
  if (kind === 'admin_add') return 'Admin add'
  return kind
}

export interface CompQueueRow extends CompRequest {
  employee_name: string
  can_approve: boolean
  block_reason: string | null
  check_now: string
}

export interface CompHistoryRow extends CompRequest {
  employee_name: string
  reviewer_name: string | null
  cancelled_by_name: string | null
}

export interface CompAuditRow {
  id: string
  request_id: string | null
  user_id: string
  employee_name: string
  actor_id: string | null
  actor_name: string
  decision: CompAuditDecision
  week_ending: string
  hours: number
  kind: string
  response: string | null
  created_at: string
}
