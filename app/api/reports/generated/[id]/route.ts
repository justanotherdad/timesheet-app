import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type ReportRow = {
  id: string
  title: string
  created_by: string | null
  created_at: string
  expires_at: string
  po_ids: string[] | null
  snapshot: unknown
}

async function loadWithAccess(id: string) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { error: 'Server configuration error', status: 500 as const }
  }

  const { data } = await admin
    .from('generated_reports')
    .select('id, title, created_by, created_at, expires_at, po_ids, snapshot')
    .eq('id', id)
    .maybeSingle()
  const report = data as ReportRow | null
  if (!report) return { error: 'Report not found', status: 404 as const }

  const role = user.profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (!isAdmin) {
    const { data: grants } = await admin
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const granted = new Set((grants || []).map((g) => (g as { purchase_order_id: string }).purchase_order_id))
    const poIds = report.po_ids || []
    const allowed = poIds.length > 0 && poIds.every((pid) => granted.has(pid))
    if (!allowed) return { error: 'Access denied', status: 403 as const }
  }

  return { admin, user, report, isAdmin }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadWithAccess(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { report } = result
  return NextResponse.json({
    id: report.id,
    title: report.title,
    createdAt: report.created_at,
    expiresAt: report.expires_at,
    snapshot: report.snapshot,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadWithAccess(id)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const { admin, user, report, isAdmin } = result

  // Only the creator or an admin can delete a saved report.
  if (!isAdmin && report.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the creator or an admin can delete this report.' }, { status: 403 })
  }

  const { error } = await admin.from('generated_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
