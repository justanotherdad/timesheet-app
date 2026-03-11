import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*, sites(id, name, address_street, address_city, address_state, address_zip, contact), departments(id, name)')
    .eq('id', poId)
    .single()

  if (poError || !po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  if (isAdminOrAbove) {
    // Admin/Super Admin: full access to all POs
  } else {
    // Manager, Supervisor, Employee: must have po_budget_access grant
    const { data: accessRow } = await supabase
      .from('po_budget_access')
      .select('user_id')
      .eq('purchase_order_id', poId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!accessRow) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
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

  const invoicesQuery = adminSupabase
    ? adminSupabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: true })
    : supabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: true })

  const billRatesQuery = adminSupabase
    ? adminSupabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })
    : supabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })

  const attachmentsQuery = adminSupabase
    ? adminSupabase.from('po_attachments').select('id, file_name, storage_path, file_type').eq('po_id', poId)
    : supabase.from('po_attachments').select('id, file_name, storage_path, file_type').eq('po_id', poId)

  const [changeOrdersRes, invoicesRes, billRatesRes, expensesRes, expenseTypesRes, attachmentsRes] = await Promise.all([
    changeOrdersQuery,
    invoicesQuery,
    billRatesQuery,
    supabase.from('po_expenses').select('*, po_expense_types(id, name)').eq('po_id', poId).order('expense_date', { ascending: false }),
    supabase.from('po_expense_types').select('*').order('name'),
    attachmentsQuery,
  ])

  let changeOrders = changeOrdersRes.data || []
  if (changeOrdersRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: false })
    changeOrders = fallback || []
  }
  let invoices = invoicesRes.data || []
  if (invoicesRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: true })
    invoices = fallback || []
  }
  let billRatesRaw = billRatesRes.data || []
  if (billRatesRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })
    billRatesRaw = fallback || []
  }
  const expenses = expensesRes.data || []
  const expenseTypes = expenseTypesRes.data || []
  const attachments = attachmentsRes.data || []

  const billRateUserIds = [...new Set((billRatesRaw || []).map((r: any) => r.user_id).filter(Boolean))]

  // Fetch all user profiles for the bill rate dropdown. Use admin client to bypass RLS so managers/admins can see all profiles.
  const profilesClient = adminSupabase || supabase
  const { data: profiles } = await profilesClient
    .from('user_profiles')
    .select('id, name')
    .order('name')
  const profilesList = (profiles || []).filter((p: any) => p?.name)
  const users: Array<{ id: string; name: string }> = profilesList.map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))
  const profilesMap: Record<string, { id: string; name: string }> = Object.fromEntries(profilesList.map((p: any) => [p.id, { id: p.id, name: p.name || 'Unknown' }]))

  const billRates = billRatesRaw.map((br: any) => ({
    ...br,
    user_profiles: br.user_id && profilesMap[br.user_id] ? { id: profilesMap[br.user_id].id, name: profilesMap[br.user_id].name } : null,
  }))

  const { data: siteDepartments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('site_id', po.site_id)
    .order('name')

  return NextResponse.json(
    {
      po,
      changeOrders,
      invoices,
      billRates,
      expenses,
      expenseTypes,
      attachments,
      users,
      siteDepartments: siteDepartments || [],
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    }
  )
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
  const role = user.profile.role as string
  const isAdminOrAbove = ['admin', 'super_admin'].includes(role)

  const { data: po } = await supabase
    .from('purchase_orders')
    .select('site_id')
    .eq('id', poId)
    .single()

  if (!po) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  if (!isAdminOrAbove) {
    const { data: accessRow } = await supabase
      .from('po_budget_access')
      .select('user_id')
      .eq('purchase_order_id', poId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!accessRow) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
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
    client_contact_name,
    prior_hours_billed,
    prior_hours_billed_rate,
    prior_amount_spent,
    prior_period_notes,
    changeOrders: changeOrdersPayload,
  } = body

  let adminSupabase: ReturnType<typeof createAdminClient>
  try {
    adminSupabase = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  try {
    if (po_number !== undefined || original_po_amount !== undefined || po_issue_date !== undefined ||
        proposal_number !== undefined || project_name !== undefined || department_id !== undefined ||
        budget_type !== undefined || client_contact_name !== undefined || prior_hours_billed !== undefined || prior_hours_billed_rate !== undefined || prior_amount_spent !== undefined || prior_period_notes !== undefined) {
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
      if (client_contact_name !== undefined) updateData.client_contact_name = client_contact_name || null
      if (prior_hours_billed !== undefined) updateData.prior_hours_billed = prior_hours_billed === '' || prior_hours_billed == null ? null : parseFloat(String(prior_hours_billed))
      if (prior_hours_billed_rate !== undefined) updateData.prior_hours_billed_rate = prior_hours_billed_rate === '' || prior_hours_billed_rate == null ? null : parseFloat(String(prior_hours_billed_rate))
      if (prior_amount_spent !== undefined) updateData.prior_amount_spent = prior_amount_spent === '' || prior_amount_spent == null ? null : parseFloat(String(prior_amount_spent))
      if (prior_period_notes !== undefined) updateData.prior_period_notes = prior_period_notes || null

      const { error: updateError } = await adminSupabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', poId)
      if (updateError) throw updateError
    }

    if (Array.isArray(changeOrdersPayload)) {
      const { data: existing } = await adminSupabase.from('po_change_orders').select('id').eq('po_id', poId)
      const payloadIds = new Set(changeOrdersPayload.filter((c: { id?: string }) => c.id).map((c: { id: string }) => c.id))
      for (const row of existing || []) {
        if (!payloadIds.has(row.id)) {
          await adminSupabase.from('po_change_orders').delete().eq('id', row.id)
        }
      }
      for (const co of changeOrdersPayload) {
        if (co.id) {
          const { error: coErr } = await adminSupabase
            .from('po_change_orders')
            .update({
              co_number: co.co_number ?? null,
              co_date: co.co_date || null,
              amount: co.amount === '' || co.amount == null ? null : parseFloat(String(co.amount)),
            })
            .eq('id', co.id)
          if (coErr) throw coErr
        } else if (co.co_number || co.co_date || co.amount) {
          const { error: insertErr } = await adminSupabase.from('po_change_orders').insert({
            po_id: poId,
            co_number: co.co_number ?? null,
            co_date: co.co_date || null,
            amount: co.amount === '' || co.amount == null ? null : parseFloat(String(co.amount)),
          })
          if (insertErr) throw insertErr
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
