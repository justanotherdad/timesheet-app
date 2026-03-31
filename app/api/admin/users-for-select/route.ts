import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Minimal user list for admin pickers (e.g. Timesheet Confirmation assignees). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('user_profiles').select('id, name').order('name')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    users: (data || []).map((u: { id: string; name: string | null }) => ({
      id: u.id,
      name: u.name || 'Unknown',
    })),
  })
}
