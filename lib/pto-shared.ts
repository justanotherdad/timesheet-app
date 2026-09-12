export const PTO_APPROVER_IDS_KEY = 'pto_request_approver_ids'

export const PTO_LEAVE_TYPE_OPTIONS = [
  'Paid Time Off',
  'Vacation',
  'Bereavement',
  'Jury Duty',
  'Comp Time Used',
] as const

export const PTO_OTHER_LEAVE_TYPE = 'Other'

export const PTO_MAX_RANGE_DAYS = 90
export const PTO_MAX_HOURS_PER_DAY = 8
export const PTO_MIN_HOURS_PER_DAY = 0.25

export function isInternalEmployee(employeeType?: string | null): boolean {
  return (employeeType || 'internal').toLowerCase() === 'internal'
}

export function parsePtoApproverIds(settings: Record<string, string>): string[] {
  const raw = settings[PTO_APPROVER_IDS_KEY]?.trim()
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function stringifyPtoApproverIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

export function isPtoApprover(userId: string, approverIds: string[]): boolean {
  return approverIds.length > 0 && approverIds.includes(userId)
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(value: string): boolean {
  return YMD.test(value)
}

function utcYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = utcYmd(startDate)
  const end = utcYmd(endDate)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function totalPtoHours(hoursPerDay: number, startDate: string, endDate: string): number {
  const days = inclusiveDayCount(startDate, endDate)
  return Math.round(hoursPerDay * days * 100) / 100
}

export function normalizeLeaveType(preset: string, custom?: string | null): string | null {
  const picked = (preset || '').trim()
  if (picked === PTO_OTHER_LEAVE_TYPE) {
    const typed = (custom || '').trim()
    return typed.length > 0 ? typed.slice(0, 80) : null
  }
  if ((PTO_LEAVE_TYPE_OPTIONS as readonly string[]).includes(picked)) return picked
  const typed = picked || (custom || '').trim()
  return typed.length > 0 ? typed.slice(0, 80) : null
}

export function parseHoursPerDay(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n * 100) / 100
  if (rounded < PTO_MIN_HOURS_PER_DAY || rounded > PTO_MAX_HOURS_PER_DAY) return null
  return rounded
}

export function validateCreatePtoInput(input: {
  leaveType: string | null
  startDate: string
  endDate: string
  hoursPerDay: number | null
  notes?: string | null
}): { ok: true; value: { leaveType: string; startDate: string; endDate: string; hoursPerDay: number; notes: string | null } } | { ok: false; error: string } {
  if (!input.leaveType) {
    return { ok: false, error: 'Choose a leave type, or type one in.' }
  }
  if (!isYmd(input.startDate) || !isYmd(input.endDate)) {
    return { ok: false, error: 'Start and end dates are required.' }
  }
  if (input.endDate < input.startDate) {
    return { ok: false, error: 'End date must be on or after the start date.' }
  }
  const days = inclusiveDayCount(input.startDate, input.endDate)
  if (days < 1 || days > PTO_MAX_RANGE_DAYS) {
    return { ok: false, error: `Date range must be between 1 and ${PTO_MAX_RANGE_DAYS} days.` }
  }
  if (input.hoursPerDay == null) {
    return { ok: false, error: `Hours per day must be between ${PTO_MIN_HOURS_PER_DAY} and ${PTO_MAX_HOURS_PER_DAY}.` }
  }
  const notes = (input.notes || '').trim()
  if (notes.length > 500) {
    return { ok: false, error: 'Notes must be 500 characters or fewer.' }
  }
  return {
    ok: true,
    value: {
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      hoursPerDay: input.hoursPerDay,
      notes: notes || null,
    },
  }
}
