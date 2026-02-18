'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
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
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 truncate" title={ts.user_profiles?.name || 'Unknown'}>
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
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 truncate">
                      {withLabel}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 truncate" title={currentUserName}>
                      {currentUserName}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {formatWeekEnding(ts.created_at)}
                    </td>
                    <td className="px-3 lg:px-6 py-3 text-sm font-medium">
                      <div className="flex flex-wrap gap-2">
                        <form action={`/dashboard/approvals/${ts.id}/approve`} method="post" className="inline">
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
                          href={`/dashboard/timesheets/${ts.id}`}
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
  )
}
