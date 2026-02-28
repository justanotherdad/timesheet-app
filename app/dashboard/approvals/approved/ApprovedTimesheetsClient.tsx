'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { CheckCircle, XCircle, Clock, FileText, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
import DeleteTimesheetButton from '@/components/DeleteTimesheetButton'

interface ApprovedTimesheetsClientProps {
  timesheets: any[]
  filterUsers: { id: string; name: string }[]
  filterUser: string
  filterStart: string
  filterEnd: string
  sortBy: string
  sortDir: string
  signaturesByTimesheetId: Record<string, string[]>
  approverNamesById: Record<string, string>
  userRole?: string
}

export default function ApprovedTimesheetsClient({
  timesheets,
  filterUsers,
  filterUser,
  filterStart,
  filterEnd,
  sortBy,
  sortDir,
  signaturesByTimesheetId,
  approverNamesById,
  userRole,
}: ApprovedTimesheetsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedTimesheet, setSelectedTimesheet] = useState<any>(null)

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

  const getNextApproverId = (ts: any): string | undefined => {
    if (ts.status !== 'submitted') return undefined
    const profile = ts.user_profiles as { reports_to_id?: string; manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
    if (!profile) return undefined
    const chain: string[] = []
    const first = profile.supervisor_id || profile.reports_to_id
    if (first) chain.push(first)
    if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
    if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
    const signedIds = signaturesByTimesheetId[ts.id] || []
    return chain.find((uid) => !signedIds.includes(uid))
  }

  const getWithLabel = (ts: any) => {
    if (ts.status === 'rejected') return 'Rejected'
    if (ts.status === 'approved') return 'Approved'
    if (ts.status === 'submitted') {
      const nextId = getNextApproverId(ts)
      if (!nextId) return 'Approved'
      const profile = ts.user_profiles as { manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
      if (nextId === profile?.manager_id) return 'With Manager'
      if (nextId === profile?.supervisor_id) return 'With Supervisor'
      if (nextId === profile?.final_approver_id) return 'With Final Approver'
      return '—'
    }
    return '—'
  }

  const getWithPersonName = (ts: any) => {
    if (ts.status === 'rejected') return 'Rejected'
    if (ts.status === 'approved') return 'Approved'
    if (ts.status === 'submitted') {
      const nextId = getNextApproverId(ts)
      if (!nextId) return 'Approved'
      return approverNamesById[nextId] || getWithLabel(ts)
    }
    return '—'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'rejected': return <XCircle className="h-5 w-5 text-red-600" />
      case 'submitted': return <Clock className="h-5 w-5 text-orange-600" />
      default: return <FileText className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
      case 'rejected': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
      case 'submitted': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form
        method="get"
        action="/dashboard/approvals/approved"
        className="flex flex-col lg:flex-row gap-4 p-4 rounded-lg"
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
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date (Week Ending)</label>
            <input
              type="date"
              name="end"
              defaultValue={filterEnd}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select
              name="user"
              defaultValue={filterUser}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
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

      {/* Mobile: compact cards with popup for details */}
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
          Showing {timesheets.length} timesheet{timesheets.length !== 1 ? 's' : ''} (approved or partially approved by you)
        </p>
      </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">No approved or partially approved timesheets found.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Try adjusting your filters or clear them to see all results.
          </p>
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
                    <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[20%]">
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
                        <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                          {getStatusIcon(ts.status)}
                          {ts.status}
                        </span>
                      </td>
                      <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 break-words align-top">
                        {getWithLabel(ts)}
                      </td>
                      <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 break-words align-top">
                        {getWithPersonName(ts)}
                      </td>
                      <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {formatWeekEnding(ts.created_at)}
                      </td>
                      <td className="px-3 lg:px-6 py-3 text-sm font-medium">
                        <div className="flex flex-wrap gap-2">
                          {ts.status === 'approved' && (
                            <Link
                              href={`/dashboard/approvals/${ts.id}/reject-form`}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                            >
                              Reject
                            </Link>
                          )}
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
                          <DeleteTimesheetButton timesheetId={ts.id} status={ts.status} userRole={userRole} onDeleted={() => router.refresh()} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
              Showing {timesheets.length} timesheet{timesheets.length !== 1 ? 's' : ''} (approved or partially approved by you)
            </div>
          </>
        ) : (
          <div className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 dark:text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">No approved or partially approved timesheets found.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Try adjusting your filters or clear them to see all results.
            </p>
          </div>
        )}
      </div>

      {/* Mobile detail popup */}
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
                <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTimesheet.status)}`}>
                  {getStatusIcon(selectedTimesheet.status)}
                  {selectedTimesheet.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">With</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{getWithLabel(selectedTimesheet)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">With (Person)</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{getWithPersonName(selectedTimesheet)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Created</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{formatWeekEnding(selectedTimesheet.created_at)}</p>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                {selectedTimesheet.status === 'approved' && (
                  <Link
                    href={`/dashboard/approvals/${selectedTimesheet.id}/reject-form`}
                    className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
                  >
                    Reject
                  </Link>
                )}
                <Link
                  href={`/dashboard/timesheets/${selectedTimesheet.id}/export`}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700"
                >
                  Export
                </Link>
                <Link
                  href={`/dashboard/timesheets/${selectedTimesheet.id}`}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  View
                </Link>
                <DeleteTimesheetButton timesheetId={selectedTimesheet.id} status={selectedTimesheet.status} userRole={userRole} onDeleted={() => { setSelectedTimesheet(null); router.refresh() }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
