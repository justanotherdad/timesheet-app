import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatWeekEnding } from '@/lib/utils'
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

  // Fetch approved timesheets
  let query = adminSupabase
    .from('weekly_timesheets')
    .select('*, user_profiles!user_id(name, email)')
    .eq('status', 'approved')

  if (userIds.length > 0) {
    query = query.in('user_id', userIds)
  }

  if (filterUser) {
    query = query.eq('user_id', filterUser)
  }

  if (filterStart) {
    query = query.gte('week_ending', filterStart)
  }

  if (filterEnd) {
    query = query.lte('week_ending', filterEnd)
  }

  const orderAsc = sortDir === 'asc'
  if (sortBy === 'week_ending') {
    query = query.order('week_ending', { ascending: orderAsc })
  } else if (sortBy === 'user') {
    query = query.order('user_id', { ascending: orderAsc })
  } else {
    query = query.order('approved_at', { ascending: orderAsc })
  }

  const timesheetsResult = await withQueryTimeout(() => query)
  let timesheets = (timesheetsResult.data || []) as any[]

  // For sort by user name, we need to sort in memory (user_profiles is a joined object)
  if (sortBy === 'user' && timesheets.length > 0) {
    timesheets = [...timesheets].sort((a, b) => {
      const nameA = (a.user_profiles?.name || '').toLowerCase()
      const nameB = (b.user_profiles?.name || '').toLowerCase()
      return sortDir === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
    })
  }

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
          />
        </div>
      </div>
    </div>
  )
}
