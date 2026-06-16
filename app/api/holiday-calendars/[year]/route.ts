import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

/** GET: Signed URL for a year's calendar PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: row, error } = await admin
    .from('holiday_pay_calendars')
    .select('calendar_year, file_name, storage_path, updated_at')
    .eq('calendar_year', year)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'No calendar uploaded for this year' }, { status: 404 })
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('site-attachments')
    .createSignedUrl(row.storage_path, 3600)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message || 'Failed to load PDF' }, { status: 500 })
  }

  return NextResponse.json(
    {
      calendar: {
        calendar_year: row.calendar_year,
        file_name: row.file_name,
        updated_at: row.updated_at,
        url: signed.signedUrl,
      },
    },
    noStore
  )
}

/** DELETE: Remove a year's calendar (admin/super_admin only). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ year: string }> }) {
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data: row } = await admin
    .from('holiday_pay_calendars')
    .select('id, storage_path')
    .eq('calendar_year', year)
    .maybeSingle()

  if (!row) {
    return NextResponse.json({ error: 'Calendar not found' }, { status: 404 })
  }

  await admin.storage.from('site-attachments').remove([row.storage_path]).catch(() => {})
  const { error } = await admin.from('holiday_pay_calendars').delete().eq('id', row.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, noStore)
}
