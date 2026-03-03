'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, Clock, X } from 'lucide-react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface PendingApprovalsClientProps {
  timesheets: any[]
  sortBy: string
  sortDir: string
  currentUserName: string
  withLabel: string // e.g. "With Supervisor", "With Manager"
}

export default function PendingApprovalsClient({
  timesheets,
  sortBy,
  sortDir,
  currentUserName,
  withLabel,
}: PendingApprovalsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedTimesheet, setSelectedTimesheet] = useState<any>(null)

  const buildUrl = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    return `/dashboard/approvals?${params.toString()}`
  }

  const handleSort = (column: string) => {
    const newDir = sortBy === column && sortDir === 'desc' ? 'asc' : 'desc'
    router.push(buildUrl({ sort: column, dir: newDir }))
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  return (
    <div className="space-y-4">
      {/* Mobile: compact cards with View button */}
      <div className="md:hidden">
        {timesheets.length > 0 ? (
          <div className="space-y-3">
            {timesheets.map((ts: any) => (
              <div
                key={ts.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {ts.user_profiles?.name || 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Week ending {formatWeekEnding(ts.week_ending)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTimesheet(ts)}
                    className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
            <p className="text-sm text-gray-600 dark:text-gray-400 px-1">
              Showing {timesheets.length} pending approval{timesheets.length !== 1 ? 's' : ''}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">No pending approvals.</p>
          </div>
        )}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      {timesheets.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 lg:px-6 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('user')}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                    >
                      Employee <SortIcon col="user" />
                    </button>
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('week_ending')}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                    >
                      Week Ending <SortIcon col="week_ending" />
                    </button>
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('week_starting')}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                    >
                      Week Starting <SortIcon col="week_starting" />
                    </button>
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('status')}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                    >
                      Status <SortIcon col="status" />
                    </button>
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    With
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    With (Person)
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSort('created_at')}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                    >
                      Created <SortIcon col="created_at" />
                    </button>
                  </th>
                  <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[22%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {timesheets.map((ts: any) => (
                  <tr key={ts.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 break-words align-top">
                      {ts.user_profiles?.name || 'Unknown'}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatWeekEnding(ts.week_ending)}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatWeekEnding(ts.week_starting)}
                    </td>
                    <td className="px-3 lg:px-6 py-3">
                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                        <Clock className="h-5 w-5 text-orange-600" />
                        submitted
                      </span>
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 break-words align-top">
                      {withLabel}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 break-words align-top">
                      {currentUserName}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatWeekEnding(ts.created_at)}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm font-medium">
                      <div className="flex flex-wrap gap-2">
                        <form action={`/dashboard/approvals/${ts.id}/approve`} method="post" className="inline">
                          <input type="hidden" name="returnTo" value={`/dashboard/approvals${searchParams.toString() ? '?' + searchParams.toString() : ''}`} />
                          <button
                            type="submit"
                            className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                          >
                            Approve
                          </button>
                        </form>
                        <Link
                          href={`/dashboard/approvals/${ts.id}/reject-form`}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                        >
                          Reject
                        </Link>
                        <Link
                          href={`/dashboard/timesheets/${ts.id}/export`}
                          className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300"
                        >
                          Export
                        </Link>
                        <Link
                          href={`/dashboard/timesheets/${ts.id}?returnTo=${encodeURIComponent('/dashboard/approvals' + (searchParams.toString() ? '?' + searchParams.toString() : ''))}`}
                          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Showing {timesheets.length} pending approval{timesheets.length !== 1 ? 's' : ''}
          </div>
        </>
      ) : (
        <div className="p-6 sm:p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">No pending approvals.</p>
        </div>
      )}
      </div>

      {/* Mobile detail popup with Approve, Reject, Export, View */}
      {selectedTimesheet && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setSelectedTimesheet(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Timesheet Details</h3>
              <button
                onClick={() => setSelectedTimesheet(null)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Employee</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{selectedTimesheet.user_profiles?.name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Week Ending</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{formatWeekEnding(selectedTimesheet.week_ending)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Week Starting</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{formatWeekEnding(selectedTimesheet.week_starting)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Status</p>
                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                  <Clock className="h-5 w-5 text-orange-600" />
                  Submitted
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">With</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{withLabel}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Submitted By</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{currentUserName}</p>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                <form action={`/dashboard/approvals/${selectedTimesheet.id}/approve`} method="post" className="inline">
                  <input type="hidden" name="returnTo" value={`/dashboard/approvals${searchParams.toString() ? '?' + searchParams.toString() : ''}`} />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700"
                  >
                    Approve
                  </button>
                </form>
                <Link
                  href={`/dashboard/approvals/${selectedTimesheet.id}/reject-form`}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
                >
                  Reject
                </Link>
                <Link
                  href={`/dashboard/timesheets/${selectedTimesheet.id}/export`}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700"
                >
                  Export
                </Link>
                <Link
                  href={`/dashboard/timesheets/${selectedTimesheet.id}?returnTo=${encodeURIComponent('/dashboard/approvals' + (searchParams.toString() ? '?' + searchParams.toString() : ''))}`}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  View
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
