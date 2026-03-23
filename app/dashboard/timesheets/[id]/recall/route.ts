import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { id } = await params

    // Verify the timesheet belongs to the user (employee only; admins could use edit)
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    if (timesheet.status !== 'submitted') {
      return NextResponse.json({ error: 'Only submitted timesheets can be recalled' }, { status: 400 })
    }

    // Remove any approval signatures so workflow is reset
    await supabase
      .from('timesheet_signatures')
      .delete()
      .eq('timesheet_id', id)

    // Set timesheet back to draft
    const { error: updateError } = await supabase
      .from('weekly_timesheets')
      .update({
        status: 'draft',
        submitted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL(`/dashboard/timesheets/${id}/edit`, request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
