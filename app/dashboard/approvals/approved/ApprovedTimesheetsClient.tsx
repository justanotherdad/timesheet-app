'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface ApprovedTimesheetsClientProps {
  timesheets: any[]
  filterUsers: { id: string; name: string }[]
  filterUser: string
  filterStart: string
  filterEnd: string
  sortBy: string
  sortDir: string
}

export default function ApprovedTimesheetsClient({
  timesheets,
  filterUsers,
  filterUser,
  filterStart,
  filterEnd,
  sortBy,
  sortDir,
}: ApprovedTimesheetsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const buildUrl = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    return `/dashboard/approvals/approved?${params.toString()}`
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
    <div className="space-y-6">
      {/* Filters */}
      <form
        method="get"
        action="/dashboard/approvals/approved"
        className="flex flex-col lg:flex-row gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
      >
        <input type="hidden" name="sort" value={sortBy} />
        <input type="hidden" name="dir" value={sortDir} />
        <div className="flex flex-col gap-4 lg:w-48 lg:shrink-0 lg:border-r lg:border-gray-200 dark:lg:border-gray-600 lg:pr-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date (Week Ending)</label>
            <input
              type="date"
              name="start"
              defaultValue={filterStart}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date (Week Ending)</label>
            <input
              type="date"
              name="end"
              defaultValue={filterEnd}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select
              name="user"
              defaultValue={filterUser}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Users</option>
              {filterUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
            >
              Apply Filters
            </button>
            <Link
              href="/dashboard/approvals/approved"
              className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 inline-flex items-center"
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Sort & Results */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Sort by:</span>
          <button
            type="button"
            onClick={() => handleSort('approved_at')}
            className={`inline-flex items-center mr-4 text-sm font-medium ${sortBy === 'approved_at' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            Approved Date <SortIcon col="approved_at" />
          </button>
          <button
            type="button"
            onClick={() => handleSort('week_ending')}
            className={`inline-flex items-center mr-4 text-sm font-medium ${sortBy === 'week_ending' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            Week Ending <SortIcon col="week_ending" />
          </button>
          <button
            type="button"
            onClick={() => handleSort('user')}
            className={`inline-flex items-center text-sm font-medium ${sortBy === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}
          >
            User <SortIcon col="user" />
          </button>
        </div>

        {timesheets.length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {timesheets.map((ts: any) => (
              <div
                key={ts.id}
                className="p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {ts.user_profiles?.name || 'Unknown'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{ts.user_profiles?.email || ''}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      Week Ending: {formatWeekEnding(ts.week_ending)}
                    </p>
                    {ts.approved_at && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Approved: {new Date(ts.approved_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 shrink-0">
                    <CheckCircle className="h-4 w-4" />
                    Approved
                  </span>
                </div>
                <div className="mt-4">
                  <Link
                    href={`/dashboard/timesheets/${ts.id}`}
                    className="inline-flex items-center min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">No approved timesheets found.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Try adjusting your filters or clear them to see all results.
            </p>
          </div>
        )}

        {timesheets.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Showing {timesheets.length} approved timesheet{timesheets.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
