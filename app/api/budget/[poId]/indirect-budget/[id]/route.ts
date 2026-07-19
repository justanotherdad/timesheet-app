import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ poId: string; id: string }> }) {
  const { poId, id } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ((body as { label?: string }).label !== undefined) {
    const label = String((body as { label?: string }).label || '').trim()
    if (!label) return NextResponse.json({ error: 'Label is required' }, { status: 400 })
    updates.label = label
  }
  if ((body as { amount?: number | string }).amount !== undefined) {
    const amount = Number((body as { amount?: number | string }).amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'Amount must be a non-negative number' }, { status: 400 })
    }
    updates.amount = amount
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { error } = await admin.from('po_indirect_budget').update(updates).eq('id', id).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ poId: string; id: string }> }) {
  const { poId, id } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { error } = await admin.from('po_indirect_budget').delete().eq('id', id).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
