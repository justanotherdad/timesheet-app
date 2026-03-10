import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch {
    // Service role key may be missing in some environments
  }

  const changeOrdersQuery = adminSupabase
    ? adminSupabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: false })
    : supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: false })

  const billRatesQuery = adminSupabase
    ? adminSupabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })
    : supabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })

  const [changeOrdersRes, invoicesRes, billRatesRes, expensesRes, expenseTypesRes, assignedUsersRes, entriesRes] = await Promise.all([
    changeOrdersQuery,
    supabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: false }),
    billRatesQuery,
    supabase.from('po_expenses').select('*, po_expense_types(id, name)').eq('po_id', poId).order('expense_date', { ascending: false }),
    supabase.from('po_expense_types').select('*').order('name'),
    supabase.from('user_purchase_orders').select('user_id').eq('purchase_order_id', poId),
    (adminSupabase || supabase).from('timesheet_entries').select('timesheet_id').eq('po_id', poId),
  ])

  let changeOrders = changeOrdersRes.data || []
  if (changeOrdersRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: false })
    changeOrders = fallback || []
  }
  const invoices = invoicesRes.data || []
  let billRatesRaw = billRatesRes.data || []
  if (billRatesRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })
    billRatesRaw = fallback || []
  }
  const expenses = expensesRes.data || []
  const expenseTypes = expenseTypesRes.data || []

  const assignedUserIds = [...new Set((assignedUsersRes.data || []).map((r: any) => r.user_id))]
  const tsIdsFromEntries = [...new Set((entriesRes.data || []).map((r: any) => r.timesheet_id).filter(Boolean))]
  let hoursUserIds: string[] = []
  if (tsIdsFromEntries.length > 0) {
    const { data: tsData } = await (adminSupabase || supabase)
      .from('weekly_timesheets')
      .select('user_id')
      .in('id', tsIdsFromEntries)
    hoursUserIds = [...new Set((tsData || []).map((r: any) => r.user_id).filter(Boolean))]
  }
  const billRateUserIds = [...new Set((billRatesRaw || []).map((r: any) => r.user_id).filter(Boolean))]
  const allUserIds = [...new Set([...assignedUserIds, ...hoursUserIds, ...billRateUserIds])]

  let users: Array<{ id: string; name: string }> = []
  let profilesMap: Record<string, { id: string; name: string }> = {}
  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, name')
      .in('id', allUserIds)
      .order('name')
    users = (profiles || []).filter((u: any) => u.name)
    profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, { id: p.id, name: p.name }]))
  }

  const billRates = billRatesRaw.map((br: any) => ({
    ...br,
    user_profiles: br.user_id && profilesMap[br.user_id] ? { id: profilesMap[br.user_id].id, name: profilesMap[br.user_id].name } : null,
  }))

  const { data: siteDepartments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('site_id', po.site_id)
    .order('name')

  return NextResponse.json({
    po,
    changeOrders,
    invoices,
    billRates,
    expenses,
    expenseTypes,
    users,
    siteDepartments: siteDepartments || [],
  })
}

export async function PATCH(
  req: Request,
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

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po || (accessibleSiteIds !== null && !accessibleSiteIds.includes(po.site_id))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await req.json()
  const {
    po_number,
    original_po_amount,
    po_issue_date,
    proposal_number,
    project_name,
    department_id,
    budget_type,
    prior_hours_billed,
    prior_amount_spent,
    prior_period_notes,
    changeOrders: changeOrdersPayload,
  } = body

  try {
    if (po_number !== undefined || original_po_amount !== undefined || po_issue_date !== undefined ||
        proposal_number !== undefined || project_name !== undefined || department_id !== undefined ||
        budget_type !== undefined || prior_hours_billed !== undefined || prior_amount_spent !== undefined || prior_period_notes !== undefined) {
      const updateData: Record<string, unknown> = {}
      if (po_number !== undefined) updateData.po_number = po_number
      if (original_po_amount !== undefined) updateData.original_po_amount = original_po_amount === '' || original_po_amount == null ? null : parseFloat(String(original_po_amount))
      if (po_issue_date !== undefined) updateData.po_issue_date = po_issue_date || null
      if (proposal_number !== undefined) updateData.proposal_number = proposal_number || null
      if (project_name !== undefined) {
        updateData.project_name = project_name || null
        updateData.description = project_name || null
      }
      if (department_id !== undefined) updateData.department_id = department_id || null
      if (budget_type !== undefined) updateData.budget_type = budget_type || 'basic'
      if (prior_hours_billed !== undefined) updateData.prior_hours_billed = prior_hours_billed === '' || prior_hours_billed == null ? null : parseFloat(String(prior_hours_billed))
      if (prior_amount_spent !== undefined) updateData.prior_amount_spent = prior_amount_spent === '' || prior_amount_spent == null ? null : parseFloat(String(prior_amount_spent))
      if (prior_period_notes !== undefined) updateData.prior_period_notes = prior_period_notes || null

      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', poId)
      if (updateError) throw updateError
    }

    if (Array.isArray(changeOrdersPayload)) {
      const { data: existing } = await supabase.from('po_change_orders').select('id').eq('po_id', poId)
      const payloadIds = new Set(changeOrdersPayload.filter((c: { id?: string }) => c.id).map((c: { id: string }) => c.id))
      for (const row of existing || []) {
        if (!payloadIds.has(row.id)) {
          await supabase.from('po_change_orders').delete().eq('id', row.id)
        }
      }
      for (const co of changeOrdersPayload) {
        if (co.id) {
          await supabase
            .from('po_change_orders')
            .update({
              co_number: co.co_number ?? null,
              co_date: co.co_date || null,
              amount: co.amount === '' || co.amount == null ? null : parseFloat(String(co.amount)),
            })
            .eq('id', co.id)
        } else if (co.co_number || co.co_date || co.amount) {
          await supabase.from('po_change_orders').insert({
            po_id: poId,
            co_number: co.co_number ?? null,
            co_date: co.co_date || null,
            amount: co.amount === '' || co.amount == null ? null : parseFloat(String(co.amount)),
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
