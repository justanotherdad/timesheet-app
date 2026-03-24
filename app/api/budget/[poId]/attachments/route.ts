import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx']

/** Node route handlers: upload File/Blob from FormData can fail or hang with Supabase's storage client; Buffer is reliable. */
export const maxDuration = 60

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

/** Authoritative attachment list (service role). Merged client-side after budget GET so RLS/cache cannot leave the UI empty. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let adminSupabase: ReturnType<typeof createAdminClient>
  try {
    adminSupabase = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await adminSupabase
    .from('po_attachments')
    .select('id, file_name, storage_path, file_type')
    .eq('po_id', poId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attachments: data ?? [] }, noStore)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let adminSupabase: ReturnType<typeof createAdminClient>
  try {
    adminSupabase = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: 'File type not allowed. Use Word, Excel, or PDF.' }, { status: 400 })
  }

  const path = `po_attachments/${poId}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const contentType =
    file.type ||
    (ext === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === '.doc'
        ? 'application/msword'
        : ext === '.pdf'
          ? 'application/pdf'
          : ext === '.xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : ext === '.xls'
              ? 'application/vnd.ms-excel'
              : 'application/octet-stream')

  const { error: uploadErr } = await adminSupabase.storage.from('site-attachments').upload(path, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: inserted, error: insertErr } = await adminSupabase
    .from('po_attachments')
    .insert({
      po_id: poId,
      file_name: file.name,
      storage_path: path,
      file_type: file.type,
      file_size: file.size,
    })
    .select('id, file_name, storage_path, file_type')
    .single()

  if (insertErr) {
    await adminSupabase.storage.from('site-attachments').remove([path])
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  if (!inserted) {
    await adminSupabase.storage.from('site-attachments').remove([path])
    return NextResponse.json({ error: 'Failed to save attachment record' }, { status: 500 })
  }

  return NextResponse.json(inserted, noStore)
}
