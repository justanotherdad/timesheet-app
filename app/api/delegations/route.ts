import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function nameMapFromProfiles(profiles: { id: string; name?: string | null }[] | null) {
  return Object.fromEntries((profiles || []).map((p) => [p.id, p.name || 'Unknown']))
}

/** List delegations. Self: current user as delegator. ?admin=1: all delegations (admin/super_admin only). Optional ?users=1 for full user list (picker). */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const includeUsers = searchParams.get('users') === '1'
  const adminList = searchParams.get('admin') === '1'

  if (adminList) {
    if (!['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const adminSupabase = createAdminClient()
    const { data: rows, error } = await adminSupabase
      .from('approval_delegations')
      .select('id, delegator_id, delegate_id, start_date, end_date, created_at, include_delegation_note_in_approval')
      .order('start_date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const delegatorIds = [...new Set((rows || []).map((r: { delegator_id: string }) => r.delegator_id))]
    const delegateIds = [...new Set((rows || []).map((r: { delegate_id: string }) => r.delegate_id))]
    const allIds = [...new Set([...delegatorIds, ...delegateIds])]
    const { data: profiles } = allIds.length > 0
      ? await adminSupabase.from('user_profiles').select('id, name').in('id', allIds)
      : { data: [] }
    const names = nameMapFromProfiles(profiles as { id: string; name?: string | null }[])

    const delegations = (rows || []).map((r: any) => ({
      ...r,
      delegatorName: names[r.delegator_id] ?? 'Unknown',
      delegateName: names[r.delegate_id] ?? 'Unknown',
    }))

    if (includeUsers) {
      try {
        const { data: allProfiles } = await adminSupabase.from('user_profiles').select('id, name').order('name')
        const users = (allProfiles || []).map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
        return NextResponse.json({ delegations, users })
      } catch {
        return NextResponse.json({ delegations, users: [] as Array<{ id: string; name: string }> })
      }
    }
    return NextResponse.json({ delegations })
  }

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('approval_delegations')
    .select('id, delegate_id, start_date, end_date, created_at, include_delegation_note_in_approval')
    .eq('delegator_id', user.id)
    .order('start_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const delegateIds = [...new Set((rows || []).map((r: any) => r.delegate_id))]
  const { data: profiles } = delegateIds.length > 0
    ? await supabase.from('user_profiles').select('id, name').in('id', delegateIds)
    : { data: [] }
  const profilesMap = nameMapFromProfiles(profiles as { id: string; name?: string | null }[])

  const delegations = (rows || []).map((r: any) => ({
    ...r,
    delegateName: profilesMap[r.delegate_id] ?? 'Unknown',
  }))

  if (includeUsers) {
    try {
      const adminSupabase = createAdminClient()
      const { data: allProfiles } = await adminSupabase
        .from('user_profiles')
        .select('id, name')
        .order('name')
      const users = (allProfiles || []).map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
      return NextResponse.json({ delegations, users })
    } catch {
      return NextResponse.json({ delegations, users: [] as Array<{ id: string; name: string }> })
    }
  }

  return NextResponse.json(delegations)
}

/** Create a timesheet approval delegation. Self-service: delegator is current user. Admins may set `delegator_id` for another user. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { delegate_id, start_date, end_date, delegator_id: bodyDelegatorId, include_delegation_note_in_approval } = body

  if (!delegate_id || !start_date || !end_date) {
    return NextResponse.json({ error: 'delegate_id, start_date, and end_date are required' }, { status: 400 })
  }

  let delegatorId = user.id as string
  if (bodyDelegatorId != null && bodyDelegatorId !== user.id) {
    if (!['admin', 'super_admin'].includes(user.profile.role)) {
      return NextResponse.json({ error: 'Only admins can create delegations for other users' }, { status: 403 })
    }
    delegatorId = bodyDelegatorId
  }

  if (delegate_id === delegatorId) {
    return NextResponse.json({ error: 'Delegator and delegate must be different people' }, { status: 400 })
  }

  const startDate = new Date(start_date)
  const endDate = new Date(end_date)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 })
  }

  const row = {
    delegator_id: delegatorId,
    delegate_id,
    start_date: start_date.slice(0, 10),
    end_date: end_date.slice(0, 10),
    include_delegation_note_in_approval: Boolean(include_delegation_note_in_approval),
  }

  const useAdmin = delegatorId !== user.id
  const client = useAdmin ? createAdminClient() : await createClient()
  const { data, error } = await client
    .from('approval_delegations')
    .insert(row)
    .select('id, delegator_id, delegate_id, start_date, end_date, created_at, include_delegation_note_in_approval')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
