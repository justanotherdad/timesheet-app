import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'
import PendingApprovalsClient from './PendingApprovalsClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

type SearchParams = { sort?: string; dir?: string }

export default async function ApprovalsPage(props: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const params = await props.searchParams
  const sortBy = params.sort || 'submitted_at'
  const sortDir = (params.dir || 'asc') as 'asc' | 'desc'

  const adminSupabase = createAdminClient()

  const reportsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('user_profiles')
      .select('id')
      .or(`reports_to_id.eq.${user.id},supervisor_id.eq.${user.id},manager_id.eq.${user.id},final_approver_id.eq.${user.id}`)
  )

  const reports = (reportsResult.data || []) as Array<{ id: string }>

  if (!reports || reports.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6 sm:p-8 text-center">
            <p className="text-gray-600 dark:text-gray-300">No direct reports found. You don&apos;t have any timesheets to approve.</p>
          </div>
        </div>
      </div>
    )
  }

  const reportIds = reports.map(r => r.id)

  const timesheetsResult = await withQueryTimeout(() =>
    adminSupabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id!inner(name, email, reports_to_id, supervisor_id, manager_id, final_approver_id)
      `)
      .in('user_id', reportIds)
      .eq('status', 'submitted')
  )

  const allSubmitted = (timesheetsResult.data || []) as any[]

  let timesheets = allSubmitted
  if (allSubmitted.length > 0) {
    const sigResult = await withQueryTimeout(() =>
      adminSupabase
        .from('timesheet_signatures')
        .select('timesheet_id, signer_id')
        .in('timesheet_id', allSubmitted.map((t: any) => t.id))
    )
    const sigs = (sigResult.data || []) as { timesheet_id: string; signer_id: string }[]
    const signedByTimesheet: Record<string, Set<string>> = {}
    sigs.forEach((s) => {
      if (!signedByTimesheet[s.timesheet_id]) signedByTimesheet[s.timesheet_id] = new Set()
      signedByTimesheet[s.timesheet_id].add(s.signer_id)
    })

    timesheets = allSubmitted.filter((ts: any) => {
      const profile = ts.user_profiles as { reports_to_id?: string; supervisor_id?: string; manager_id?: string; final_approver_id?: string }
      const chain: string[] = []
      const firstApprover = profile?.supervisor_id || profile?.reports_to_id
      if (firstApprover) chain.push(firstApprover)
      if (profile?.manager_id && !chain.includes(profile.manager_id)) chain.push(profile.manager_id)
      if (profile?.final_approver_id && !chain.includes(profile.final_approver_id)) chain.push(profile.final_approver_id)
      const signedIds = signedByTimesheet[ts.id] || new Set<string>()
      const nextId = chain.find((uid) => !signedIds.has(uid))
      return nextId === user.id
    })
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
      cmp = (a.submitted_at || a.created_at || '').localeCompare(b.submitted_at || b.created_at || '')
    }
    return orderAsc ? cmp : -cmp
  }
  timesheets = [...timesheets].sort(sortFn)

  // With label based on current user's position in chain
  let withLabel = 'With Approver'
  const firstTs = timesheets[0]
  if (firstTs?.user_profiles) {
    const profile = firstTs.user_profiles as { supervisor_id?: string; reports_to_id?: string; manager_id?: string; final_approver_id?: string }
    if (user.id === profile.supervisor_id || user.id === profile.reports_to_id) withLabel = 'With Supervisor'
    else if (user.id === profile.manager_id) withLabel = 'With Manager'
    else if (user.id === profile.final_approver_id) withLabel = 'With Final Approver'
  }

  const currentUserName = user.profile.name || 'You'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Pending Approvals" titleHref="/dashboard/approvals" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          <PendingApprovalsClient
            timesheets={timesheets}
            sortBy={sortBy}
            sortDir={sortDir}
            currentUserName={currentUserName}
            withLabel={withLabel}
          />
        </div>
      </div>
    </div>
  )
}
