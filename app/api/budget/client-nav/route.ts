import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Lightweight nav check: does this Client have any PO with can_view_budget? */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.profile.role !== 'client') {
    return NextResponse.json({ showBudget: false })
  }

  const supabase = await createClient()
  const { count } = await supabase
    .from('po_budget_access')
    .select('purchase_order_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('can_view_budget', true)

  return NextResponse.json(
    { showBudget: (count ?? 0) > 0 },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}
