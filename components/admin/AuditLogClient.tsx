'use client'

import { useState, useEffect } from 'react'
import { Shield, Search, ChevronDown } from 'lucide-react'
import { formatDateTimeInEastern } from '@/lib/utils'

const ENTITY_TYPES = [
  { value: '', label: 'All entities' },
  { value: 'user', label: 'User' },
  { value: 'timesheet', label: 'Timesheet' },
  { value: 'bid_sheet', label: 'Bid Sheet' },
  { value: 'bid_sheet_access', label: 'Bid Sheet Access' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'po_budget_access', label: 'Budget Access' },
]

const ACTIONS = [
  { value: '', label: 'All actions' },
  { value: 'user.create', label: 'User create' },
  { value: 'user.update', label: 'User update' },
  { value: 'user.delete', label: 'User delete' },
  { value: 'user.role_change', label: 'User role change' },
  { value: 'timesheet.approve', label: 'Timesheet approve' },
  { value: 'timesheet.reject', label: 'Timesheet reject' },
  { value: 'bid_sheet.create', label: 'Bid sheet create' },
  { value: 'bid_sheet.convert', label: 'Bid sheet convert' },
  { value: 'bid_sheet.delete', label: 'Bid sheet delete' },
  { value: 'bid_sheet.access.grant', label: 'Bid sheet access grant' },
  { value: 'bid_sheet.access.revoke', label: 'Bid sheet access revoke' },
  { value: 'budget.access.grant', label: 'Budget access grant' },
  { value: 'budget.access.revoke', label: 'Budget access revoke' },
]

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\./g, ' · ')
}

export default function AuditLogClient() {
  const [entries, setEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams()
    if (entityType) params.set('entity_type', entityType)
    if (action) params.set('action', action)
    params.set('limit', String(limit))
    params.set('offset', String(page * limit))

    fetch(`/api/audit-log?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries || [])
          setTotal(data.total ?? 0)
        }
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [entityType, action, page])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Audit Trail
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track who did what, when. Admin-only.
        </p>
      </div>

      <div className="p-4 flex flex-wrap gap-3 items-center border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-500" />
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(0) }}
            className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          >
            {ENTITY_TYPES.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0) }}
          className="h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
        >
          {ACTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} total
        </span>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No audit entries found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-4 py-2 font-medium">Who</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Entity</th>
                <th className="text-left px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDateTimeInEastern(e.created_at)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{e.actor_name || e.actor_id || '—'}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      {formatAction(e.action)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-gray-600 dark:text-gray-400">{e.entity_type}</span>
                    {e.entity_id && (
                      <span className="ml-1 text-gray-400 dark:text-gray-500 text-xs truncate max-w-[120px] inline-block align-bottom" title={e.entity_id}>
                        ({e.entity_id.slice(0, 8)}…)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 max-w-[200px]">
                    {(e.new_values || e.old_values) && (
                      <details className="group">
                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          <ChevronDown className="h-3 w-3 group-open:rotate-180" /> View
                        </summary>
                        <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs overflow-auto max-h-32">
                          {JSON.stringify(
                            { ...(e.old_values || {}), ...(e.new_values || {}) },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > limit && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * limit >= total}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
