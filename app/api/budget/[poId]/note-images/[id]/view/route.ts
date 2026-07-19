import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Stream a Notes-tab image/PDF inline so it can render in an <img>/<iframe>. */
export async function GET(_req: Request, { params }: { params: Promise<{ poId: string; id: string }> }) {
  const { poId, id } = await params
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

  const { data: att } = await admin
    .from('po_attachments')
    .select('storage_path, file_name, file_type')
    .eq('id', id)
    .eq('po_id', poId)
    .eq('category', 'note_image')
    .single()
  if (!att) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  const { data: fileData, error: downloadErr } = await admin.storage
    .from('site-attachments')
    .download(att.storage_path)
  if (downloadErr || !fileData) {
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 })
  }

  const arrayBuffer = await fileData.arrayBuffer()
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: 'File is empty in storage' }, { status: 500 })
  }
  // Return a Node Buffer (not a raw ArrayBuffer) — Next 16 throws a 500 when a
  // bare ArrayBuffer is used as the response body, which showed up as a broken
  // image tile in the Notes "Images / Files" tab.
  const body = Buffer.from(arrayBuffer)

  // Infer a sensible content type when the stored file_type is missing/generic.
  const nameLower = (att.file_name || '').toLowerCase()
  const inferType =
    att.file_type && att.file_type !== 'application/octet-stream'
      ? att.file_type
      : nameLower.endsWith('.pdf')
      ? 'application/pdf'
      : nameLower.endsWith('.png')
      ? 'image/png'
      : nameLower.endsWith('.gif')
      ? 'image/gif'
      : nameLower.endsWith('.webp')
      ? 'image/webp'
      : nameLower.match(/\.jpe?g$/)
      ? 'image/jpeg'
      : 'application/octet-stream'

  const safeName = (att.file_name || 'file').replace(/[^\w.\-() ]+/g, '_')
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': inferType,
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
