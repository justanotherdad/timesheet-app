'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Upload, Trash2 } from 'lucide-react'

type CalendarMeta = {
  calendar_year: number
  file_name: string
  updated_at: string
}

type CalendarTab = 'holiday' | 'expense'

type HolidayCalendarClientProps = {
  isAdmin: boolean
  defaultYear: number
}

const TABS: { id: CalendarTab; label: string; api: string; noun: string }[] = [
  { id: 'holiday', label: 'Holiday & Pay Calendar', api: '/api/holiday-calendars', noun: 'holiday & pay calendar' },
  { id: 'expense', label: 'Expense Calendar', api: '/api/expense-calendars', noun: 'expense calendar' },
]

export default function HolidayCalendarClient({ isAdmin, defaultYear }: HolidayCalendarClientProps) {
  const [tab, setTab] = useState<CalendarTab>('holiday')
  const [holidayCalendars, setHolidayCalendars] = useState<CalendarMeta[]>([])
  const [expenseCalendars, setExpenseCalendars] = useState<CalendarMeta[]>([])
  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [loadingList, setLoadingList] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /** Bumped after upload/delete so the iframe reloads the PDF stream. */
  const [viewKey, setViewKey] = useState(0)

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0]
  const calendars = tab === 'holiday' ? holidayCalendars : expenseCalendars

  const loadList = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoadingList(true)
    try {
      const [holidayRes, expenseRes] = await Promise.all([
        fetch('/api/holiday-calendars'),
        fetch('/api/expense-calendars'),
      ])
      const holidayJson = await holidayRes.json().catch(() => ({}))
      const expenseJson = await expenseRes.json().catch(() => ({}))
      if (!holidayRes.ok) {
        throw new Error(holidayJson.error || 'Failed to load calendars')
      }
      setHolidayCalendars(holidayJson.calendars || [])
      if (expenseRes.ok) {
        setExpenseCalendars(expenseJson.calendars || [])
      } else {
        setExpenseCalendars([])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load calendars')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  const yearOptions = (() => {
    const years = new Set<number>([defaultYear, selectedYear])
    holidayCalendars.forEach((c) => years.add(c.calendar_year))
    expenseCalendars.forEach((c) => years.add(c.calendar_year))
    for (let y = defaultYear - 2; y <= defaultYear + 3; y++) years.add(y)
    return [...years].sort((a, b) => b - a)
  })()

  const hasCalendarForYear = calendars.some((c) => c.calendar_year === selectedYear)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    setMessage(null)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('year', String(selectedYear))
      const res = await fetch(activeTab.api, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }
      setMessage(`Calendar for ${selectedYear} uploaded.`)
      setViewKey((k) => k + 1)
      await loadList({ quiet: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!hasCalendarForYear) return
    if (!window.confirm(`Delete the ${selectedYear} ${activeTab.noun}?`)) return

    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`${activeTab.api}/${selectedYear}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Delete failed')
      }
      setMessage(`Calendar for ${selectedYear} deleted.`)
      setViewKey((k) => k + 1)
      await loadList({ quiet: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 print:hidden">
        {TABS.map((t) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setError(null)
                setMessage(null)
              }}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
                selected
                  ? 'border-blue-600 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4 print:hidden">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            View year
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
                {calendars.some((c) => c.calendar_year === y) ? '' : ' (no file)'}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Upload PDF
              </label>
              <label className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 cursor-pointer disabled:opacity-50">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? 'Uploading…' : hasCalendarForYear ? 'Replace PDF' : 'Upload PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  disabled={uploading}
                  onChange={handleUpload}
                />
              </label>
            </div>
            {hasCalendarForYear && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete {selectedYear}
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg print:hidden">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 px-4 py-3 rounded-lg print:hidden">
          {message}
        </div>
      )}

      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loadingList ? (
          <div className="flex items-center justify-center h-full text-gray-600 dark:text-gray-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            Loading calendar…
          </div>
        ) : hasCalendarForYear ? (
          <iframe
            key={`${tab}-${selectedYear}-${viewKey}`}
            src={`${activeTab.api}/${selectedYear}/view#view=FitH&toolbar=1`}
            title={`${activeTab.label} ${selectedYear}`}
            className="w-full h-full block border-0 bg-white"
          />
        ) : (
          <div className="flex items-center justify-center h-full p-8 text-center text-gray-600 dark:text-gray-400">
            <div>
              <p className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">
                No calendar uploaded for {selectedYear}
              </p>
              <p className="text-sm">
                {isAdmin
                  ? `Use Upload PDF above to add the ${activeTab.noun} for this year.`
                  : `An administrator has not uploaded the ${activeTab.noun} for this year yet.`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
