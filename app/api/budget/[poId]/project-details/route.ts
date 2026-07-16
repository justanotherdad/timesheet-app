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
  const { system_name, system_code, deliverable_name, activity_name, budgeted_hours, description, bill_rate } = body as Record<string, unknown>

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Optional per-row budget bill rate (item #7). undefined = leave default,
  // null / '' = clear, otherwise a non-negative number.
  let billRate: number | null | undefined
  if (bill_rate === undefined) billRate = undefined
  else if (bill_rate === null || String(bill_rate).trim() === '') billRate = null
  else {
    const n = Number(bill_rate)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'bill_rate must be a non-negative number' }, { status: 400 })
    }
    billRate = n
  }

  try {
    const { id } = await upsertProjectDetailByNames(admin, po.site_id, poId, {
      systemName: String(system_name || ''),
      systemCode: system_code != null && String(system_code).trim() !== '' ? String(system_code).trim() : null,
      deliverableName: String(deliverable_name || ''),
      activityName: String(activity_name || ''),
      budgetedHours: Number(budgeted_hours) || 0,
      description: description as string | null | undefined,
      billRate,
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
  const { id, budgeted_hours, description, status_pct, system_id, deliverable_id, activity_id, bill_rate } = body as {
    id?: string
    budgeted_hours?: number
    description?: string | null
    bill_rate?: number | string | null
    /**
     * Manual completion override for this cell, as either a fraction (0..1)
     * or a percent (0..100). Pass null explicitly to clear the override and
     * fall back to the auto status. Omitted = leave as-is.
     */
    status_pct?: number | null
    /**
     * Re-point the row at a different (system, deliverable, activity)
     * combination. All three must be sent together when changing the
     * combo; sending only some is rejected to avoid a partial / invalid
     * triplet. Existing timesheet entries on the old combo are NOT
     * automatically re-routed — they remain on their original FKs and may
     * surface as unmatched until reassigned via the Reassign dialog.
     */
    system_id?: string
    deliverable_id?: string
    activity_id?: string
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
  // Per-row budget bill rate (item #7): null / '' clears it (fall back to
  // bid/blended rate); a number sets it. Omitted = leave as-is.
  if (bill_rate !== undefined) {
    if (bill_rate === null || String(bill_rate).trim() === '') {
      updates.bill_rate = null
    } else {
      const n = Number(bill_rate)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'bill_rate must be a non-negative number' }, { status: 400 })
      }
      updates.bill_rate = n
    }
  }
  if (status_pct !== undefined) {
    if (status_pct === null) {
      updates.status_pct = null
    } else {
      const raw = Number(status_pct)
      if (!Number.isFinite(raw)) {
        return NextResponse.json({ error: 'status_pct must be a number or null' }, { status: 400 })
      }
      // Accept either a percent (0..100) or a fraction (0..1). Anything > 1
      // is treated as a percent. Clamp to [0, 1] to match the DB constraint.
      const fraction = raw > 1 ? raw / 100 : raw
      if (fraction < 0 || fraction > 1) {
        return NextResponse.json(
          { error: 'status_pct must be between 0 and 100% (or 0..1 as a fraction)' },
          { status: 400 }
        )
      }
      updates.status_pct = fraction
    }
  }
  // Combo re-pointing: require all three IDs together so we never write a
  // partial / inconsistent triplet to project_details.
  const anyComboField = system_id !== undefined || deliverable_id !== undefined || activity_id !== undefined
  if (anyComboField) {
    if (!system_id || !deliverable_id || !activity_id) {
      return NextResponse.json(
        { error: 'system_id, deliverable_id, and activity_id must be sent together when changing the combo' },
        { status: 400 }
      )
    }
    updates.system_id = system_id
    updates.deliverable_id = deliverable_id
    updates.activity_id = activity_id
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
