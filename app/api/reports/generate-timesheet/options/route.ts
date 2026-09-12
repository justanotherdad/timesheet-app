import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { getTimesheetReportEmployees } from '@/lib/timesheet-report-employees'

export const dynamic = 'force-dynamic'

/**
 * Clients (sites) and employees the current user may include on a Timesheet Report.
 * Employee siteIds come from user_sites plus active PO bill-rate sites.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = user.profile.role
  if (!['manager', 'admin', 'super_admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const employees = await getTimesheetReportEmployees(admin, user.profile)
  const siteIds = [...new Set(employees.flatMap((e) => e.siteIds))]
  const siteName = new Map<string, string>()
  if (siteIds.length > 0) {
    const { data: sites } = await admin.from('sites').select('id, name').in('id', siteIds)
    for (const s of sites || []) {
      siteName.set((s as { id: string }).id, (s as { name: string }).name || 'Unknown')
    }
  }

  const clients = siteIds
    .map((id) => ({ id, name: siteName.get(id) || 'Unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return NextResponse.json({
    clients,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      siteIds: e.siteIds,
    })),
  })
}
