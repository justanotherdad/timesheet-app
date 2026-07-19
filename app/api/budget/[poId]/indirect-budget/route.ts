import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

/** List manual BUDGET indirect lines for this PO. */
export async function GET(_req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const { data, error } = await admin
    .from('po_indirect_budget')
    .select('id, label, amount, created_at')
    .eq('po_id', poId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data ?? [] })
}

/** Create a manual BUDGET indirect line (projection; does not affect balance). */
export async function POST(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const label = String((body as { label?: string }).label || '').trim()
  const amountRaw = (body as { amount?: number | string }).amount
  if (!label) return NextResponse.json({ error: 'Label is required' }, { status: 400 })
  const amount = Number(amountRaw)
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Amount must be a non-negative number' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('po_indirect_budget')
    .insert({ po_id: poId, label, amount, created_by: user.id })
    .select('id, label, amount, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
