import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  createPtoRequest,
  isInternalEmployee,
  listMyPtoRequests,
  normalizeLeaveType,
  parseHoursPerDay,
  validateCreatePtoInput,
} from '@/lib/pto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const requests = await listMyPtoRequests(admin, user.id)
    return NextResponse.json({ requests })
  } catch (err) {
    console.error('[pto] list mine failed', err)
    return NextResponse.json({ error: 'Could not load requests' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const leaveType = normalizeLeaveType(
    typeof body.leaveType === 'string' ? body.leaveType : '',
    typeof body.customLeaveType === 'string' ? body.customLeaveType : ''
  )
  const hoursPerDay = parseHoursPerDay(body.hoursPerDay)
  const startDate = typeof body.startDate === 'string' ? body.startDate : ''
  const endDate = typeof body.endDate === 'string' ? body.endDate : ''
  const notes = typeof body.notes === 'string' ? body.notes : ''

  const validated = validateCreatePtoInput({
    leaveType,
    startDate,
    endDate,
    hoursPerDay,
    notes,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const request = await createPtoRequest(admin, {
      userId: user.id,
      ...validated.value,
    })
    void logAudit({
      actorId: user.id,
      actorName: user.profile.name,
      action: 'pto.submit',
      entityType: 'pto_request',
      entityId: request.id,
      newValues: {
        leave_type: request.leave_type,
        start_date: request.start_date,
        end_date: request.end_date,
        hours_per_day: request.hours_per_day,
      },
    })
    return NextResponse.json({ request })
  } catch (err) {
    console.error('[pto] create failed', err)
    return NextResponse.json({ error: 'Could not submit request' }, { status: 500 })
  }
}
