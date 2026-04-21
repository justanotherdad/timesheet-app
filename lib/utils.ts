import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, endOfWeek, format, parseISO, addWeeks, subWeeks } from "date-fns"

const APP_TIMEZONE = 'America/New_York' // EST/EDT

/**
 * Calendar date YYYY-MM-DD in APP_TIMEZONE (not UTC).
 * Use for delegation windows and any "business today" comparison; avoids evening US times
 * where UTC `toISOString().slice(0,10)` is already the next calendar day.
 */
export function getCalendarDateStringInAppTimezone(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) return date.toISOString().slice(0, 10)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Format date in Eastern using Intl (for signatures, exports). */
function formatInEastern(d: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, ...options }).format(d)
}

/** Get current date for week calculations (uses local time, pre-audit-trail behavior). */
function getNowInAppTz(): Date {
  return new Date()
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric hour value: 2 decimal places by default; 3 when the thousandths digit is non-zero
 * (avoids showing ".000" noise unless the value has real thousandths precision).
 */
export function formatHoursDigits(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0.00'
  const rounded = Math.round(n * 1000) / 1000
  const mills = Math.round(rounded * 1000)
  const thirdDigit = ((mills % 10) + 10) % 10
  if (thirdDigit !== 0) return rounded.toFixed(3)
  return rounded.toFixed(2)
}

/** Format hours for UI tables: show "—" when 0, else smart 2–3 decimals (see formatHoursDigits). */
export function formatHours(val: number | null | undefined): string {
  if (val == null || val === 0) return '—'
  const n = Number(val)
  if (!Number.isFinite(n) || n === 0) return '—'
  return formatHoursDigits(n)
}

/**
 * Same decimal rules as formatHours but 0 renders as "0.00" (read-only detail, PDF/CSV exports).
 */
export function formatHoursAmount(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(Number(val))) return '0.00'
  const n = Number(val)
  if (n === 0) return '0.00'
  return formatHoursDigits(n)
}

/** Clamp to [0, 24] and round to thousandths for timesheet day-hour inputs and saves. */
export function normalizeTimesheetHours(val: number): number {
  if (!Number.isFinite(val)) return 0
  const clamped = Math.min(24, Math.max(0, val))
  return Math.round(clamped * 1000) / 1000
}

export function getWeekEnding(date?: Date, weekStartsOn: number = 1): Date {
  const ref = date ?? getNowInAppTz()
  return endOfWeek(ref, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
}

export function getWeekStarting(date?: Date, weekStartsOn: number = 1): Date {
  const ref = date ?? getNowInAppTz()
  return startOfWeek(ref, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
}

/** Get the previous week's ending date (the week that just ended, typically the one to submit) */
export function getPreviousWeekEnding(date?: Date, weekStartsOn: number = 1): Date {
  const current = getWeekEnding(date, weekStartsOn)
  return subWeeks(current, 1)
}

/** Get all week-ending dates (YYYY-MM-DD) that fall within a month. weekStartsOn: 0=Sun, 1=Mon, etc. */
export function getWeekEndingsForMonth(year: number, month: number, weekStartsOn: number = 1): string[] {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const endings: string[] = []
  let current = endOfWeek(firstDay, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
  while (current <= lastDay) {
    if (current >= firstDay) {
      endings.push(format(current, 'yyyy-MM-dd'))
    }
    current = addWeeks(current, 1)
  }
  return endings
}

export function getWeekDates(weekEnding: Date | string, weekStartsOn: number = 1): { start: Date; end: Date; days: Date[] } {
  const end = typeof weekEnding === 'string' ? parseISO(weekEnding) : weekEnding
  const start = startOfWeek(end, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
  const days: Date[] = []
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    days.push(day)
  }
  
  return { start, end, days }
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

export function formatWeekEnding(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'M/d/yy')
}

/** Format period month/year as MMM-YYYY (e.g. Jul-2024). month is 1-12. */
export function formatPeriodMonthYear(month: number, year: number): string {
  if (!month || !year) return '—'
  const d = new Date(year, month - 1, 1)
  return format(d, 'MMM-yyyy')
}

/** Format array of periods: [{month, year}, ...] -> "Jul 2024, Aug 2024, Sep 2024" */
export function formatPeriodsList(periods: { month: number; year: number }[]): string {
  if (!periods?.length) return '—'
  return periods.map((p) => formatPeriodMonthYear(p.month, p.year)).join(', ')
}

/** Format date for HTML date input (yyyy-MM-dd). Returns '' for invalid/empty. */
export function formatDateForInput(date: Date | string | null | undefined): string {
  if (date == null || date === '') return ''
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(d.getTime())) return ''
    return format(d, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

/** Returns true if value is valid for HTML date input (empty or yyyy-MM-dd that parses to valid date). */
export function isValidDateInputValue(value: string): boolean {
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parseISO(value)
  return !isNaN(d.getTime())
}

/**
 * Normalize PO issue date from DB/API or free text (MM/DD/YYYY, ISO, etc.) to yyyy-MM-dd for
 * `<input type="date">` and Postgres `date` columns. Returns '' if unparseable.
 */
export function normalizePoIssueDateToIso(value: unknown): string {
  if (value == null || value === '') return ''
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    const mo = us[1].padStart(2, '0')
    const da = us[2].padStart(2, '0')
    return `${us[3]}-${mo}-${da}`
  }
  try {
    const d = parseISO(s)
    if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd')
  } catch {
    /* ignore */
  }
  return ''
}

/** Value for Postgres `date` column or null when empty / invalid. */
export function normalizePoIssueDateForDb(value: unknown): string | null {
  const v = normalizePoIssueDateToIso(value)
  return v === '' ? null : v
}

/** Display PO issue date (e.g. Client & PO section) when value may be legacy or non-ISO. */
export function formatPoIssueDateForDisplay(value: unknown): string {
  const iso = normalizePoIssueDateToIso(value)
  if (!iso) return '—'
  return formatDate(iso)
}

/** Format date for display (e.g. signatures, exports). Eastern timezone. */
export function formatDateInEastern(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatInEastern(d, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Format full date+time for display. Returns '—' for null/invalid. Eastern timezone. */
export function formatDateTimeInEastern(date: Date | string | null | undefined): string {
  if (date == null || date === '') return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(d.getTime())) return '—'
    return formatInEastern(d, { dateStyle: 'medium', timeStyle: 'medium' })
  } catch {
    return '—'
  }
}
