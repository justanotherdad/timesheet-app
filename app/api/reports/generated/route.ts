import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import type { GeneratedReportListItem } from '@/lib/generated-report'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  title: string
  created_at: string
  created_by_name: string | null
  expires_at: string
  include_hours: boolean
  po_ids: string[] | null
  po_numbers: string[] | null
  project_names: string[] | null
  client_names: string[] | null
}

/**
 * GET: list saved reports the user may view. Admins see all; others see only
 * reports whose POs are ALL within their po_budget_access grants. Expired
 * (>1 year) reports are purged first. Supports ?q= free-text search across PO
 * number, project name, client, and title.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Purge expired reports (best-effort).
  await admin.from('generated_reports').delete().lt('expires_at', new Date().toISOString())

  const role = user.profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  let grantedSet: Set<string> | null = null
  if (!isAdmin) {
    const { data: grants } = await admin
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    grantedSet = new Set((grants || []).map((g) => (g as { purchase_order_id: string }).purchase_order_id))
  }

  const { data } = await admin
    .from('generated_reports')
    .select('id, title, created_at, created_by_name, expires_at, include_hours, po_ids, po_numbers, project_names, client_names')
    .order('created_at', { ascending: false })
  let rows = (data || []) as Row[]

  if (grantedSet) {
    const g = grantedSet
    rows = rows.filter((r) => (r.po_ids || []).length > 0 && (r.po_ids || []).every((id) => g.has(id)))
  }

  const q = new URL(req.url).searchParams.get('q')?.trim().toLowerCase() || ''
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.title,
        ...(r.po_numbers || []),
        ...(r.project_names || []),
        ...(r.client_names || []),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  const reports: GeneratedReportListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    createdByName: r.created_by_name,
    expiresAt: r.expires_at,
    poNumbers: r.po_numbers || [],
    projectNames: r.project_names || [],
    clientNames: r.client_names || [],
    includeHours: r.include_hours,
  }))

  return NextResponse.json({ reports })
}
