import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { checkAndAutoApproveIfFinal } from '@/lib/timesheet-auto-approve'
import { NextResponse } from 'next/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { id } = await params

    // Verify the timesheet belongs to the user
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('id, user_id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    if ((timesheet as { status?: string }).status !== 'submitted') {
      return NextResponse.json({ ok: true })
    }

    const autoApproved = await checkAndAutoApproveIfFinal(id)
    return NextResponse.json({ ok: true, autoApproved })
  } catch {
    return NextResponse.json({ error: 'Failed to check auto-approve' }, { status: 500 })
  }
}
