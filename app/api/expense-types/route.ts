import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET: Fetch predefined expense types for Add Expense dropdown. Uses admin client when available to bypass RLS. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch {
    // Service role key may be missing
  }

  const client = adminSupabase || supabase
  const { data, error } = await client.from('po_expense_types').select('id, name').order('name')

  if (error) {
    // Fallback to user client if admin failed (e.g. RLS blocks admin in edge case)
    if (adminSupabase) {
      const { data: fallback } = await supabase.from('po_expense_types').select('id, name').order('name')
      return NextResponse.json(fallback || [])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
