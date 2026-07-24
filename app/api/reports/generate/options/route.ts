import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET: list POs the current user may include in a generated report.
 * Admin/super_admin see all active POs; everyone else sees only POs they have a
 * po_budget_access grant for. Returns lightweight rows for the wizard picker.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const role = user.profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id, po_number, project_name, description, site_id, budget_type, active')
    .eq('active', true)
  let list = (pos || []) as Array<{
    id: string
    po_number: string | null
    project_name: string | null
    description: string | null
    site_id: string | null
    budget_type: string | null
  }>

  if (!isAdmin) {
    const { data: grants } = await admin
      .from('po_budget_access')
      .select('purchase_order_id')
      .eq('user_id', user.id)
    const granted = new Set((grants || []).map((g) => (g as { purchase_order_id: string }).purchase_order_id))
    list = list.filter((p) => granted.has(p.id))
  }

  const siteIds = [...new Set(list.map((p) => p.site_id).filter(Boolean))] as string[]
  const siteName = new Map<string, string>()
  if (siteIds.length > 0) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', siteIds)
    for (const s of sites || []) siteName.set((s as { id: string }).id, (s as { name: string }).name || '')
  }

  const options = list
    .map((p) => ({
      id: p.id,
      poNumber: p.po_number || '(no PO #)',
      projectName: (p.project_name || p.description || '').trim(),
      clientName: siteName.get(p.site_id || '') || 'Unknown',
      budgetType: (p.budget_type === 'project' ? 'project' : 'basic') as 'project' | 'basic',
    }))
    .sort((a, b) => {
      const c = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
      if (c !== 0) return c
      return a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true, sensitivity: 'base' })
    })

  return NextResponse.json({ options })
}
