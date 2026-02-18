'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatWeekEnding } from '@/lib/utils'
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import DeleteTimesheetButton from '@/components/DeleteTimesheetButton'

interface MyTimesheetsTableProps {
  timesheets: any[]
  sortBy: string
  sortDir: string
  user: { id: string; profile: { role: string } }
  signaturesByTimesheetId?: Record<string, { signer_id: string }[]>
  approverNamesById?: Record<string, string>
}

export default function MyTimesheetsTable({
  timesheets,
  sortBy,
  sortDir,
  user,
  signaturesByTimesheetId = {},
  approverNamesById = {},
}: MyTimesheetsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const buildUrl = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    return `/dashboard/timesheets?${params.toString()}`
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
    const signedIds = (signaturesByTimesheetId[ts.id] || []).map((s: { signer_id: string }) => s.signer_id)
    return chain.find((uid) => !signedIds.includes(uid))
  }

  const getWithLabel = (ts: any) => {
    if (ts.status === 'draft') return '—'
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
    if (ts.status === 'draft') return '—'
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

  const showEmployee = ['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)
  const showWith = ['admin', 'super_admin'].includes(user.profile.role)

  return (
    <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-visible">
        <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {showEmployee && (
                <th className="px-3 lg:px-6 py-3 text-left w-[10%] min-w-0">
                  <button
                    type="button"
                    onClick={() => handleSort('user')}
                    className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                  >
                    Employee <SortIcon col="user" />
                  </button>
                </th>
              )}
              <th className="px-3 lg:px-6 py-3 text-left w-[8%] min-w-0">
                <button
                  type="button"
                  onClick={() => handleSort('week_ending')}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                >
                  Week Ending <SortIcon col="week_ending" />
                </button>
              </th>
              <th className="px-3 lg:px-6 py-3 text-left w-[8%] min-w-0">
                <button
                  type="button"
                  onClick={() => handleSort('week_starting')}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                >
                  Week Starting <SortIcon col="week_starting" />
                </button>
              </th>
              <th className="px-3 lg:px-6 py-3 text-left w-[10%] min-w-0">
                <button
                  type="button"
                  onClick={() => handleSort('status')}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                >
                  Status <SortIcon col="status" />
                </button>
              </th>
              {showWith && (
                <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[10%] min-w-0">
                  With
                </th>
              )}
              {showWith && (
                <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%] min-w-0">
                  With (person)
                </th>
              )}
              <th className="px-3 lg:px-6 py-3 text-left w-[8%] min-w-0">
                <button
                  type="button"
                  onClick={() => handleSort('created_at')}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 inline-flex items-center"
                >
                  Created <SortIcon col="created_at" />
                </button>
              </th>
              <th className="px-3 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[20%] min-w-0">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {timesheets.map((ts) => (
              <tr key={ts.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                {showEmployee && (
                  <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate" title={ts.user_profiles?.name || 'Unknown'}>
                    {ts.user_profiles?.name || 'Unknown'}
                  </td>
                )}
                <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                  {formatWeekEnding(ts.week_ending)}
                </td>
                <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                  {formatWeekEnding(ts.week_starting)}
                </td>
                <td className="px-3 lg:px-6 py-3 min-w-0">
                  <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                    {getStatusIcon(ts.status)}
                    {ts.status}
                  </span>
                </td>
                {showWith && (
                  <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate">
                    {getWithLabel(ts)}
                  </td>
                )}
                {showWith && (
                  <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate" title={getWithPersonName(ts)}>
                    {getWithPersonName(ts)}
                  </td>
                )}
                <td className="px-3 lg:px-6 py-3 text-sm text-gray-900 dark:text-gray-100 min-w-0">
                  {formatWeekEnding(ts.created_at)}
                </td>
                <td className="px-3 lg:px-6 py-3 text-sm font-medium min-w-0">
                  <div className="flex flex-wrap gap-2">
                    {ts.status === 'draft' && (
                      <Link
                        href={`/dashboard/timesheets/${ts.id}/edit`}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                      >
                        Edit
                      </Link>
                    )}
                    {ts.status === 'draft' && (
                      <form action={`/dashboard/timesheets/${ts.id}/submit`} method="post" className="inline">
                        <button
                          type="submit"
                          className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                        >
                          Submit
                        </button>
                      </form>
                    )}
                    {ts.status === 'submitted' && ts.user_id === user.id && (
                      <form action={`/dashboard/timesheets/${ts.id}/recall`} method="post" className="inline">
                        <button
                          type="submit"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        >
                          Edit
                        </button>
                      </form>
                    )}
                    {ts.status === 'rejected' && ts.user_id === user.id && (
                      <Link
                        href={`/dashboard/timesheets/${ts.id}/edit`}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                      >
                        Edit
                      </Link>
                    )}
                    {ts.status === 'approved' && ['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
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
                    <DeleteTimesheetButton timesheetId={ts.id} status={ts.status} userRole={user.profile.role} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
