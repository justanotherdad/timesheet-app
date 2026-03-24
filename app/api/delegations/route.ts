import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** List current user's delegations (as delegator). Only approvers can access. Optional ?users=1 to include all users for delegate picker. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const includeUsers = searchParams.get('users') === '1'

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('approval_delegations')
    .select('id, delegate_id, start_date, end_date, created_at')
    .eq('delegator_id', user.id)
    .order('start_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const delegateIds = [...new Set((rows || []).map((r: any) => r.delegate_id))]
  const { data: profiles } = delegateIds.length > 0
    ? await supabase.from('user_profiles').select('id, name').in('id', delegateIds)
    : { data: [] }
  const profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.name || 'Unknown']))

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

/** Create a delegation. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { delegate_id, start_date, end_date } = body

  if (!delegate_id || !start_date || !end_date) {
    return NextResponse.json({ error: 'delegate_id, start_date, and end_date are required' }, { status: 400 })
  }

  if (delegate_id === user.id) {
    return NextResponse.json({ error: 'You cannot delegate to yourself' }, { status: 400 })
  }

  const startDate = new Date(start_date)
  const endDate = new Date(end_date)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('approval_delegations')
    .insert({
      delegator_id: user.id,
      delegate_id,
      start_date: start_date.slice(0, 10),
      end_date: end_date.slice(0, 10),
    })
    .select('id, delegate_id, start_date, end_date, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
