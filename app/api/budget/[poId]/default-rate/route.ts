import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

/**
 * PATCH: set (or clear) the per-PO default budget bill rate used to estimate
 * budget $ for project-matrix rows that have no explicit / bid-sheet rate.
 *
 * Body: { default_budget_bill_rate: number | null | '' }
 *   - a non-negative number sets the default
 *   - null or '' clears it (fall back to the blended rate)
 *
 * Scoped to this PO only (update ... where id = poId), so it can never affect
 * any other purchase order.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, budget_type')
    .eq('id', poId)
    .single()
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.budget_type !== 'project') {
    return NextResponse.json({ error: 'Not a project PO' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const raw = (body as { default_budget_bill_rate?: number | string | null }).default_budget_bill_rate

  let value: number | null
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    value = null
  } else {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: 'default_budget_bill_rate must be a non-negative number' },
        { status: 400 }
      )
    }
    value = n
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { error } = await admin
    .from('purchase_orders')
    .update({ default_budget_bill_rate: value })
    .eq('id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, default_budget_bill_rate: value })
}
