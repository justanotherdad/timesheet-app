import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatWeekEnding, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, FileText } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Query timesheet with user profile (avoid nested relationships that might fail)
  const timesheetResult = await withQueryTimeout(() =>
    supabase
    .from('weekly_timesheets')
    .select(`
      *,
      user_profiles!user_id(name, email)
    `)
    .eq('id', id)
    .single()
  )
  
  // Check for query errors (RLS issues, etc.)
  if (timesheetResult.error) {
    console.error('Timesheet query error:', timesheetResult.error)
  }
  
  const timesheet = timesheetResult.data as any

  if (!timesheet) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Timesheet not found</h1>
          {timesheetResult.error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              Error: {timesheetResult.error.message || 'Access denied or timesheet does not exist'}
            </p>
          )}
          <Link href="/dashboard/timesheets" className="text-blue-600 hover:text-blue-700">
            ← Back
          </Link>
        </div>
      </div>
    )
  }

  // Query signatures separately to avoid relationship issues
  const signaturesResult = await withQueryTimeout(() =>
    supabase
    .from('timesheet_signatures')
    .select(`
      *,
      user_profiles!signer_id(name)
    `)
    .eq('timesheet_id', id)
  )
  
  const signatures = (signaturesResult.data || []) as any[]
  
  // Attach signatures to timesheet object for compatibility
  if (timesheet) {
    timesheet.timesheet_signatures = signatures
  }

  // Check if user can approve this timesheet (owner's reports_to, supervisor, or manager)
  let canApprove = false
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    const ownerResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('reports_to_id, supervisor_id, manager_id, final_approver_id')
        .eq('id', timesheet.user_id)
        .single()
    )
    const owner = ownerResult.data as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string } | null
    const isApprover =
      owner?.reports_to_id === user.id ||
      owner?.supervisor_id === user.id ||
      owner?.manager_id === user.id ||
      owner?.final_approver_id === user.id
    if (!isApprover) {
      redirect('/dashboard')
    }
    canApprove = true
  } else if (['admin', 'super_admin'].includes(user.profile.role)) {
    canApprove = true
  }

  // Get entries (with error handling)
  let entries: any[] = []
  let unbillable: any[] = []
  
  try {
    const entriesResult = await withQueryTimeout(() =>
      supabase
        .from('timesheet_entries')
        .select(`
          *,
          sites(name, code),
          purchase_orders(po_number, description)
        `)
        .eq('timesheet_id', id)
        .order('created_at')
    )
    entries = (entriesResult.data || []) as any[]
    
    if (entriesResult.error) {
      console.error('Error loading entries:', entriesResult.error)
    }
  } catch (error) {
    console.error('Error fetching entries:', error)
    entries = []
  }

  // Get unbillable entries (with error handling)
  try {
    const unbillableResult = await withQueryTimeout(() =>
      supabase
        .from('timesheet_unbillable')
        .select('*')
        .eq('timesheet_id', id)
        .order('description')
    )
    unbillable = (unbillableResult.data || []) as any[]
    
    if (unbillableResult.error) {
      console.error('Error loading unbillable entries:', unbillableResult.error)
    }
  } catch (error) {
    console.error('Error fetching unbillable entries:', error)
    unbillable = []
  }

  const weekDates = getWeekDates(timesheet.week_ending)
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

  const calculateTotal = (entry: any): number => {
    return (entry.mon_hours || 0) + (entry.tue_hours || 0) + (entry.wed_hours || 0) + 
           (entry.thu_hours || 0) + (entry.fri_hours || 0) + (entry.sat_hours || 0) + (entry.sun_hours || 0)
  }

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

  // Calculate totals with error handling
  let billableTotal = 0
  let unbillableTotal = 0
  try {
    billableTotal = entries?.reduce((sum, e) => sum + calculateTotal(e), 0) || 0
    unbillableTotal = unbillable?.reduce((sum, e) => sum + calculateTotal(e), 0) || 0
  } catch (error) {
    console.error('Error calculating totals:', error)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Details" showBack backUrl="/dashboard/timesheets" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-6">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Weekly Timesheet Details</h1>
                <p className="text-gray-600 dark:text-gray-300 mt-1">
                  Week Ending: {formatWeekEnding(timesheet.week_ending)}
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  Employee: {timesheet.user_profiles.name}
                </p>
              </div>
              <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium shrink-0 ${getStatusColor(timesheet.status)}`}>
                {getStatusIcon(timesheet.status)}
                {timesheet.status}
              </span>
            </div>

            {/* Billable Entries */}
            {entries && entries.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Time</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100">Client/Project</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100">PO#</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100">Task Description</th>
                        {weekDates.days.map((day, idx) => (
                          <th key={idx} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm text-gray-900 dark:text-gray-100">
                            {format(day, 'EEE')}
                          </th>
                        ))}
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm text-gray-900 dark:text-gray-100">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => (
                        <tr key={idx}>
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                            {entry.sites?.name || 'N/A'}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                            {entry.purchase_orders?.po_number || 'N/A'}
                          </td>
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                            {entry.task_description}
                          </td>
                          {days.map((day) => (
                            <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                              {(entry[`${day}_hours`] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                            {calculateTotal(entry).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Billable Total: {billableTotal.toFixed(2)} hours</p>
              </div>
            )}

            {/* Unbillable Entries */}
            {unbillable && unbillable.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Unbillable Time</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700">
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100">Description</th>
                        {weekDates.days.map((day, idx) => (
                          <th key={idx} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm text-gray-900 dark:text-gray-100">
                            {format(day, 'EEE')}
                          </th>
                        ))}
                        <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm text-gray-900 dark:text-gray-100">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unbillable.map((entry) => (
                        <tr key={entry.id}>
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {entry.description}
                          </td>
                          {days.map((day) => (
                            <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                              {(entry[`${day}_hours`] || 0).toFixed(2)}
                            </td>
                          ))}
                          <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                            {calculateTotal(entry).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Unbillable Total: {unbillableTotal.toFixed(2)} hours</p>
              </div>
            )}

            {/* Grand Total */}
            <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg mb-6">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">GRAND TOTAL</span>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{(billableTotal + unbillableTotal).toFixed(2)} hours</span>
              </div>
            </div>

            {/* Signatures */}
            {timesheet.timesheet_signatures && timesheet.timesheet_signatures.length > 0 && (
              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Approvals</h3>
                <div className="space-y-3">
                  {timesheet.timesheet_signatures.map((sig: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{sig.signer_role}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{sig.user_profiles.name}</p>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(sig.signed_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {timesheet.status === 'rejected' && timesheet.rejection_reason && (
              <div className="border-t pt-6 mt-6">
                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
                  <p className="font-semibold text-red-900 dark:text-red-300 mb-1">Rejection note (required change):</p>
                  <p className="text-red-700 dark:text-red-300">{timesheet.rejection_reason}</p>
                </div>
              </div>
            )}

            {timesheet.status === 'submitted' && timesheet.rejection_reason && canApprove && (
              <div className="border-t pt-6 mt-6">
                <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-300 mb-1">Rejection note (from previous rejection):</p>
                    <p className="text-amber-800 dark:text-amber-200">{timesheet.rejection_reason}</p>
                  </div>
                  <form action={`/dashboard/timesheets/${timesheet.id}/clear-rejection-note`} method="post" className="inline">
                    <button
                      type="submit"
                      className="bg-amber-600 text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-amber-700"
                    >
                      Clear note
                    </button>
                  </form>
                </div>
              </div>
            )}

            <div className="border-t pt-6 mt-6 flex flex-wrap gap-2 sm:gap-4">
              <Link
                href={`/dashboard/timesheets/${timesheet.id}/export`}
                className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Export Timesheet
              </Link>
              {timesheet.status === 'draft' && timesheet.user_id === user.id && (
                <Link
                  href={`/dashboard/timesheets/${timesheet.id}/edit`}
                  className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Edit
                </Link>
              )}
              {timesheet.status === 'rejected' && timesheet.user_id === user.id && (
                <Link
                  href={`/dashboard/timesheets/${timesheet.id}/edit`}
                  className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Edit & resubmit
                </Link>
              )}
              {timesheet.status === 'submitted' && canApprove && ['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role) && (
                <>
                  <form action={`/dashboard/approvals/${timesheet.id}/approve`} method="post" className="inline">
                    <button
                      type="submit"
                      className="min-h-[44px] sm:min-h-0 bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      Approve
                    </button>
                  </form>
                  <Link
                    href={`/dashboard/approvals/${timesheet.id}/reject-form`}
                    className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    <XCircle className="h-4 w-4 shrink-0" />
                    Reject
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
