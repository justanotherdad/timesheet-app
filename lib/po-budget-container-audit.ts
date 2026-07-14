import { createAdminClient } from '@/lib/supabase/admin'
import { formatDate, formatPeriodsList } from '@/lib/utils'

export type BudgetContainer = 'invoices' | 'expenses' | 'bill_rates' | 'budget_summary' | 'notes'

export interface PoBudgetContainerAuditEntry {
  id: string
  po_id: string
  container: BudgetContainer
  actor_id: string
  actor_name: string | null
  description: string
  created_at: string
}

export interface LogPoBudgetContainerAuditParams {
  poId: string
  container: BudgetContainer
  actorId: string
  actorName?: string | null
  description: string
}

function formatMoney(amount: number | null | undefined): string {
  return `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function invoiceLabel(invoiceNumber: string | null | undefined): string {
  const n = (invoiceNumber ?? '').trim()
  return n ? `invoice #${n}` : 'invoice (no number)'
}

function normalizePeriods(
  periods: Array<{ month: number; year: number }> | null | undefined,
  periodMonth?: number | null,
  periodYear?: number | null
): Array<{ month: number; year: number }> {
  if (periods?.length) return periods
  if (periodMonth != null && periodYear != null) return [{ month: periodMonth, year: periodYear }]
  return []
}

function formatPeriods(
  periods: Array<{ month: number; year: number }> | null | undefined,
  periodMonth?: number | null,
  periodYear?: number | null
): string {
  const list = normalizePeriods(periods, periodMonth, periodYear)
  if (!list.length) return '—'
  return formatPeriodsList(list)
}

function appendFieldChange(
  parts: string[],
  label: string,
  oldVal: string,
  newVal: string
): void {
  if (oldVal !== newVal) parts.push(`${label} ${oldVal} → ${newVal}`)
}

/** Fire-and-forget; does not throw or block the caller's response. */
export async function logPoBudgetContainerAudit(params: LogPoBudgetContainerAuditParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('po_budget_container_audit').insert({
      po_id: params.poId,
      container: params.container,
      actor_id: params.actorId,
      actor_name: params.actorName ?? null,
      description: params.description,
    })
  } catch (err) {
    console.error('[po-budget-container-audit] Failed to log:', err)
  }
}

export function buildInvoiceAddedDescription(inv: {
  invoice_number?: string | null
  amount?: number | null
}): string {
  return `Added ${invoiceLabel(inv.invoice_number)} for ${formatMoney(inv.amount)}`
}

export function buildInvoiceUpdatedDescription(
  before: {
    invoice_number?: string | null
    invoice_date?: string | null
    amount?: number | null
    payment_received_date?: string | null
    notes?: string | null
    periods?: Array<{ month: number; year: number }> | null
    period_month?: number | null
    period_year?: number | null
  },
  after: {
    invoice_number?: string | null
    invoice_date?: string | null
    amount?: number | null
    payment_received_date?: string | null
    notes?: string | null
    periods?: Array<{ month: number; year: number }> | null
    period_month?: number | null
    period_year?: number | null
  }
): string {
  const label = invoiceLabel(after.invoice_number ?? before.invoice_number)
  const parts: string[] = []
  appendFieldChange(
    parts,
    'invoice date',
    before.invoice_date ? formatDate(before.invoice_date) : '—',
    after.invoice_date ? formatDate(after.invoice_date) : '—'
  )
  appendFieldChange(
    parts,
    'invoice #',
    (before.invoice_number ?? '').trim() || '—',
    (after.invoice_number ?? '').trim() || '—'
  )
  appendFieldChange(
    parts,
    'amount',
    formatMoney(before.amount),
    formatMoney(after.amount)
  )
  appendFieldChange(
    parts,
    'period',
    formatPeriods(before.periods, before.period_month, before.period_year),
    formatPeriods(after.periods, after.period_month, after.period_year)
  )
  appendFieldChange(
    parts,
    'payment received',
    before.payment_received_date ? formatDate(before.payment_received_date) : '—',
    after.payment_received_date ? formatDate(after.payment_received_date) : '—'
  )
  appendFieldChange(parts, 'notes', (before.notes ?? '').trim() || '—', (after.notes ?? '').trim() || '—')
  if (!parts.length) return `Updated ${label} (no field changes)`
  return `Updated ${label}: ${parts.join('; ')}`
}

export function buildInvoiceDeletedDescription(inv: {
  invoice_number?: string | null
  amount?: number | null
}): string {
  return `Deleted ${invoiceLabel(inv.invoice_number)} (${formatMoney(inv.amount)})`
}

export function expenseTypeLabel(
  expense: {
    custom_type_name?: string | null
    expense_type_id?: string | null
  },
  typeNamesById?: Record<string, string>
): string {
  if (expense.custom_type_name?.trim()) return expense.custom_type_name.trim()
  if (expense.expense_type_id && typeNamesById?.[expense.expense_type_id]) {
    return typeNamesById[expense.expense_type_id]
  }
  return 'Expense'
}

export function buildExpenseAddedDescription(
  expense: {
    custom_type_name?: string | null
    expense_type_id?: string | null
    amount?: number | null
    expense_date?: string | null
  },
  typeNamesById?: Record<string, string>
): string {
  const typeLabel = expenseTypeLabel(expense, typeNamesById)
  const datePart = expense.expense_date ? formatDate(expense.expense_date) : '—'
  return `Added ${typeLabel} expense for ${formatMoney(expense.amount)} (${datePart})`
}

export function buildExpenseUpdatedDescription(
  before: {
    custom_type_name?: string | null
    expense_type_id?: string | null
    amount?: number | null
    expense_date?: string | null
    notes?: string | null
  },
  after: {
    custom_type_name?: string | null
    expense_type_id?: string | null
    amount?: number | null
    expense_date?: string | null
    notes?: string | null
  },
  typeNamesById?: Record<string, string>
): string {
  const label = expenseTypeLabel(after, typeNamesById)
  const parts: string[] = []
  appendFieldChange(parts, 'type', expenseTypeLabel(before, typeNamesById), expenseTypeLabel(after, typeNamesById))
  appendFieldChange(parts, 'amount', formatMoney(before.amount), formatMoney(after.amount))
  appendFieldChange(
    parts,
    'date',
    before.expense_date ? formatDate(before.expense_date) : '—',
    after.expense_date ? formatDate(after.expense_date) : '—'
  )
  appendFieldChange(parts, 'notes', (before.notes ?? '').trim() || '—', (after.notes ?? '').trim() || '—')
  if (!parts.length) return `Updated ${label} expense (no field changes)`
  return `Updated ${label} expense: ${parts.join('; ')}`
}

export function buildExpenseDeletedDescription(
  expense: {
    custom_type_name?: string | null
    expense_type_id?: string | null
    amount?: number | null
  },
  typeNamesById?: Record<string, string>
): string {
  const typeLabel = expenseTypeLabel(expense, typeNamesById)
  return `Deleted ${typeLabel} expense (${formatMoney(expense.amount)})`
}

export function buildBillRateAddedDescription(
  rate: {
    rate?: number | null
    effective_from_date?: string | null
  },
  employeeName: string
): string {
  const from = rate.effective_from_date ? formatDate(rate.effective_from_date) : '—'
  return `Added bill rate for ${employeeName}: ${formatMoney(rate.rate)}/hr effective ${from}`
}

export function buildBillRateUpdatedDescription(
  before: {
    rate?: number | null
    effective_from_date?: string | null
    effective_to_date?: string | null
  },
  after: {
    rate?: number | null
    effective_from_date?: string | null
    effective_to_date?: string | null
  },
  employeeName: string
): string {
  const parts: string[] = []
  appendFieldChange(parts, 'rate', `${formatMoney(before.rate)}/hr`, `${formatMoney(after.rate)}/hr`)
  appendFieldChange(
    parts,
    'effective from',
    before.effective_from_date ? formatDate(before.effective_from_date) : '—',
    after.effective_from_date ? formatDate(after.effective_from_date) : '—'
  )
  appendFieldChange(
    parts,
    'effective to',
    before.effective_to_date ? formatDate(before.effective_to_date) : '—',
    after.effective_to_date ? formatDate(after.effective_to_date) : '—'
  )
  if (!parts.length) return `Updated ${employeeName} bill rate (no field changes)`
  return `Updated ${employeeName} bill rate: ${parts.join('; ')}`
}

export function buildBillRateRemovedFromPoDescription(
  employeeName: string,
  effectiveToDate: string | null | undefined
): string {
  const end = effectiveToDate ? formatDate(effectiveToDate) : '—'
  return `Removed ${employeeName} from PO (end date ${end})`
}

export function buildBillRateDeletedDescription(
  rate: { rate?: number | null },
  employeeName: string
): string {
  return `Deleted bill rate for ${employeeName} (${formatMoney(rate.rate)}/hr)`
}

function formatHours(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface BudgetSummarySnapshot {
  original_po_amount?: number | null
  prior_hours_billed?: number | null
  prior_hours_billed_rate?: number | null
  prior_amount_spent?: number | null
  prior_period_notes?: string | null
  changeOrdersTotal?: number | null
  changeOrdersCount?: number | null
}

/** Detailed, field-level description for a Budget Summary save (mirrors the other container trails). */
export function buildBudgetSummaryUpdatedDescription(
  before: BudgetSummarySnapshot,
  after: BudgetSummarySnapshot
): string {
  const parts: string[] = []
  appendFieldChange(parts, 'original PO amount', formatMoney(before.original_po_amount), formatMoney(after.original_po_amount))
  appendFieldChange(parts, 'prior hours billed', formatHours(before.prior_hours_billed), formatHours(after.prior_hours_billed))
  appendFieldChange(
    parts,
    'prior hours rate',
    `${formatMoney(before.prior_hours_billed_rate)}/hr`,
    `${formatMoney(after.prior_hours_billed_rate)}/hr`
  )
  appendFieldChange(parts, 'prior amount spent', formatMoney(before.prior_amount_spent), formatMoney(after.prior_amount_spent))
  appendFieldChange(
    parts,
    'prior period notes',
    (before.prior_period_notes ?? '').trim() || '—',
    (after.prior_period_notes ?? '').trim() || '—'
  )
  if (before.changeOrdersCount != null || after.changeOrdersCount != null) {
    appendFieldChange(parts, 'change orders', String(before.changeOrdersCount ?? 0), String(after.changeOrdersCount ?? 0))
    appendFieldChange(parts, 'change order total', formatMoney(before.changeOrdersTotal), formatMoney(after.changeOrdersTotal))
  }
  if (!parts.length) return 'Updated Budget Summary (no field changes)'
  return `Updated Budget Summary: ${parts.join('; ')}`
}

/** Generic description for a Notes save (per requirement: only that a change was made). */
export function buildNotesUpdatedDescription(): string {
  return 'Updated notes'
}

export async function fetchExpenseTypeNames(
  supabase: { from: (table: string) => any },
  typeIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(typeIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data } = await supabase.from('po_expense_types').select('id, name').in('id', ids)
  return Object.fromEntries((data || []).map((t: { id: string; name: string }) => [t.id, t.name]))
}

export async function fetchUserName(
  supabase: { from: (table: string) => any },
  userId: string | null | undefined
): Promise<string> {
  if (!userId) return 'Unknown'
  const { data } = await supabase.from('user_profiles').select('name').eq('id', userId).maybeSingle()
  return data?.name?.trim() || 'Unknown'
}
