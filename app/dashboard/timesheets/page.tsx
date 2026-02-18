import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import MyTimesheetsTable from '@/components/MyTimesheetsTable'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

type SearchParams = { sort?: string; dir?: string }

export default async function TimesheetsPage(props: { searchParams?: Promise<SearchParams> }) {
  const params = props.searchParams ? await props.searchParams : {}
  const sortBy = params.sort || 'week_ending'
  const sortDir = (params.dir || 'desc') as 'asc' | 'desc'

  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Get timesheets based on user role
  let timesheetsResult
  if (['admin', 'super_admin'].includes(user.profile.role)) {
    // Admins see all timesheets (include approval chain for "With" column)
    timesheetsResult = await withQueryTimeout(() =>
      supabase
        .from('weekly_timesheets')
        .select(`
          *,
          user_profiles!user_id(name, email, reports_to_id, manager_id, supervisor_id, final_approver_id)
        `)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  } else if (['supervisor', 'manager'].includes(user.profile.role)) {
    // Users who have this user as reports_to, supervisor, manager, or final approver (skip-none: next in chain)
    const reportsResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsResult.data || []) as Array<{ id: string }>
    const reportIds = reports.map(r => r.id)
    const allUserIds = [user.id, ...reportIds]

    // Use admin client so RLS does not block reading other users' timesheets (we already scoped to reports)
    const adminSupabase = createAdminClient()
    timesheetsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('weekly_timesheets')
        .select(`
          *,
          user_profiles!user_id(name, email)
        `)
        .in('user_id', allUserIds)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  } else {
    // Regular employees see only their own timesheets
    timesheetsResult = await withQueryTimeout(() =>
      supabase
        .from('weekly_timesheets')
        .select('*')
        .eq('user_id', user.id)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
    )
  }

  const timesheets = (timesheetsResult.data || []) as any[]

  // Auto-approve any submitted timesheets where employee has no approvers (final approver with no one above)
  let timesheetsForDisplay = timesheets
  if (['admin', 'super_admin'].includes(user.profile.role)) {
    const autoApproved = await Promise.all(
      timesheets
        .filter((ts: any) => ts.status === 'submitted')
        .map((ts: any) => checkAndAutoApproveIfFinal(ts.id))
    )
    if (autoApproved.some(Boolean)) {
      const ids = timesheets.map((t: any) => t.id)
      const adminSupabaseForRefetch = createAdminClient()
      const { data: refetched } = await adminSupabaseForRefetch
        .from('weekly_timesheets')
        .select(`
          *,
          user_profiles!user_id(name, email, reports_to_id, manager_id, supervisor_id, final_approver_id)
        `)
        .in('id', ids)
        .order('week_ending', { ascending: false })
        .order('created_at', { ascending: false })
      timesheetsForDisplay = (refetched || []) as any[]
    }
  }

  // For admin/super_admin: fetch signatures (signer_id) to show "With" in approval workflow
  // Use admin client so RLS does not block reading signatures
  let signaturesByTimesheetId: Record<string, { signer_id: string }[]> = {}
  let approverNamesById: Record<string, string> = {}
  if (['admin', 'super_admin'].includes(user.profile.role) && timesheetsForDisplay.length > 0) {
    const ids = timesheetsForDisplay.map((ts: any) => ts.id)
    const adminSupabase = createAdminClient()
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', ids)
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signaturesByTimesheetId[s.timesheet_id]) signaturesByTimesheetId[s.timesheet_id] = []
      signaturesByTimesheetId[s.timesheet_id].push({ signer_id: s.signer_id })
    })

    // Collect next-approver user IDs for submitted timesheets (need chain from user_profiles)
    const nextApproverIds = new Set<string>()
    timesheetsForDisplay.forEach((ts: any) => {
      if (ts.status !== 'submitted') return
      const profile = ts.user_profiles as { reports_to_id?: string; manager_id?: string; supervisor_id?: string; final_approver_id?: string } | undefined
      if (!profile) return
      const chain: string[] = []
      const firstApprover = profile.supervisor_id || profile.reports_to_id
      if (firstApprover) chain.push(firstApprover)
      if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = (signaturesByTimesheetId[ts.id] || []).map((s: { signer_id: string }) => s.signer_id)
      const nextId = chain.find((uid) => !signedIds.includes(uid))
      if (nextId) nextApproverIds.add(nextId)
    })
    if (nextApproverIds.size > 0) {
      const approversResult = await withQueryTimeout(() =>
        adminSupabase.from('user_profiles').select('id, name').in('id', [...nextApproverIds])
      )
      const approvers = (approversResult.data || []) as { id: string; name: string }[]
      approvers.forEach((a) => {
        approverNamesById[a.id] = a.name || 'Unknown'
      })
    }
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
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
      case 'rejected':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
      case 'submitted':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
    }
  }

  // Sort timesheets for display
  const orderAsc = sortDir === 'asc'
  const sortedTimesheets = [...timesheetsForDisplay].sort((a: any, b: any) => {
    let cmp = 0
    if (sortBy === 'week_ending') {
      cmp = (a.week_ending || '').localeCompare(b.week_ending || '')
    } else if (sortBy === 'week_starting') {
      cmp = (a.week_starting || '').localeCompare(b.week_starting || '')
    } else if (sortBy === 'created_at') {
      cmp = (a.created_at || '').localeCompare(b.created_at || '')
    } else if (sortBy === 'status') {
      cmp = (a.status || '').localeCompare(b.status || '')
    } else if (sortBy === 'user') {
      cmp = (a.user_profiles?.name || '').toLowerCase().localeCompare((b.user_profiles?.name || '').toLowerCase())
    } else {
      cmp = (a.week_ending || '').localeCompare(b.week_ending || '')
    }
    return orderAsc ? cmp : -cmp
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="My Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="w-full max-w-[1920px] mx-auto">
          <div className="flex justify-end mb-6">
            <a
              href="/dashboard/timesheets/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-block"
            >
              New Timesheet
            </a>
          </div>

          {sortedTimesheets && sortedTimesheets.length > 0 ? (
            <>
              {/* Mobile: cards with Employee, Week Ending, Status, View button only */}
              <div className="md:hidden space-y-3">
                {sortedTimesheets.map((ts) => (
                  <div
                    key={ts.id}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        {(['admin', 'super_admin', 'supervisor', 'manager'].includes(user.profile.role)) && (
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {ts.user_profiles?.name || 'Unknown'}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Week ending {formatWeekEnding(ts.week_ending)}
                        </p>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ts.status)}`}>
                          {getStatusIcon(ts.status)}
                          {ts.status}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/timesheets/${ts.id}`}
                        className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: sortable table */}
              <MyTimesheetsTable
                timesheets={sortedTimesheets}
                sortBy={sortBy}
                sortDir={sortDir}
                user={user}
                signaturesByTimesheetId={signaturesByTimesheetId}
                approverNamesById={approverNamesById}
              />
            </>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-300 mb-4">No timesheets found.</p>
              <a
                href="/dashboard/timesheets/new"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Create your first timesheet →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
