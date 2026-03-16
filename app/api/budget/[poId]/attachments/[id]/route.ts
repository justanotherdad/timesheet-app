import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; id: string }> }
) {
  const { poId, id } = await params
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

  const { data: att } = await adminSupabase
    .from('po_attachments')
    .select('storage_path')
    .eq('id', id)
    .eq('po_id', poId)
    .single()

  if (!att) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  await adminSupabase.storage.from('site-attachments').remove([att.storage_path])
  await adminSupabase.from('po_attachments').delete().eq('id', id).eq('po_id', poId)
  return NextResponse.json({ ok: true })
}
