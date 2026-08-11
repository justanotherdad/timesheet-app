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

/**
 * Admin/super_admin in-place save for any user's timesheet.
 * Uses the service-role client so RLS on timesheet_entries / unbillable
 * does not block writing another employee's rows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(['admin', 'super_admin'])
    const { id } = await params
    const body = await request.json()

    const weekEnding = typeof body.week_ending === 'string' ? body.week_ending : null
    const weekStarting = typeof body.week_starting === 'string' ? body.week_starting : null
    const notes = typeof body.notes === 'string' ? body.notes : body.notes === null ? null : undefined
    const shouldSubmit = body.submit === true
    const billableEntries = Array.isArray(body.billable_entries) ? (body.billable_entries as BillablePayload[]) : []
    const unbillableEntries = Array.isArray(body.unbillable_entries)
      ? (body.unbillable_entries as UnbillablePayload[])
      : []

    if (!weekEnding || !weekStarting) {
      return NextResponse.json({ error: 'week_ending and week_starting are required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: timesheet, error: fetchError } = await admin
      .from('weekly_timesheets')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const status = timesheet.status as string
    const updateData: Record<string, unknown> = {
      week_ending: weekEnding,
      week_starting: weekStarting,
      updated_at: new Date().toISOString(),
    }
    if (notes !== undefined) updateData.notes = notes

    if (shouldSubmit && (status === 'draft' || status === 'rejected')) {
      if (status === 'rejected') {
        const { error: sigDelError } = await admin
          .from('timesheet_signatures')
          .delete()
          .eq('timesheet_id', id)
        if (sigDelError) {
          return NextResponse.json({ error: sigDelError.message }, { status: 500 })
        }
      }
      updateData.status = 'submitted'
      updateData.submitted_at = new Date().toISOString()
      updateData.employee_signed_at = new Date().toISOString()
    }
    // submitted/approved: leave status alone (in-place correction, no re-approval)

    const { error: updateError } = await admin
      .from('weekly_timesheets')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

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

    // Replace line items under service role. If insert fails after delete, retry
    // insert of the same payload so we do not leave an empty timesheet.
    const { error: delEntriesError } = await admin.from('timesheet_entries').delete().eq('timesheet_id', id)
    if (delEntriesError) {
      return NextResponse.json({ error: delEntriesError.message }, { status: 500 })
    }
    const { error: delUnbillableError } = await admin.from('timesheet_unbillable').delete().eq('timesheet_id', id)
    if (delUnbillableError) {
      return NextResponse.json({ error: delUnbillableError.message }, { status: 500 })
    }

    if (entriesToInsert.length > 0) {
      let { error: entriesError } = await admin.from('timesheet_entries').insert(entriesToInsert)
      if (entriesError) {
        ;({ error: entriesError } = await admin.from('timesheet_entries').insert(entriesToInsert))
      }
      if (entriesError) {
        return NextResponse.json(
          {
            error: `Failed to save billable rows after clearing previous ones: ${entriesError.message}`,
          },
          { status: 500 }
        )
      }
    }

    if (unbillableToInsert.length > 0) {
      let { error: unbillableError } = await admin.from('timesheet_unbillable').insert(unbillableToInsert)
      if (unbillableError) {
        ;({ error: unbillableError } = await admin.from('timesheet_unbillable').insert(unbillableToInsert))
      }
      if (unbillableError) {
        return NextResponse.json(
          {
            error: `Failed to save non-billable rows after clearing previous ones: ${unbillableError.message}`,
          },
          { status: 500 }
        )
      }
    }

    const finalStatus = (updateData.status as string) || status
    if (shouldSubmit && finalStatus === 'submitted') {
      await checkAndAutoApproveIfFinal(id)
    }

    return NextResponse.json({
      ok: true,
      id,
      status: finalStatus,
      edited_by: user.id,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred'
    const status = message === 'Forbidden' ? 403 : message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
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
