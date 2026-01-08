import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function TimesheetsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get all weekly timesheets for the user, ordered by week ending (most recent first)
  const { data: timesheets } = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('user_id', user.id)
      .order('week_ending', { ascending: false })
      .order('created_at', { ascending: false })
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'submitted':
        return <Clock className="h-5 w-5 text-orange-600" />
      default:
        return <FileText className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'submitted':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">My Timesheets</h1>
            <Link
              href="/dashboard/timesheets/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              New Timesheet
            </Link>
          </div>

          {timesheets && timesheets.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Week Ending
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Week Starting
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {timesheets.map((ts) => (
                      <tr key={ts.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatWeekEnding(ts.week_ending)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(ts.week_starting).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                            {getStatusIcon(ts.status)}
                            {ts.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(ts.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            {ts.status === 'draft' && (
                              <Link
                                href={`/dashboard/timesheets/${ts.id}/edit`}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                Edit
                              </Link>
                            )}
                            {ts.status === 'draft' && (
                              <form action={`/dashboard/timesheets/${ts.id}/submit`} method="post" className="inline">
                                <button
                                  type="submit"
                                  className="text-green-600 hover:text-green-900"
                                >
                                  Submit
                                </button>
                              </form>
                            )}
                            <Link
                              href={`/dashboard/timesheets/${ts.id}/export`}
                              className="text-purple-600 hover:text-purple-900"
                            >
                              Export
                            </Link>
                            <Link
                              href={`/dashboard/timesheets/${ts.id}`}
                              className="text-gray-600 hover:text-gray-900"
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
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No timesheets found.</p>
              <Link
                href="/dashboard/timesheets/new"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create your first timesheet →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
