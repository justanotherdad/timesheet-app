import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Signed URL so anyone who can open this budget can open the file. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string; expenseId: string; attachmentId: string }> }
) {
  const { poId, expenseId, attachmentId } = await params
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
    .from('po_expense_attachments')
    .select('storage_path, file_name')
    .eq('id', attachmentId)
    .eq('expense_id', expenseId)
    .eq('po_id', poId)
    .maybeSingle()

  if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  const { data } = await admin.storage.from('site-attachments').createSignedUrl(att.storage_path, 60)
  if (!data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to create download link' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
