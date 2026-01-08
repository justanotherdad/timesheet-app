import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { startOfWeek, endOfWeek, format, parseISO } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekEnding(date: Date = new Date()): Date {
  // Week ending is Sunday
  return endOfWeek(date, { weekStartsOn: 1 }) // Week starts on Monday
}

export function getWeekStarting(date: Date = new Date()): Date {
  // Week starting is Monday
  return startOfWeek(date, { weekStartsOn: 1 })
}

export function getWeekDates(weekEnding: Date | string): { start: Date; end: Date; days: Date[] } {
  const end = typeof weekEnding === 'string' ? parseISO(weekEnding) : weekEnding
  const start = startOfWeek(end, { weekStartsOn: 1 })
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
