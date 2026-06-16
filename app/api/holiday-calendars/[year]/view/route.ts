import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET: Stream calendar PDF inline (same-origin so CSP frame-src 'self' allows iframe embed). */
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
    .select('file_name, storage_path')
    .eq('calendar_year', year)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'No calendar uploaded for this year' }, { status: 404 })
  }

  const { data: fileData, error: downloadErr } = await admin.storage
    .from('site-attachments')
    .download(row.storage_path)

  if (downloadErr || !fileData) {
    return NextResponse.json(
      { error: downloadErr?.message || 'Failed to load PDF from storage' },
      { status: 500 }
    )
  }

  const safeName = (row.file_name || `holiday-calendar-${year}.pdf`).replace(/[^\w.\-() ]+/g, '_')
  const bytes = Buffer.from(await fileData.arrayBuffer())

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
