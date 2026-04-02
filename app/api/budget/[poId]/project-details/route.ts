import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { upsertProjectDetailByNames } from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

export async function POST(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const { data: po } = await supabase.from('purchase_orders').select('site_id, budget_type').eq('id', poId).single()
  if (!po || po.budget_type !== 'project') return NextResponse.json({ error: 'Not a project PO' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { system_name, system_code, deliverable_name, activity_name, budgeted_hours, description } = body as Record<string, unknown>

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    const { id } = await upsertProjectDetailByNames(admin, po.site_id, poId, {
      systemName: String(system_name || ''),
      systemCode: system_code != null && String(system_code).trim() !== '' ? String(system_code).trim() : null,
      deliverableName: String(deliverable_name || ''),
      activityName: String(activity_name || ''),
      budgetedHours: Number(budgeted_hours) || 0,
      description: description as string | null | undefined,
    })
    return NextResponse.json({ id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save row'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { id, budgeted_hours, description } = body as {
    id?: string
    budgeted_hours?: number
    description?: string | null
  }
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const updates: Record<string, unknown> = {}
  if (budgeted_hours !== undefined) updates.budgeted_hours = Number(budgeted_hours) || 0
  if (description !== undefined) {
    updates.description = description === null ? null : String(description).trim() || null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin.from('project_details').update(updates).eq('id', id).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { error } = await admin.from('project_details').delete().eq('id', id).eq('po_id', poId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
