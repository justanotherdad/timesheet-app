import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  loadCompanySettingsMap,
  getPendingConfirmationsForUser,
} from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const settings = await loadCompanySettingsMap(admin)
  const pending = await getPendingConfirmationsForUser(admin, user.id, settings)

  return NextResponse.json({
    timesheets: pending.map((ts) => ({
      id: ts.id,
      user_id: ts.user_id,
      week_ending: ts.week_ending,
      week_starting: ts.week_starting,
      approved_at: ts.approved_at,
      employee_name: ts.employee_name,
    })),
  })
}
