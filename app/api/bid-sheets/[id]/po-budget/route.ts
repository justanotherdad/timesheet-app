import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function canAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, role: string, bidSheetId: string): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase.from('bid_sheet_access').select('user_id').eq('bid_sheet_id', bidSheetId).eq('user_id', userId).maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase.from('user_sites').select('site_id').eq('user_id', userId).eq('site_id', sheet.site_id).maybeSingle()
  return !!siteAccess
}

/** Update linked project PO budget dollars (original_po_amount) from the bid sheet page after conversion. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { data: sheet } = await supabase.from('bid_sheets').select('converted_po_id').eq('id', id).single()
  if (!sheet?.converted_po_id) {
    return NextResponse.json({ error: 'Bid sheet has no linked project PO' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { original_po_amount } = body as { original_po_amount?: number | string | null }
  if (original_po_amount === undefined) {
    return NextResponse.json({ error: 'original_po_amount is required' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const poId = sheet.converted_po_id
  const amt =
    original_po_amount === '' || original_po_amount == null ? null : parseFloat(String(original_po_amount))
  if (amt != null && Number.isNaN(amt)) {
    return NextResponse.json({ error: 'Invalid original_po_amount' }, { status: 400 })
  }

  const { error: upErr } = await admin
    .from('purchase_orders')
    .update({ original_po_amount: amt })
    .eq('id', poId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: po } = await admin.from('purchase_orders').select('original_po_amount').eq('id', poId).single()
  const { data: cos } = await admin.from('po_change_orders').select('amount, type').eq('po_id', poId)
  const { data: invs } = await admin.from('po_invoices').select('amount').eq('po_id', poId)

  const original = po?.original_po_amount ?? 0
  const coTotal = (cos || []).filter((c: { type?: string }) => (c.type || 'co') === 'co').reduce((s: number, c: { amount?: number }) => s + (c.amount || 0), 0)
  const invTotal = (invs || []).reduce((s: number, i: { amount?: number }) => s + (i.amount || 0), 0)
  const runningBalance = original + coTotal - invTotal

  await admin.from('purchase_orders').update({ po_balance: runningBalance }).eq('id', poId)

  return NextResponse.json({ ok: true, original_po_amount: amt, po_balance: runningBalance })
}
