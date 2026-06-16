import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

/** GET: List uploaded holiday/pay calendars (all authenticated users). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('holiday_pay_calendars')
    .select('calendar_year, file_name, updated_at')
    .order('calendar_year', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ calendars: data || [] }, noStore)
}

/** POST: Upload or replace a calendar PDF for a year (admin/super_admin only). */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const form = await req.formData()
  const file = form.get('file')
  const yearRaw = form.get('year')
  const year = typeof yearRaw === 'string' ? parseInt(yearRaw, 10) : NaN

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Valid year is required' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const safeName = (file.name || `calendar-${year}.pdf`).replace(/[^\w.\-() ]+/g, '_')
  const storagePath = `holiday-calendars/${year}/${Date.now()}-${safeName}`

  const { data: existing } = await admin
    .from('holiday_pay_calendars')
    .select('id, storage_path')
    .eq('calendar_year', year)
    .maybeSingle()

  const { error: uploadErr } = await admin.storage.from('site-attachments').upload(storagePath, bytes, {
    contentType: file.type || 'application/pdf',
    upsert: false,
  })
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const now = new Date().toISOString()
  const row = {
    calendar_year: year,
    storage_path: storagePath,
    file_name: safeName,
    uploaded_by: user.id,
    updated_at: now,
  }

  const { data: saved, error: dbErr } = existing
    ? await admin
        .from('holiday_pay_calendars')
        .update(row)
        .eq('id', existing.id)
        .select('calendar_year, file_name, updated_at')
        .single()
    : await admin
        .from('holiday_pay_calendars')
        .insert({ ...row, created_at: now })
        .select('calendar_year, file_name, updated_at')
        .single()

  if (dbErr) {
    await admin.storage.from('site-attachments').remove([storagePath]).catch(() => {})
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await admin.storage.from('site-attachments').remove([existing.storage_path]).catch(() => {})
  }

  return NextResponse.json({ calendar: saved }, noStore)
}
