import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import { normalizeTimesheetHours } from '@/lib/utils'
import { NextResponse } from 'next/server'

type BillablePayload = {
  client_project_id?: string | null
  po_id?: string | null
  task_description?: string
  system_id?: string | null
  system_name?: string | null
  deliverable_id?: string | null
  activity_id?: string | null
  mon_hours?: number
  tue_hours?: number
  wed_hours?: number
  thu_hours?: number
  fri_hours?: number
  sat_hours?: number
  sun_hours?: number
}

type UnbillablePayload = {
  description: string
  notes?: string | null
  mon_hours?: number
  tue_hours?: number
  wed_hours?: number
  thu_hours?: number
  fri_hours?: number
  sat_hours?: number
  sun_hours?: number
}

function entryTotal(e: BillablePayload): number {
  return (
    Number(e.mon_hours || 0) +
    Number(e.tue_hours || 0) +
    Number(e.wed_hours || 0) +
    Number(e.thu_hours || 0) +
    Number(e.fri_hours || 0) +
    Number(e.sat_hours || 0) +
    Number(e.sun_hours || 0)
  )
}

/**
 * Admin/super_admin create a timesheet owned by another employee.
 * Service-role insert so RLS cannot block another user's user_id.
 * Submit routes through that employee's normal approval chain.
 */
export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'super_admin'])
    const body = await request.json()

    const ownerUserId = typeof body.user_id === 'string' ? body.user_id : null
    const weekEnding = typeof body.week_ending === 'string' ? body.week_ending : null
    const weekStarting = typeof body.week_starting === 'string' ? body.week_starting : null
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    const shouldSubmit = body.submit === true
    const billableEntries = Array.isArray(body.billable_entries) ? (body.billable_entries as BillablePayload[]) : []
    const unbillableEntries = Array.isArray(body.unbillable_entries)
      ? (body.unbillable_entries as UnbillablePayload[])
      : []

    if (!ownerUserId || !weekEnding || !weekStarting) {
      return NextResponse.json({ error: 'user_id, week_ending, and week_starting are required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: owner, error: ownerErr } = await admin
      .from('user_profiles')
      .select('id, role, active')
      .eq('id', ownerUserId)
      .maybeSingle()

    if (ownerErr || !owner) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    if ((owner as { role?: string }).role === 'client') {
      return NextResponse.json({ error: 'Cannot create a timesheet for a client user' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const insertData: Record<string, unknown> = {
      user_id: ownerUserId,
      week_ending: weekEnding,
      week_starting: weekStarting,
      status: shouldSubmit ? 'submitted' : 'draft',
      notes,
    }
    if (shouldSubmit) {
      insertData.submitted_at = now
      insertData.employee_signed_at = now
    }

    const { data: timesheet, error: createError } = await admin
      .from('weekly_timesheets')
      .insert(insertData)
      .select('id, status')
      .single()

    if (createError || !timesheet) {
      return NextResponse.json({ error: createError?.message || 'Failed to create timesheet' }, { status: 500 })
    }

    const id = (timesheet as { id: string }).id

    const entriesToInsert = billableEntries
      .filter((e) => (e.task_description || '').trim() || entryTotal(e) > 0)
      .map((e, idx) => ({
        timesheet_id: id,
        sort_order: idx,
        client_project_id: e.client_project_id || null,
        po_id: e.po_id || null,
        task_description: e.task_description || '',
        system_id: e.system_id || null,
        system_name: e.system_name || null,
        deliverable_id: e.deliverable_id || null,
        activity_id: e.activity_id || null,
        mon_hours: normalizeTimesheetHours(Number(e.mon_hours) || 0),
        tue_hours: normalizeTimesheetHours(Number(e.tue_hours) || 0),
        wed_hours: normalizeTimesheetHours(Number(e.wed_hours) || 0),
        thu_hours: normalizeTimesheetHours(Number(e.thu_hours) || 0),
        fri_hours: normalizeTimesheetHours(Number(e.fri_hours) || 0),
        sat_hours: normalizeTimesheetHours(Number(e.sat_hours) || 0),
        sun_hours: normalizeTimesheetHours(Number(e.sun_hours) || 0),
      }))

    const unbillableToInsert = unbillableEntries.map((e) => ({
      timesheet_id: id,
      description: e.description,
      notes: e.notes && String(e.notes).trim() ? String(e.notes).trim() : null,
      mon_hours: normalizeTimesheetHours(Number(e.mon_hours) || 0),
      tue_hours: normalizeTimesheetHours(Number(e.tue_hours) || 0),
      wed_hours: normalizeTimesheetHours(Number(e.wed_hours) || 0),
      thu_hours: normalizeTimesheetHours(Number(e.thu_hours) || 0),
      fri_hours: normalizeTimesheetHours(Number(e.fri_hours) || 0),
      sat_hours: normalizeTimesheetHours(Number(e.sat_hours) || 0),
      sun_hours: normalizeTimesheetHours(Number(e.sun_hours) || 0),
    }))

    if (entriesToInsert.length > 0) {
      const { error: entriesError } = await admin.from('timesheet_entries').insert(entriesToInsert)
      if (entriesError) {
        return NextResponse.json({ error: entriesError.message }, { status: 500 })
      }
    }
    if (unbillableToInsert.length > 0) {
      const { error: unbillableError } = await admin.from('timesheet_unbillable').insert(unbillableToInsert)
      if (unbillableError) {
        return NextResponse.json({ error: unbillableError.message }, { status: 500 })
      }
    }

    const finalStatus = (timesheet as { status: string }).status
    if (shouldSubmit && finalStatus === 'submitted') {
      await checkAndAutoApproveIfFinal(id)
    }

    return NextResponse.json({ ok: true, id, status: finalStatus })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred'
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
