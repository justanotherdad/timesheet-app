import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Images that render inline in the Notes tab, plus PDF.
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
])

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

/** List the Notes-tab image/file records for this PO (category = 'note_image'). */
export async function GET(_req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('po_attachments')
    .select('id, file_name, file_type, created_at')
    .eq('po_id', poId)
    .eq('category', 'note_image')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ images: data ?? [] }, noStore)
}

/** Upload a pasted/selected image or PDF to the Notes tab. */
export async function POST(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const rawName = file.name || 'pasted-image.png'
  const ext = '.' + (rawName.split('.').pop() || '').toLowerCase()
  const mimeOk = ALLOWED_MIME.has((file.type || '').toLowerCase())
  const extOk = ALLOWED_EXT.includes(ext)
  if (!mimeOk && !extOk) {
    return NextResponse.json({ error: 'File type not allowed. Use an image (PNG/JPEG/GIF/WebP) or PDF.' }, { status: 400 })
  }

  const safeName = rawName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `po_attachments/${poId}/note_${crypto.randomUUID()}_${safeName}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || (ext === '.pdf' ? 'application/pdf' : 'image/png')

  const { error: uploadErr } = await admin.storage.from('site-attachments').upload(path, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: inserted, error: insertErr } = await admin
    .from('po_attachments')
    .insert({
      po_id: poId,
      file_name: rawName,
      storage_path: path,
      file_type: contentType,
      file_size: file.size,
      category: 'note_image',
    })
    .select('id, file_name, file_type, created_at')
    .single()

  if (insertErr || !inserted) {
    await admin.storage.from('site-attachments').remove([path]).catch(() => {})
    return NextResponse.json({ error: insertErr?.message || 'Failed to save image' }, { status: 500 })
  }

  return NextResponse.json(inserted, noStore)
}
