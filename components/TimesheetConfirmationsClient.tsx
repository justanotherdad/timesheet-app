'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, ExternalLink, FileDown } from 'lucide-react'

type Row = {
  id: string
  user_id: string
  week_ending: string
  week_starting: string
  approved_at?: string
  employee_name: string
}

export default function TimesheetConfirmationsClient() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch('/api/timesheet-confirmations', { cache: 'no-store', credentials: 'include' })
      if (!res.ok) {
        if (!silent) {
          setError('Could not load list.')
          setRows([])
        }
        return
      }
      const json = await res.json()
      setRows(Array.isArray(json.timesheets) ? json.timesheets : [])
      setError(null)
    } catch {
      if (!silent) {
        setError('Could not load list.')
        setRows([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Confirming on the timesheet itself leaves this page in the client cache;
  // refetch when the user comes back so the row is gone.
  useEffect(() => {
    const refetch = () => {
      void load({ silent: true })
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetch()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    window.addEventListener('focus', refetch)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refetch)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const confirm = async (id: string) => {
    setConfirmingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/timesheet-confirmations/${id}/confirm`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error || 'Could not confirm.')
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      await load({ silent: true })
      router.refresh()
    } finally {
      setConfirmingId(null)
    }
  }

  const returnTo = encodeURIComponent('/dashboard/timesheet-confirmations')

  if (loading && rows.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">Loading…</p>
  }

  if (error && rows.length === 0) {
    return <p className="text-red-600 dark:text-red-400">{error}</p>
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-600 dark:text-gray-400">
        No timesheets waiting for your confirmation.
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Employee</th>
                <th className="text-left py-3 px-4 font-medium">Week ending</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {rows.map((ts) => (
                <tr key={ts.id}>
                  <td className="py-3 px-4 text-gray-900 dark:text-gray-100">{ts.employee_name}</td>
                  <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{formatWeekEnding(ts.week_ending)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/timesheets/${ts.id}?returnTo=${returnTo}`}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View
                      </Link>
                      <Link
                        href={`/dashboard/timesheets/${ts.id}/export`}
                        className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300 hover:underline"
                      >
                        <FileDown className="h-4 w-4" />
                        Download
                      </Link>
                      <button
                        type="button"
                        onClick={() => confirm(ts.id)}
                        disabled={confirmingId === ts.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        {confirmingId === ts.id ? '…' : 'Confirm receipt'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
