import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, endOfWeek, format, parseISO } from "date-fns"
import { toZonedTime } from "date-fns-tz"

const APP_TIMEZONE = 'America/New_York' // EST/EDT

/** Get current date in app timezone (EST) for week calculations */
function getNowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekEnding(date?: Date, weekStartsOn: number = 1): Date {
  const ref = date ?? getNowInAppTz()
  return endOfWeek(ref, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
}

export function getWeekStarting(date?: Date, weekStartsOn: number = 1): Date {
  const ref = date ?? getNowInAppTz()
  return startOfWeek(ref, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
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

export function formatDateForInput(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

/** Format date in Eastern time for display (e.g. signatures, exports) */
export function formatDateInEastern(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const zoned = toZonedTime(d, APP_TIMEZONE)
  return format(zoned, 'MMM d, yyyy')
}
