import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { id } = params

    // Verify the timesheet belongs to the user
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    if (timesheet.status !== 'draft') {
      return NextResponse.json({ error: 'Timesheet already submitted' }, { status: 400 })
    }

    // Update timesheet status to submitted
    const { error: updateError } = await supabase
      .from('weekly_timesheets')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        employee_signed_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL('/dashboard/timesheets', request.url))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
