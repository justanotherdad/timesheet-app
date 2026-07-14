import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  loadCompanySettingsMap,
  parseConfirmationAssigneeIds,
  parseConfirmationSiteFilters,
} from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const settings = await loadCompanySettingsMap(admin)
  const assignees = parseConfirmationAssigneeIds(settings)
  if (assignees.length === 0 || !assignees.includes(user.id)) {
    return NextResponse.json({ timesheets: [] })
  }

  const { data: receipts } = await admin
    .from('timesheet_confirmation_receipts')
    .select('timesheet_id, approval_sequence')
    .eq('user_id', user.id)
  const receiptKey = new Set((receipts || []).map((r) => `${r.timesheet_id}:${r.approval_sequence}`))

  const { data: approved, error } = await admin
    .from('weekly_timesheets')
    .select('id, user_id, week_ending, week_starting, approval_confirmation_sequence, approved_at, user_profiles!user_id(name)')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let pending = (approved || []).filter((row: any) => {
    const seq = row.approval_confirmation_sequence ?? 0
    if (seq <= 0) return false
    return !receiptKey.has(`${row.id}:${seq}`)
  })

  // Per-user client (site) filter: if this confirmation user has a non-empty
  // allowed-client list, only show timesheets that touch one of those clients.
  // A user with no filter sees everything (default).
  const allowedSiteIds = parseConfirmationSiteFilters(settings)[user.id] || []
  if (allowedSiteIds.length > 0 && pending.length > 0) {
    const pendingIds = pending.map((ts: any) => ts.id)
    const { data: entries } = await admin
      .from('timesheet_entries')
      .select('timesheet_id, po_id')
      .in('timesheet_id', pendingIds)
      .not('po_id', 'is', null)
    const poIds = [...new Set((entries || []).map((e: any) => e.po_id).filter(Boolean))]
    const poSiteById = new Map<string, string>()
    if (poIds.length > 0) {
      const { data: pos } = await admin.from('purchase_orders').select('id, site_id').in('id', poIds)
      for (const po of pos || []) poSiteById.set((po as any).id, (po as any).site_id)
    }
    const allowed = new Set(allowedSiteIds)
    const timesheetSites = new Map<string, Set<string>>()
    for (const e of entries || []) {
      const siteId = poSiteById.get((e as any).po_id)
      if (!siteId) continue
      const key = (e as any).timesheet_id
      if (!timesheetSites.has(key)) timesheetSites.set(key, new Set())
      timesheetSites.get(key)!.add(siteId)
    }
    pending = pending.filter((ts: any) => {
      const sites = timesheetSites.get(ts.id)
      if (!sites) return false
      for (const s of sites) if (allowed.has(s)) return true
      return false
    })
  }

  return NextResponse.json({
    timesheets: pending.map((ts: any) => ({
      id: ts.id,
      user_id: ts.user_id,
      week_ending: ts.week_ending,
      week_starting: ts.week_starting,
      approved_at: ts.approved_at,
      employee_name: (ts.user_profiles as { name?: string })?.name || 'Unknown',
    })),
  })
}
