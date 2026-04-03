import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'
import { normalizePoIssueDateForDb } from '@/lib/utils'

/** Normalize CO/LI date from client (YYYY-MM-DD, ISO string, etc.) for Postgres date column */
function parseCoDate(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
/** Service role + full Supabase client; avoid Edge where env may omit SUPABASE_SERVICE_ROLE_KEY */
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const rawId = (await params).poId
  const poId = typeof rawId === 'string' ? rawId.trim() : ''
  if (!poId) {
    return NextResponse.json({ error: 'Missing PO id' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const role = user.profile.role as string

  const allowed = await canAccessPoBudget(supabase, user.id, role, poId)
  if (!allowed) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch {
    // Service role key may be missing in some environments
  }

  const poSelectWithJoins =
    '*, sites(id, name, address_street, address_city, address_state, address_zip, contact), departments(id, name)'

  /** Prefer service role so RLS never hides the row; fall back to * if embeds fail (PostgREST). */
  async function fetchPurchaseOrderRow(client: SupabaseClient): Promise<Record<string, unknown> | null> {
    const q1 = await client.from('purchase_orders').select(poSelectWithJoins).eq('id', poId).maybeSingle()
    if (q1.data) return q1.data as Record<string, unknown>
    const q2 = await client.from('purchase_orders').select('*').eq('id', poId).maybeSingle()
    if (q2.data) return q2.data as Record<string, unknown>
    return null
  }

  let po: Record<string, unknown> | null = null
  if (adminSupabase) {
    po = await fetchPurchaseOrderRow(adminSupabase)
  }
  if (!po) {
    po = await fetchPurchaseOrderRow(supabase)
  }

  if (!po) {
    if (!adminSupabase) {
      return NextResponse.json(
        {
          error:
            'Could not load this PO (session read blocked). Set SUPABASE_SERVICE_ROLE_KEY on the server so budget APIs can read purchase orders.',
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  }

  // Re-fetch PO with service role when available. Session/RLS reads can omit or null out columns (e.g. po_issue_date)
  // even after a successful admin PATCH, which made the UI look like saves "didn't work".
  let mergedPo: Record<string, unknown> = po
  if (adminSupabase) {
    const { data: adminPo } = await adminSupabase
      .from('purchase_orders')
      .select(poSelectWithJoins)
      .eq('id', poId)
      .maybeSingle()
    if (!adminPo) {
      const { data: adminPlain } = await adminSupabase.from('purchase_orders').select('*').eq('id', poId).maybeSingle()
      if (adminPlain) mergedPo = adminPlain as Record<string, unknown>
    } else {
      mergedPo = adminPo as Record<string, unknown>
    }
  }

  const changeOrdersQuery = adminSupabase
    ? adminSupabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: true })
    : supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: true })

  const invoicesQuery = adminSupabase
    ? adminSupabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: true })
    : supabase.from('po_invoices').select('*').eq('po_id', poId).order('invoice_date', { ascending: true })

  const billRatesQuery = adminSupabase
    ? adminSupabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })
    : supabase.from('po_bill_rates').select('*').eq('po_id', poId).order('effective_from_date', { ascending: false })

  const expenseTypesQuery = adminSupabase
    ? adminSupabase.from('po_expense_types').select('*').order('name')
    : supabase.from('po_expense_types').select('*').order('name')
  const expensesQuery = adminSupabase
    ? adminSupabase.from('po_expenses').select('*').eq('po_id', poId).order('expense_date', { ascending: false })
    : supabase.from('po_expenses').select('*').eq('po_id', poId).order('expense_date', { ascending: false })
  const [changeOrdersRes, invoicesRes, billRatesRes, expensesRes, expenseTypesRes] = await Promise.all([
    changeOrdersQuery,
    invoicesQuery,
    billRatesQuery,
    expensesQuery,
    expenseTypesQuery,
  ])

  let changeOrders = changeOrdersRes.data || []
  if (changeOrdersRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_change_orders').select('*').eq('po_id', poId).order('co_date', { ascending: true })
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
  let expenses = expensesRes.data || []
  if (expensesRes.error && adminSupabase) {
    const { data: fallback } = await supabase.from('po_expenses').select('*').eq('po_id', poId).order('expense_date', { ascending: false })
    expenses = fallback ?? []
  }
  let expenseTypes = expenseTypesRes.data || []
  // Fallback when admin query failed or returned empty (RLS may block user client in some envs)
  if ((expenseTypesRes.error || expenseTypes.length === 0) && adminSupabase) {
    const { data: fallback } = await supabase.from('po_expense_types').select('*').order('name')
    if ((fallback?.length ?? 0) > 0) expenseTypes = fallback ?? []
  }
  // Attachments: always use service-role read when possible (RLS often hides rows with no error).
  let attachments: Array<{ id: string; file_name: string; storage_path: string; file_type?: string | null }> = []
  if (adminSupabase) {
    const { data: attData, error: attErr } = await adminSupabase
      .from('po_attachments')
      .select('id, file_name, storage_path, file_type')
      .eq('po_id', poId)
    attachments = attData ?? []
    if (attErr) console.error('[budget GET] po_attachments admin', attErr)
  }
  if (attachments.length === 0) {
    const { data: fallback } = await supabase
      .from('po_attachments')
      .select('id, file_name, storage_path, file_type')
      .eq('po_id', poId)
    attachments = fallback ?? []
  }

  const billRateUserIds = [...new Set((billRatesRaw || []).map((r: any) => r.user_id).filter(Boolean))]

  // Fetch all user profiles for the bill rate dropdown. Use admin client to bypass RLS so managers/admins can see all profiles.
  const profilesClient = adminSupabase || supabase
  const { data: profiles } = await profilesClient
    .from('user_profiles')
    .select('id, name')
    .order('name')
  const profilesList = profiles || []
  // Include all profiles (don't filter by name) so bill rate users with empty names still resolve; use 'Unknown' for display
  const profilesMap: Record<string, { id: string; name: string }> = Object.fromEntries(
    profilesList.map((p: any) => [p.id, { id: p.id, name: p.name || 'Unknown' }])
  )
  const users: Array<{ id: string; name: string }> = profilesList.map((p: any) => ({ id: p.id, name: p.name || 'Unknown' }))

  const billRates = billRatesRaw.map((br: any) => ({
    ...br,
    user_profiles: br.user_id && profilesMap[br.user_id] ? { id: profilesMap[br.user_id].id, name: profilesMap[br.user_id].name } : null,
  }))

  const siteId = mergedPo.site_id as string
  const { data: siteDepartments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('site_id', siteId)
    .order('name')

  return NextResponse.json(
    {
      po: mergedPo,
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
    net_terms,
    how_to_bill,
    prior_hours_billed,
    prior_hours_billed_rate,
    prior_amount_spent,
    prior_period_notes,
    weekly_burn,
    target_end_date,
    active,
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
        budget_type !== undefined || client_contact_name !== undefined || net_terms !== undefined ||
        how_to_bill !== undefined || prior_hours_billed !== undefined || prior_hours_billed_rate !== undefined ||
        prior_amount_spent !== undefined || prior_period_notes !== undefined || weekly_burn !== undefined || target_end_date !== undefined ||
        active !== undefined) {
      const updateData: Record<string, unknown> = {}
      if (po_number !== undefined) updateData.po_number = po_number
      if (original_po_amount !== undefined) updateData.original_po_amount = original_po_amount === '' || original_po_amount == null ? null : parseFloat(String(original_po_amount))
      if (po_issue_date !== undefined) updateData.po_issue_date = normalizePoIssueDateForDb(po_issue_date)
      if (proposal_number !== undefined) updateData.proposal_number = proposal_number || null
      if (project_name !== undefined) {
        updateData.project_name = project_name || null
        updateData.description = project_name || null
      }
      if (department_id !== undefined) updateData.department_id = department_id || null
      if (budget_type !== undefined) updateData.budget_type = budget_type || 'basic'
      if (client_contact_name !== undefined) updateData.client_contact_name = client_contact_name || null
      if (net_terms !== undefined) updateData.net_terms = net_terms || null
      if (how_to_bill !== undefined) updateData.how_to_bill = how_to_bill || null
      if (prior_hours_billed !== undefined) updateData.prior_hours_billed = prior_hours_billed === '' || prior_hours_billed == null ? null : parseFloat(String(prior_hours_billed))
      if (prior_hours_billed_rate !== undefined) updateData.prior_hours_billed_rate = prior_hours_billed_rate === '' || prior_hours_billed_rate == null ? null : parseFloat(String(prior_hours_billed_rate))
      if (prior_amount_spent !== undefined) updateData.prior_amount_spent = prior_amount_spent === '' || prior_amount_spent == null ? null : parseFloat(String(prior_amount_spent))
      if (prior_period_notes !== undefined) updateData.prior_period_notes = prior_period_notes || null
      if (weekly_burn !== undefined) updateData.weekly_burn = weekly_burn === '' || weekly_burn == null ? null : parseFloat(String(weekly_burn))
      if (target_end_date !== undefined) updateData.target_end_date = target_end_date || null
      if (active !== undefined) updateData.active = !!active

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
        const typeVal = co.type === 'li' ? 'li' : 'co'
        const lineItemType = co.line_item_type === 'personnel' ? 'personnel' : co.line_item_type === 'labor' ? 'labor' : null
        const userIdVal = co.user_id || null
        const baseRow = {
          co_number: co.co_number ?? null,
          co_date: parseCoDate(co.co_date),
          amount: co.amount === '' || co.amount == null ? null : parseFloat(String(co.amount)),
          type: typeVal,
          line_item_type: lineItemType,
          user_id: userIdVal,
        }
        if (co.id) {
          const { error: coErr } = await adminSupabase
            .from('po_change_orders')
            .update(baseRow)
            .eq('id', co.id)
          if (coErr) throw coErr
        } else if (co.co_number || co.co_date || co.amount) {
          const { error: insertErr } = await adminSupabase.from('po_change_orders').insert({
            po_id: poId,
            ...baseRow,
          })
          if (insertErr) throw insertErr
        }
      }
    }

    // Return the full PO row from service role so the client can merge without relying on RLS-masked GET reads.
    let poAfter: Record<string, unknown> | null = null
    if (adminSupabase) {
      const { data: freshPo } = await adminSupabase
        .from('purchase_orders')
        .select('*, sites(id, name, address_street, address_city, address_state, address_zip, contact), departments(id, name)')
        .eq('id', poId)
        .single()
      if (freshPo) poAfter = freshPo as Record<string, unknown>
    }

    return NextResponse.json({ ok: true, po: poAfter })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
