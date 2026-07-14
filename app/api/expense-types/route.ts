import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

/**
 * POST: Create a predefined expense type. Writes go through the service-role
 * admin client (RLS blocks direct inserts from the browser), guarded by an
 * admin/super_admin role check so only admins can manage the shared list.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Only admins can manage expense types' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  let adminSupabase: ReturnType<typeof createAdminClient>
  try {
    adminSupabase = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await adminSupabase
    .from('po_expense_types')
    .insert({ name })
    .select('id, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
