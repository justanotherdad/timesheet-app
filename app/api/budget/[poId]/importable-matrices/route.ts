import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { INDIRECT_SYSTEM_NAME } from '@/lib/bid-sheet-indirect'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

/**
 * GET: list OTHER project-budget POs whose matrix structure the current user is
 * allowed to import into this PO. A PO qualifies when:
 *   - budget_type = 'project' and it is not this PO,
 *   - the user can access its budget (admins: all; others: po_budget_access grant),
 *   - it has at least one non-indirect project_details (labor) row to copy.
 *
 * Returns lightweight rows for a picker: { id, poNumber, projectName, siteName, rowCount }.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
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

  const role = user.profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  // Candidate project POs (exclude this one).
  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id, po_number, project_name, description, site_id')
    .eq('budget_type', 'project')
    .neq('id', poId)
  let candidates = pos || []
  if (candidates.length === 0) return NextResponse.json({ matrices: [] })

  // Non-admins: restrict to POs they've been explicitly granted.
  if (!isAdmin) {
    const { data: grants } = await admin
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const granted = new Set((grants || []).map((g) => (g as { purchase_order_id: string }).purchase_order_id))
    candidates = candidates.filter((p) => granted.has((p as { id: string }).id))
  }
  if (candidates.length === 0) return NextResponse.json({ matrices: [] })

  const candidateIds = candidates.map((p) => (p as { id: string }).id)

  // Count non-indirect (labor) matrix rows per candidate PO.
  const { data: details } = await admin
    .from('project_details')
    .select('po_id, systems (name)')
    .in('po_id', candidateIds)
  const laborCount = new Map<string, number>()
  for (const d of details || []) {
    const sysName = ((d as { systems?: { name?: string } }).systems?.name || '').trim()
    if (sysName.toLowerCase() === INDIRECT_SYSTEM_NAME.toLowerCase()) continue
    const key = (d as { po_id: string }).po_id
    laborCount.set(key, (laborCount.get(key) || 0) + 1)
  }

  // Site names for display.
  const siteIds = [...new Set(candidates.map((p) => (p as { site_id: string | null }).site_id).filter(Boolean))] as string[]
  const siteName = new Map<string, string>()
  if (siteIds.length > 0) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', siteIds)
    for (const s of sites || []) siteName.set((s as { id: string }).id, (s as { name: string }).name)
  }

  const matrices = candidates
    .map((p) => {
      const id = (p as { id: string }).id
      return {
        id,
        poNumber: (p as { po_number: string | null }).po_number || '(no PO #)',
        projectName:
          (p as { project_name: string | null }).project_name ||
          (p as { description: string | null }).description ||
          '',
        siteName: siteName.get((p as { site_id: string | null }).site_id || '') || '',
        rowCount: laborCount.get(id) || 0,
      }
    })
    .filter((m) => m.rowCount > 0)
    .sort((a, b) => a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true, sensitivity: 'base' }))

  return NextResponse.json({ matrices })
}
