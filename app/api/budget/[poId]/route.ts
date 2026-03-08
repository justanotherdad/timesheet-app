import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSiteIds } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*, sites(id, name, address_street, address_city, address_state, address_zip, contact), departments(id, name)')
    .eq('id', poId)
    .single()

  if (poError || !po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  if (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const [changeOrdersRes, invoicesRes, billRatesRes, expensesRes, expenseTypesRes, assignedUsersRes] = await Promise.all([
    supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: false }),
    supabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: false }),
    supabase.from('po_bill_rates').select('*, user_profiles!user_id(id, name)').eq('po_id', poId).order('effective_from_date', { ascending: false }),
    supabase.from('po_expenses').select('*, po_expense_types(id, name)').eq('po_id', poId).order('expense_date', { ascending: false }),
    supabase.from('po_expense_types').select('*').order('name'),
    supabase.from('user_purchase_orders').select('user_id').eq('purchase_order_id', poId),
  ])

  const changeOrders = changeOrdersRes.data || []
  const invoices = invoicesRes.data || []
  const billRates = billRatesRes.data || []
  const expenses = expensesRes.data || []
  const expenseTypes = expenseTypesRes.data || []

  const assignedUserIds = [...new Set((assignedUsersRes.data || []).map((r: any) => r.user_id))]
  let users: Array<{ id: string; name: string }> = []
  if (assignedUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, name')
      .in('id', assignedUserIds)
      .order('name')
    users = (profiles || []).filter((u: any) => u.name)
  }

  return NextResponse.json({
    po,
    changeOrders,
    invoices,
    billRates,
    expenses,
    expenseTypes,
    users,
  })
}
