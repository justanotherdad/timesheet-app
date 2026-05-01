import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

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
  system_id: string | null
  deliverable_id: string | null
  activity_id: string | null
  mon_hours: number | null
  tue_hours: number | null
  wed_hours: number | null
  thu_hours: number | null
  fri_hours: number | null
  sat_hours: number | null
  sun_hours: number | null
  systems?: { name?: string | null; code?: string | null } | null
  deliverables?: { name?: string | null } | null
  activities?: { name?: string | null } | null
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
 * GET /api/budget/[poId]/unmatched-entries
 *
 * Returns approved-timesheet entries on this PO whose (system, deliverable,
 * activity) triplet does not exist as a project_details cell — i.e. hours
 * the matrix can't display because the entry is keyed to a combo that isn't
 * a valid budget line. Used by the "Reassign manually" modal in the project
 * budget matrix to let a budget owner pick the correct cell for each entry.
 *
 * Also returns the full list of valid project_details combos so the client
 * can populate (system → deliverable → activity) cascading dropdowns
 * restricted to combos that actually exist on this PO.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

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
  const validKeys = new Set(
    details
      .filter((d) => d.system_id && d.deliverable_id && d.activity_id)
      .map((d) => `${d.system_id}|${d.deliverable_id}|${d.activity_id}`)
  )

  const validCombos = details
    .filter((d) => d.system_id && d.deliverable_id && d.activity_id)
    .map((d) => ({
      systemId: d.system_id as string,
      deliverableId: d.deliverable_id as string,
      activityId: d.activity_id as string,
      systemName: d.systems?.name ?? '',
      systemCode: d.systems?.code ?? null,
      deliverableName: d.deliverables?.name ?? '',
      activityName: d.activities?.name ?? '',
    }))

  const { data: rawEntries, error: entErr } = await admin
    .from('timesheet_entries')
    .select(
      `
      id,
      timesheet_id,
      system_id,
      deliverable_id,
      activity_id,
      mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours,
      systems (name, code),
      deliverables (name),
      activities (name)
    `
    )
    .eq('po_id', poId)
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  const entries = (rawEntries || []) as unknown as RawEntry[]

  // Restrict to entries on approved timesheets — those are the only hours
  // the matrix counts as actuals.
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

  const unmatched = entries
    .filter((e) => {
      if (!tsMap.has(e.timesheet_id || '')) return false
      const triplet = `${e.system_id || ''}|${e.deliverable_id || ''}|${e.activity_id || ''}`
      if (!e.system_id || !e.deliverable_id || !e.activity_id) return true
      return !validKeys.has(triplet)
    })
    .map((e) => {
      const ts = tsMap.get(e.timesheet_id || '')
      return {
        entryId: e.id,
        timesheetId: e.timesheet_id,
        userId: ts?.user_id ?? null,
        userName: ts ? (userMap.get(ts.user_id) ?? '') : '',
        weekEnding: ts?.week_ending ?? null,
        hours: sumEntryHours(e),
        systemId: e.system_id,
        deliverableId: e.deliverable_id,
        activityId: e.activity_id,
        systemName: e.systems?.name ?? null,
        systemCode: e.systems?.code ?? null,
        deliverableName: e.deliverables?.name ?? null,
        activityName: e.activities?.name ?? null,
      }
    })
    .filter((u) => u.hours > 0)
    .sort((a, b) => {
      const ad = a.weekEnding || ''
      const bd = b.weekEnding || ''
      if (ad !== bd) return ad.localeCompare(bd)
      return (a.userName || '').localeCompare(b.userName || '')
    })

  return NextResponse.json({
    unmatched,
    validCombos,
  })
}
