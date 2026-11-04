import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Remove one file from an additional expense, including its stored bytes. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ poId: string; expenseId: string; attachmentId: string }> }
) {
  const { poId, expenseId, attachmentId } = await params
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

  const { data: att } = await admin
    .from('po_expense_attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .eq('expense_id', expenseId)
    .eq('po_id', poId)
    .maybeSingle()

  if (!att) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  const { error: storageErr } = await admin.storage.from('site-attachments').remove([att.storage_path])
  if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 })

  const { error } = await admin
    .from('po_expense_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('expense_id', expenseId)
    .eq('po_id', poId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
