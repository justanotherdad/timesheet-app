'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { totalPtoHours } from '@/lib/pto-shared'
import type { PtoRequest } from '@/types/database'

type QueueRow = PtoRequest & { employee_name: string }

function formatRange(start: string, end: string): string {
  if (start === end) return formatDate(start)
  return `${formatDate(start)} – ${formatDate(end)}`
}

export default function PtoReviewClient() {
  const router = useRouter()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [denyId, setDenyId] = useState<string | null>(null)
  const [denyReason, setDenyReason] = useState('')

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch('/api/pto/queue', { cache: 'no-store', credentials: 'include' })
      if (!res.ok) {
        if (!silent) {
          setError('Could not load requests.')
          setRows([])
        }
        return
      }
      const json = await res.json()
      setRows(Array.isArray(json.requests) ? json.requests : [])
      setError(null)
    } catch {
      if (!silent) {
        setError('Could not load requests.')
        setRows([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (id: string) => {
    setActingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/pto/${id}/approve`, { method: 'POST', credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not approve.')
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      router.refresh()
    } finally {
      setActingId(null)
    }
  }

  const deny = async (id: string) => {
    const reason = denyReason.trim()
    if (!reason) {
      setError('A reason is required to deny a request.')
      return
    }
    setActingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/pto/${id}/deny`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not deny.')
        return
      }
      setDenyId(null)
      setDenyReason('')
      setRows((prev) => prev.filter((r) => r.id !== id))
      router.refresh()
    } finally {
      setActingId(null)
    }
  }

  if (loading && rows.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">Loading…</p>
  }

  if (error && rows.length === 0) {
    return <p className="text-red-600 dark:text-red-400">{error}</p>
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-600 dark:text-gray-400">
        No PTO requests waiting for review.
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {rows.map((r) => (
        <div
          key={r.id}
          className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{r.employee_name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {r.leave_type} · {formatRange(r.start_date, r.end_date)} ·{' '}
                {totalPtoHours(r.hours_per_day, r.start_date, r.end_date)} hrs ({r.hours_per_day} / day)
              </p>
              {r.notes && (
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{r.notes}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Submitted {formatDate(r.submitted_at.slice(0, 10))}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void approve(r.id)}
                disabled={actingId === r.id}
                className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {actingId === r.id && denyId !== r.id ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDenyId(r.id)
                  setDenyReason('')
                }}
                disabled={actingId === r.id}
                className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
          {denyId === r.id && (
            <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor={`deny-${r.id}`}>
                Reason
              </label>
              <textarea
                id={`deny-${r.id}`}
                rows={3}
                required
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void deny(r.id)}
                  disabled={actingId === r.id}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {actingId === r.id ? 'Denying…' : 'Confirm deny'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDenyId(null)
                    setDenyReason('')
                  }}
                  className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-2 rounded-lg text-sm font-semibold"
                >
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
