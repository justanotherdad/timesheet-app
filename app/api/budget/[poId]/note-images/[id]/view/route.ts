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
  const safeName = (att.file_name || 'file').replace(/["\r\n]/g, '_')
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': att.file_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=60',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
