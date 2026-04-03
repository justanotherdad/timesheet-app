'use client'

import { useEffect, useState } from 'react'
import { formatPoIssueDateForDisplay } from '@/lib/utils'

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0)
}

export type BudgetPoSummaryPanelPo = {
  po_number: string
  project_name?: string | null
  description?: string | null
  po_issue_date?: string | null
  proposal_number?: string | null
}

type Props = {
  poId: string
  po: BudgetPoSummaryPanelPo
  onViewDetails: () => void
}

export default function BudgetPoSummaryPanel({ poId, po, onViewDetails }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [poFromApi, setPoFromApi] = useState<Record<string, unknown> | null>(null)
  const [totalBudget, setTotalBudget] = useState(0)
  const [invoiceRunningBalance, setInvoiceRunningBalance] = useState(0)
  const [budgetBalance, setBudgetBalance] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const t = `t=${Date.now()}`
        const fetchOpts: RequestInit = {
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }
        const [res, balRes] = await Promise.all([
          fetch(`/api/budget/${poId}?${t}`, fetchOpts),
          fetch(`/api/budget/${poId}/balance?${t}`, fetchOpts),
        ])
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || 'Could not load budget')
        }
        if (!balRes.ok) {
          const body = await balRes.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || 'Could not load balance')
        }
        const json = await res.json()
        const balJson = await balRes.json()
        if (cancelled) return
        const poData = (json.po ?? {}) as Record<string, unknown>
        setPoFromApi(poData)
        const changeOrders = Array.isArray(json.changeOrders) ? json.changeOrders : []
        const invoices = Array.isArray(json.invoices) ? json.invoices : []
        const original = Number(poData.original_po_amount) || 0
        const coTotal = changeOrders
          .filter((c: { type?: string }) => (c.type || 'co') === 'co')
          .reduce((s: number, c: { amount?: number }) => s + (c.amount || 0), 0)
        const liTotal = changeOrders
          .filter((c: { type?: string }) => c.type === 'li')
          .reduce((s: number, c: { amount?: number }) => s + (c.amount || 0), 0)
        const tb = original + coTotal + liTotal
        const invTotal = invoices.reduce((s: number, inv: { amount?: number }) => s + (inv.amount || 0), 0)
        setTotalBudget(tb)
        setInvoiceRunningBalance(tb - invTotal)
        setBudgetBalance(Number(balJson.budgetBalance) || 0)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load summary')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [poId])

  const merged = poFromApi ?? {}
  const projectName =
    (typeof merged.project_name === 'string' && merged.project_name.trim()) ||
    po.project_name?.trim() ||
    po.description?.trim() ||
    '—'
  const issueRaw = merged.po_issue_date ?? po.po_issue_date
  const issueDisplay = issueRaw ? formatPoIssueDateForDisplay(issueRaw) : '—'
  const proposal =
    (typeof merged.proposal_number === 'string' && merged.proposal_number.trim()) ||
    po.proposal_number?.trim() ||
    ''
  const proposalDisplay = proposal || '—'

  return (
    <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-4 py-4 text-sm">
      {loading && (
        <div className="flex items-center gap-3 py-2 text-gray-600 dark:text-gray-400">
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full shrink-0" />
          <span>Loading budget summary…</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">PO #</div>
              <div className="text-gray-900 dark:text-gray-100 font-medium">{po.po_number}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">PO project name</div>
              <div className="text-gray-900 dark:text-gray-100 font-medium break-words">{projectName}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">PO issue date</div>
              <div className="text-gray-900 dark:text-gray-100">{issueDisplay}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Proposal #</div>
              <div className="text-gray-900 dark:text-gray-100">{proposalDisplay}</div>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
              <span className="text-gray-600 dark:text-gray-400">Overall budget amount (incl. all COs)</span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(totalBudget)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
              <span className="text-gray-600 dark:text-gray-400">Invoice running balance</span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(invoiceRunningBalance)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1">
              <span className="text-gray-600 dark:text-gray-400">Budget balance</span>
              <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(budgetBalance)}</span>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={onViewDetails}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 text-sm"
            >
              View details
            </button>
          </div>
        </>
      )}
    </div>
  )
}
