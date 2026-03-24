import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string; id: string }> }
) {
  const { poId, id } = await params
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

  const { data: att } = await adminSupabase
    .from('po_attachments')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('po_id', poId)
    .single()

  if (!att) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const { data } = await adminSupabase.storage.from('site-attachments').createSignedUrl(att.storage_path, 60)
  if (!data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create download link' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
