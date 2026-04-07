import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Update a timesheet delegation. Delegator may edit own row; admin/super_admin may edit any (including delegator_id). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const {
    delegate_id,
    start_date,
    end_date,
    delegator_id: bodyDelegatorId,
    include_delegation_note_in_approval,
  } = body

  const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)
  const adminSupabase = createAdminClient()

  const { data: existing, error: fetchErr } = await adminSupabase
    .from('approval_delegations')
    .select('id, delegator_id, delegate_id, start_date, end_date, include_delegation_note_in_approval')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Delegation not found' }, { status: 404 })
  }

  if (!isAdmin && existing.delegator_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let nextDelegatorId = existing.delegator_id as string
  if (isAdmin && bodyDelegatorId != null && bodyDelegatorId !== '') {
    nextDelegatorId = bodyDelegatorId
  }

  const nextDelegateId = delegate_id !== undefined ? delegate_id : existing.delegate_id
  const nextStart = start_date !== undefined ? String(start_date).slice(0, 10) : existing.start_date
  const nextEnd = end_date !== undefined ? String(end_date).slice(0, 10) : existing.end_date
  const nextNote =
    include_delegation_note_in_approval !== undefined
      ? Boolean(include_delegation_note_in_approval)
      : (existing as { include_delegation_note_in_approval?: boolean }).include_delegation_note_in_approval ?? false

  if (nextDelegateId === nextDelegatorId) {
    return NextResponse.json({ error: 'Delegator and delegate must be different people' }, { status: 400 })
  }

  const sd = new Date(nextStart)
  const ed = new Date(nextEnd)
  if (isNaN(sd.getTime()) || isNaN(ed.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }
  if (ed < sd) {
    return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 })
  }

  const updateRow = {
    delegator_id: nextDelegatorId,
    delegate_id: nextDelegateId,
    start_date: nextStart,
    end_date: nextEnd,
    include_delegation_note_in_approval: nextNote,
  }

  if (isAdmin) {
    const { data, error } = await adminSupabase
      .from('approval_delegations')
      .update(updateRow)
      .eq('id', id)
      .select('id, delegator_id, delegate_id, start_date, end_date, created_at, include_delegation_note_in_approval')
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('approval_delegations')
    .update(updateRow)
    .eq('id', id)
    .eq('delegator_id', user.id)
    .select('id, delegator_id, delegate_id, start_date, end_date, created_at, include_delegation_note_in_approval')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

/** Delete a timesheet delegation. Delegator may delete own row; admin/super_admin may delete any. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user || !['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)

  if (isAdmin) {
    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.from('approval_delegations').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('approval_delegations')
    .delete()
    .eq('id', id)
    .eq('delegator_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
