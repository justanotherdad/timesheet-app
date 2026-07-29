import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { listActivityMonthsForPos } from '@/lib/generated-report-billable'

export const dynamic = 'force-dynamic'

/**
 * GET ?poIds=id1,id2 — distinct YYYY-MM months with approved timesheet activity
 * on the selected POs (for Generate Report wizard month checkboxes).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const poIds = (searchParams.get('poIds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (poIds.length === 0) {
    return NextResponse.json({ months: [] })
  }

  const supabase = await createClient()
  for (const poId of poIds) {
    if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
      return NextResponse.json({ error: 'Access denied for one or more selected POs.' }, { status: 403 })
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const months = await listActivityMonthsForPos(admin, poIds)
  return NextResponse.json({ months })
}
