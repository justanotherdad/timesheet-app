import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  type PayrollEarningType,
  buildPayrollChangeDescription,
  logPayrollAudit,
} from '@/lib/payroll'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'super_admin']

const EDITABLE_FIELDS: Array<keyof PayrollEarningType> = [
  'earning_type', 'det', 'detcode', 'area', 'dropdown', 'where_value', 'overtime', 'rule', 'rule_value', 'looks_at', 'sort_order',
]

function pickFields(body: Record<string, unknown>): Partial<PayrollEarningType> {
  const out: Record<string, unknown> = {}
  for (const f of EDITABLE_FIELDS) {
    if (f in body) {
      if (f === 'sort_order') out[f] = Number(body[f]) || 0
      else out[f] = body[f] == null ? null : String(body[f])
    }
  }
  return out as Partial<PayrollEarningType>
}

/** GET: list earning types (sorted) + last 5 audit entries. Admin-only. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const [{ data: rows }, { data: audit }] = await Promise.all([
    admin
      .from('payroll_earning_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('earning_type', { ascending: true }),
    admin
      .from('payroll_earning_type_audit')
      .select('id, earning_type_id, actor_id, actor_name, description, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return NextResponse.json({ rows: rows || [], audit: audit || [] })
}

/** POST: create a new earning type. Admin-only. */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const fields = pickFields(body)
  if (!fields.earning_type || !String(fields.earning_type).trim()) {
    return NextResponse.json({ error: 'Earning Type is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payroll_earning_types')
    .insert(fields)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPayrollAudit({
    earningTypeId: data.id,
    actorId: user.id,
    actorName: user.profile.name,
    description: buildPayrollChangeDescription(null, data as PayrollEarningType),
  })

  return NextResponse.json({ row: data })
}

/** PATCH: update an existing earning type. Admin-only. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin.from('payroll_earning_types').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Earning type not found' }, { status: 404 })

  const updatePayload: Record<string, unknown> = {
    ...pickFields(body),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await admin
    .from('payroll_earning_types')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPayrollAudit({
    earningTypeId: id,
    actorId: user.id,
    actorName: user.profile.name,
    description: buildPayrollChangeDescription(before as PayrollEarningType, data as PayrollEarningType),
  })

  return NextResponse.json({ row: data })
}

/** DELETE: remove an earning type. Admin-only. Pass ?id=... */
export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin.from('payroll_earning_types').select('*').eq('id', id).maybeSingle()
  const { error } = await admin.from('payroll_earning_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    await logPayrollAudit({
      earningTypeId: id,
      actorId: user.id,
      actorName: user.profile.name,
      description: `Deleted earning type "${(before as PayrollEarningType).earning_type}"`,
    })
  }

  return NextResponse.json({ ok: true })
}
