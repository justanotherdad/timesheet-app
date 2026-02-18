import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import ApprovedTimesheetsClient from './ApprovedTimesheetsClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

type SearchParams = { user?: string; start?: string; end?: string; sort?: string; dir?: string }

export default async function ApprovedTimesheetsPage(props: { searchParams: Promise<SearchParams> }) {
  const { searchParams } = props
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const params = await searchParams
  const filterUser = params.user || ''
  const filterStart = params.start || ''
  const filterEnd = params.end || ''
  const sortBy = params.sort || 'approved_at'
  const sortDir = (params.dir || 'desc') as 'asc' | 'desc'

  const adminSupabase = createAdminClient()

  // Get user IDs to query: admins see all, supervisors/managers see their reports + self
  let userIds: string[] = []
  if (['admin', 'super_admin'].includes(user.profile.role)) {
    const usersResult = await withQueryTimeout(() =>
      adminSupabase.from('user_profiles').select('id, name').order('name')
    )
    const allUsers = (usersResult.data || []) as { id: string; name: string }[]
    userIds = allUsers.map((u) => u.id)
  } else {
    const reportsResult = await withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('id')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsResult.data || []) as { id: string }[]
    userIds = [user.id, ...reports.map((r) => r.id)]
  }

  if (userIds.length === 0 && !['admin', 'super_admin'].includes(user.profile.role)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Approved Timesheets" showBack backUrl="/dashboard" user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">No direct reports found.</p>
          </div>
        </div>
      </div>
    )
  }

  // 1. Fetch fully approved timesheets (status = 'approved')
  let approvedQuery = adminSupabase
    .from('weekly_timesheets')
    .select('*, user_profiles!user_id(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)')
    .eq('status', 'approved')

  if (userIds.length > 0) {
    approvedQuery = approvedQuery.in('user_id', userIds)
  }
  if (filterUser) approvedQuery = approvedQuery.eq('user_id', filterUser)
  if (filterStart) approvedQuery = approvedQuery.gte('week_ending', filterStart)
  if (filterEnd) approvedQuery = approvedQuery.lte('week_ending', filterEnd)

  const approvedResult = await withQueryTimeout(() => approvedQuery)
  const fullyApproved = (approvedResult.data || []) as any[]

  // 2. Fetch partially approved: submitted timesheets where current user has signed
  let partiallyApproved: any[] = []
  const signedResult = await withQueryTimeout(() =>
    adminSupabase
      .from('timesheet_signatures')
      .select('timesheet_id')
      .eq('signer_id', user.id)
  )
  const signedTimesheetIds = ((signedResult.data || []) as { timesheet_id: string }[]).map((r) => r.timesheet_id)

  if (signedTimesheetIds.length > 0) {
    let partialQuery = adminSupabase
      .from('weekly_timesheets')
      .select('*, user_profiles!user_id(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)')
      .eq('status', 'submitted')
      .in('id', signedTimesheetIds)

    if (userIds.length > 0) {
      partialQuery = partialQuery.in('user_id', userIds)
    }
    if (filterUser) partialQuery = partialQuery.eq('user_id', filterUser)
    if (filterStart) partialQuery = partialQuery.gte('week_ending', filterStart)
    if (filterEnd) partialQuery = partialQuery.lte('week_ending', filterEnd)

    const partialResult = await withQueryTimeout(() => partialQuery)
    partiallyApproved = (partialResult.data || []) as any[]
  }

  // Merge and deduplicate (prefer fully approved if both exist - shouldn't happen)
  const seenIds = new Set<string>()
  let timesheets: any[] = []
  ;[...fullyApproved, ...partiallyApproved].forEach((ts) => {
    if (!seenIds.has(ts.id)) {
      seenIds.add(ts.id)
      timesheets.push(ts)
    }
  })

  // Fetch signatures for With/With (person) columns
  let signaturesByTimesheetId: Record<string, string[]> = {}
  let approverNamesById: Record<string, string> = {}
  if (timesheets.length > 0) {
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', timesheets.map((t) => t.id))
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    sigs.forEach((s) => {
      if (!signaturesByTimesheetId[s.timesheet_id]) signaturesByTimesheetId[s.timesheet_id] = []
      signaturesByTimesheetId[s.timesheet_id].push(s.signer_id)
    })

    const nextApproverIds = new Set<string>()
    timesheets.forEach((ts: any) => {
      if (ts.status !== 'submitted') return
      const profile = ts.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string } | undefined
      if (!profile) return
      const chain: string[] = []
      const first = profile.supervisor_id || profile.reports_to_id
      if (first) chain.push(first)
      if (profile.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = signaturesByTimesheetId[ts.id] || []
      const nextId = chain.find((uid) => !signedIds.includes(uid))
      if (nextId) nextApproverIds.add(nextId)
    })
    if (nextApproverIds.size > 0) {
      const approversRes = await withQueryTimeout(() =>
        adminSupabase.from('user_profiles').select('id, name').in('id', [...nextApproverIds])
      )
      const approvers = (approversRes.data || []) as { id: string; name: string }[]
      approvers.forEach((a) => { approverNamesById[a.id] = a.name || 'Unknown' })
    }
  }

  // Sort
  const orderAsc = sortDir === 'asc'
  const sortFn = (a: any, b: any) => {
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
      // approved_at - for submitted use submitted_at as fallback
      const aVal = a.approved_at || a.submitted_at || a.created_at || ''
      const bVal = b.approved_at || b.submitted_at || b.created_at || ''
      cmp = aVal.localeCompare(bVal)
    }
    return orderAsc ? cmp : -cmp
  }
  timesheets = [...timesheets].sort(sortFn)

  // Fetch users for filter dropdown
  let filterUsers: { id: string; name: string }[] = []
  if (['admin', 'super_admin'].includes(user.profile.role)) {
    const usersRes = await withQueryTimeout(() =>
      adminSupabase.from('user_profiles').select('id, name').order('name')
    )
    filterUsers = (usersRes.data || []) as { id: string; name: string }[]
  } else {
    const reportsRes = await withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('id, name')
        .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
    )
    const reports = (reportsRes.data || []) as { id: string; name: string }[]
    const selfRes = await withQueryTimeout(() =>
      adminSupabase.from('user_profiles').select('id, name').eq('id', user.id).single()
    )
    const self = selfRes.data as { id: string; name: string } | null
    const all = self ? [self, ...reports.filter((r) => r.id !== user.id)] : reports
    filterUsers = all.sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Approved Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <ApprovedTimesheetsClient
            timesheets={timesheets}
            filterUsers={filterUsers}
            filterUser={filterUser}
            filterStart={filterStart}
            filterEnd={filterEnd}
            sortBy={sortBy}
            sortDir={sortDir}
            signaturesByTimesheetId={signaturesByTimesheetId}
            approverNamesById={approverNamesById}
            userRole={user.profile.role}
          />
        </div>
      </div>
    </div>
  )
}
