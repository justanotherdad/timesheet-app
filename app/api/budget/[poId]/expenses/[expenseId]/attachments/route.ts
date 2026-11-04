import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessPoBudget } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'
import {
  EXPENSE_ATTACHMENT_LIMIT,
  expenseAttachmentContentType,
  expenseAttachmentRejection,
} from '@/lib/expense-attachments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

async function authorize(poId: string, write: boolean) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (write && !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) }
  }
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { error: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }
  return { user, admin }
}

async function expenseOnPo(admin: ReturnType<typeof createAdminClient>, poId: string, expenseId: string) {
  const { data } = await admin.from('po_expenses').select('id').eq('id', expenseId).eq('po_id', poId).maybeSingle()
  return !!data
}

/** List files for one additional expense. */
export async function GET(_req: Request, { params }: { params: Promise<{ poId: string; expenseId: string }> }) {
  const { poId, expenseId } = await params
  const auth = await authorize(poId, false)
  if ('error' in auth && auth.error) return auth.error

  const { admin } = auth as { admin: ReturnType<typeof createAdminClient> }
  if (!(await expenseOnPo(admin, poId, expenseId))) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('po_expense_attachments')
    .select('id, file_name, file_type, file_size, created_at')
    .eq('expense_id', expenseId)
    .eq('po_id', poId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachments: data ?? [] }, noStore)
}

/** Upload one file onto an additional expense. At most 10 files, 10 MB each. */
export async function POST(req: Request, { params }: { params: Promise<{ poId: string; expenseId: string }> }) {
  const { poId, expenseId } = await params
  const auth = await authorize(poId, true)
  if ('error' in auth && auth.error) return auth.error
  const { user, admin } = auth as { user: { id: string }; admin: ReturnType<typeof createAdminClient> }

  if (!(await expenseOnPo(admin, poId, expenseId))) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const { count, error: countErr } = await admin
    .from('po_expense_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('expense_id', expenseId)

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
  const current = count ?? 0
  if (current >= EXPENSE_ATTACHMENT_LIMIT) {
    return NextResponse.json({ error: 'Remove a file to add another.' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const rejection = expenseAttachmentRejection(file.name || 'file', file.size, current)
  if (rejection) return NextResponse.json({ error: rejection }, { status: 400 })

  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `expense_attachments/${poId}/${expenseId}/${crypto.randomUUID()}_${safeName}`
  const bytes = Buffer.from(await file.arrayBuffer())
  const contentType = expenseAttachmentContentType(file.name || '', file.type || '')

  const { error: uploadErr } = await admin.storage.from('site-attachments').upload(path, bytes, {
    upsert: false,
    contentType,
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: inserted, error: insertErr } = await admin
    .from('po_expense_attachments')
    .insert({
      expense_id: expenseId,
      po_id: poId,
      file_name: file.name || safeName,
      storage_path: path,
      file_type: contentType,
      file_size: file.size,
      created_by: user.id,
    })
    .select('id, file_name, file_type, file_size, created_at')
    .single()

  if (insertErr || !inserted) {
    await admin.storage.from('site-attachments').remove([path]).catch(() => {})
    return NextResponse.json({ error: insertErr?.message || 'Failed to save attachment' }, { status: 500 })
  }

  return NextResponse.json(inserted, noStore)
}
