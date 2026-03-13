import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, endOfWeek, format, parseISO, addWeeks, subWeeks } from "date-fns"
import { toZonedTime } from "date-fns-tz"

const APP_TIMEZONE = 'America/New_York' // EST/EDT

/** Get current date in app timezone (EST) for week calculations */
function getNowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format hours for display: show "—" when 0, else "X.XX" */
export function formatHours(val: number | null | undefined): string {
  if (val == null || val === 0) return '—'
  return val.toFixed(2)
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

/** Convert date to Eastern (America/New_York) for consistent display */
function toEastern(d: Date): Date {
  return toZonedTime(d, APP_TIMEZONE)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(toEastern(d), 'MMM d, yyyy')
}

export function formatWeekEnding(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(toEastern(d), 'MMM d, yyyy')
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(toEastern(d), 'M/d/yy')
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

/** Format date for HTML date input (yyyy-MM-dd). Returns '' for invalid/empty. Uses Eastern for consistency. */
export function formatDateForInput(date: Date | string | null | undefined): string {
  if (date == null || date === '') return ''
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    if (isNaN(d.getTime())) return ''
    return format(toEastern(d), 'yyyy-MM-dd')
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

/** Format date in Eastern time for display (e.g. signatures, exports) */
export function formatDateInEastern(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(toEastern(d), 'MMM d, yyyy')
}

/** Format full date+time in Eastern (e.g. audit log, signatures with time) */
export function formatDateTimeInEastern(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(toEastern(d), 'MMM d, yyyy, h:mm:ss a')
}
