import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import type { BudgetContainer } from '@/lib/po-budget-container-audit'

export const dynamic = 'force-dynamic'

const CONTAINERS: BudgetContainer[] = ['invoices', 'expenses', 'bill_rates', 'budget_summary', 'notes']

/** GET: Last 5 audit entries per container for this PO. Read-only for anyone with budget access. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  try {
    const admin = createAdminClient()
    const result: Record<BudgetContainer, unknown[]> = {
      invoices: [],
      expenses: [],
      bill_rates: [],
      budget_summary: [],
      notes: [],
    }

    await Promise.all(
      CONTAINERS.map(async (container) => {
        const { data, error } = await admin
          .from('po_budget_container_audit')
          .select('id, po_id, container, actor_id, actor_name, description, created_at')
          .eq('po_id', poId)
          .eq('container', container)
          .order('created_at', { ascending: false })
          .limit(5)
        if (!error && data) result[container] = data
      })
    )

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      invoices: [],
      expenses: [],
      bill_rates: [],
      budget_summary: [],
      notes: [],
    })
  }
}
