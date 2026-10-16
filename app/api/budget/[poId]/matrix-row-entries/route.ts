import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

const REASSIGN_ROLES = ['manager', 'admin', 'super_admin']

type DetailRow = {
  id: string
  system_id: string | null
  deliverable_id: string | null
  activity_id: string | null
  systems?: { id: string; name?: string | null; code?: string | null } | null
  deliverables?: { id: string; name?: string | null } | null
  activities?: { id: string; name?: string | null } | null
}

type RawEntry = {
  id: string
  timesheet_id: string | null
  mon_hours: number | null
  tue_hours: number | null
  wed_hours: number | null
  thu_hours: number | null
  fri_hours: number | null
  sat_hours: number | null
  sun_hours: number | null
}

function sumEntryHours(e: RawEntry): number {
  return (
    (Number(e.mon_hours) || 0) +
    (Number(e.tue_hours) || 0) +
    (Number(e.wed_hours) || 0) +
    (Number(e.thu_hours) || 0) +
    (Number(e.fri_hours) || 0) +
    (Number(e.sat_hours) || 0) +
    (Number(e.sun_hours) || 0)
  )
}

/**
 * GET /api/budget/[poId]/matrix-row-entries?systemId=&deliverableId=&activityId=
 *
 * Approved timesheet entries that already land on one project-matrix cell.
 * Anyone who can open the PO budget can see employee, week, and hours.
 * validCombos (other cells on this PO) is included only for roles that can
 * reassign, matching the manual-assignment save.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const url = new URL(req.url)
  const systemId = url.searchParams.get('systemId') || ''
  const deliverableId = url.searchParams.get('deliverableId') || ''
  const activityId = url.searchParams.get('activityId') || ''
  if (!systemId || !deliverableId || !activityId) {
    return NextResponse.json(
      { error: 'systemId, deliverableId, and activityId are required' },
      { status: 400 }
    )
  }

  let admin = supabase
  try { admin = createAdminClient() } catch { /* fall back to user client */ }

  const { data: detailRows, error: detErr } = await admin
    .from('project_details')
    .select(
      `
      id,
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)
  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 500 })

  const details = (detailRows || []) as unknown as DetailRow[]
  const sourceKey = `${systemId}|${deliverableId}|${activityId}`
  const cellExists = details.some(
    (d) => d.system_id && d.deliverable_id && d.activity_id && `${d.system_id}|${d.deliverable_id}|${d.activity_id}` === sourceKey
  )
  if (!cellExists) {
    return NextResponse.json({ error: 'Matrix cell not found on this PO' }, { status: 404 })
  }

  const canReassign = REASSIGN_ROLES.includes(user.profile.role)
  const validCombos = canReassign
    ? details
        .filter((d) => d.system_id && d.deliverable_id && d.activity_id)
        .filter((d) => `${d.system_id}|${d.deliverable_id}|${d.activity_id}` !== sourceKey)
        .map((d) => ({
          systemId: d.system_id as string,
          deliverableId: d.deliverable_id as string,
          activityId: d.activity_id as string,
          systemName: d.systems?.name ?? '',
          systemCode: d.systems?.code ?? null,
          deliverableName: d.deliverables?.name ?? '',
          activityName: d.activities?.name ?? '',
        }))
    : []

  const { data: rawEntries, error: entErr } = await admin
    .from('timesheet_entries')
    .select(
      `
      id,
      timesheet_id,
      mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours
    `
    )
    .eq('po_id', poId)
    .eq('system_id', systemId)
    .eq('deliverable_id', deliverableId)
    .eq('activity_id', activityId)
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  const entries = (rawEntries || []) as unknown as RawEntry[]
  const tsIds = [...new Set(entries.map((e) => e.timesheet_id).filter(Boolean) as string[])]
  const tsMap = new Map<string, { user_id: string; week_ending: string }>()
  if (tsIds.length > 0) {
    const { data: tsRows } = await admin
      .from('weekly_timesheets')
      .select('id, user_id, week_ending')
      .in('id', tsIds)
      .eq('status', 'approved')
    for (const row of (tsRows || []) as Array<{ id: string; user_id: string; week_ending: string }>) {
      tsMap.set(row.id, { user_id: row.user_id, week_ending: row.week_ending })
    }
  }

  const userIds = [...new Set(Array.from(tsMap.values()).map((t) => t.user_id))]
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('id, name')
      .in('id', userIds)
    for (const p of (profiles || []) as Array<{ id: string; name: string | null }>) {
      userMap.set(p.id, p.name ?? '')
    }
  }

  const listed = entries
    .filter((e) => tsMap.has(e.timesheet_id || '') && sumEntryHours(e) > 0)
    .map((e) => {
      const ts = tsMap.get(e.timesheet_id || '')
      return {
        entryId: e.id,
        timesheetId: e.timesheet_id,
        userId: ts?.user_id ?? null,
        userName: ts ? (userMap.get(ts.user_id) ?? '') : '',
        weekEnding: ts?.week_ending ?? null,
        hours: sumEntryHours(e),
      }
    })
    .sort((a, b) => {
      const ad = a.weekEnding || ''
      const bd = b.weekEnding || ''
      if (ad !== bd) return ad.localeCompare(bd)
      return (a.userName || '').localeCompare(b.userName || '', undefined, { sensitivity: 'base' })
    })

  return NextResponse.json({ canReassign, entries: listed, validCombos }, noStore)
}
