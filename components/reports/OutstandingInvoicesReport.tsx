'use client'

import { Fragment, useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { differenceInDays, parseISO, startOfDay } from 'date-fns'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Printer } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

interface OutstandingRow {
  invoice_id: string
  invoice_number: string
  invoice_amount: number
  invoice_date: string | null
  po_id: string
  po_number: string
  project_name: string
  current_po_balance: number
  client: string
  site_id: string
}

type SortColumn =
  | 'client'
  | 'po_number'
  | 'project_name'
  | 'invoice_number'
  | 'invoice_date'
  | 'days_outstanding'
  | 'current_po_balance'
  | 'invoice_amount'

type DurationBucket = '' | '0-30' | '31-60' | '61-90' | '91-120' | '>120'

function formatCurrency(val: number): string {
  return `$${(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayInvoiceNumber(row: OutstandingRow): string {
  const n = (row.invoice_number || '').trim()
  return n || '—'
}

function formatInvoiceDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = parseISO(iso)
    if (isNaN(d.getTime())) return '—'
    return formatDateShort(iso)
  } catch {
    return '—'
  }
}

/** Whole calendar days from invoice date (document date) to today; null if unknown. */
function daysOutstanding(invoiceDate: string | null): number | null {
  if (!invoiceDate) return null
  try {
    const d = parseISO(invoiceDate)
    if (isNaN(d.getTime())) return null
    return differenceInDays(startOfDay(new Date()), startOfDay(d))
  } catch {
    return null
  }
}

function displayDaysOutstanding(invoiceDate: string | null): string {
  const d = daysOutstanding(invoiceDate)
  if (d === null) return '—'
  return String(d)
}

/** Calendar year of invoice date for Year filter. */
function invoiceYear(row: OutstandingRow): string | null {
  if (!row.invoice_date) return null
  const y = String(row.invoice_date).slice(0, 4)
  return /^\d{4}$/.test(y) ? y : null
}

function matchesDurationBucket(days: number | null, bucket: DurationBucket): boolean {
  if (!bucket) return true
  if (days === null) return false
  const d = Math.max(0, days)
  switch (bucket) {
    case '0-30':
      return d <= 30
    case '31-60':
      return d >= 31 && d <= 60
    case '61-90':
      return d >= 61 && d <= 90
    case '91-120':
      return d >= 91 && d <= 120
    case '>120':
      return d > 120
    default:
      return true
  }
}

export default function OutstandingInvoicesReport() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [years, setYears] = useState<string[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<{ id: string; po_number: string; site_id: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterPO, setFilterPO] = useState('')
  const [filterDuration, setFilterDuration] = useState<DurationBucket>('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('client')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/reports/outstanding-invoices')
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to load report')
        }
        const data = await res.json()
        if (!cancelled) {
          setRows(data.rows || [])
          setClients(data.clients || [])
          setYears(data.years || [])
          setPurchaseOrders(data.purchaseOrders || [])
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!filterPO) return
    const po = purchaseOrders.find((p) => p.id === filterPO)
    if (filterClient && po && po.site_id !== filterClient) {
      setFilterPO('')
    }
  }, [filterClient, filterPO, purchaseOrders])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterYear) {
        const y = invoiceYear(r)
        if (!y || y !== filterYear) return false
      }
      if (filterClient && r.site_id !== filterClient) return false
      if (filterPO && r.po_id !== filterPO) return false
      const days = daysOutstanding(r.invoice_date)
      if (!matchesDurationBucket(days, filterDuration)) return false
      return true
    })
  }, [rows, filterYear, filterClient, filterPO, filterDuration])

  const sortedRows = useMemo(() => {
    const out = [...filteredRows]
    const mult = sortDir === 'asc' ? 1 : -1
    out.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'client':
          cmp = a.client.localeCompare(b.client, undefined, { sensitivity: 'base' })
          break
        case 'po_number':
          cmp = a.po_number.localeCompare(b.po_number, undefined, { sensitivity: 'base' })
          break
        case 'project_name':
          cmp = a.project_name.localeCompare(b.project_name, undefined, { sensitivity: 'base' })
          break
        case 'invoice_number': {
          const na = (a.invoice_number || '').trim()
          const nb = (b.invoice_number || '').trim()
          if (!na && !nb) cmp = 0
          else if (!na) cmp = 1
          else if (!nb) cmp = -1
          else cmp = na.localeCompare(nb, undefined, { sensitivity: 'base' })
          break
        }
        case 'invoice_date': {
          const da = a.invoice_date || ''
          const db = b.invoice_date || ''
          if (!da && !db) cmp = 0
          else if (!da) cmp = 1
          else if (!db) cmp = -1
          else cmp = da.localeCompare(db)
          break
        }
        case 'days_outstanding': {
          const da = daysOutstanding(a.invoice_date)
          const db = daysOutstanding(b.invoice_date)
          if (da === null && db === null) cmp = 0
          else if (da === null) cmp = 1
          else if (db === null) cmp = -1
          else cmp = da - db
          break
        }
        case 'current_po_balance':
          cmp = a.current_po_balance - b.current_po_balance
          break
        case 'invoice_amount':
          cmp = a.invoice_amount - b.invoice_amount
          break
        default:
          cmp = 0
      }
      if (cmp !== 0) return mult * cmp
      return a.invoice_id.localeCompare(b.invoice_id)
    })
    return out
  }, [filteredRows, sortColumn, sortDir])

  const clientGroups = useMemo(() => {
    const order: string[] = []
    const seen = new Set<string>()
    for (const r of sortedRows) {
      if (!seen.has(r.client)) {
        seen.add(r.client)
        order.push(r.client)
      }
    }
    return order.map((client) => ({
      client,
      rows: sortedRows.filter((r) => r.client === client),
      sum: sortedRows.filter((r) => r.client === client).reduce((s, r) => s + r.invoice_amount, 0),
    }))
  }, [sortedRows])

  const grandTotal = useMemo(
    () => sortedRows.reduce((s, r) => s + r.invoice_amount, 0),
    [sortedRows]
  )

  const hasActiveFilters = Boolean(filterYear || filterClient || filterPO || filterDuration)

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir(
        col === 'invoice_amount' ||
          col === 'current_po_balance' ||
          col === 'invoice_date' ||
          col === 'days_outstanding'
          ? 'desc'
          : 'asc'
      )
    }
  }

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
        {error}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden report-print-container w-full max-w-full min-w-0">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">All Outstanding Invoices</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Each row is an invoice without a Payment Received date, grouped by client. Current PO balance is the PO-level balance (original + COs − all invoiced).{' '}
              <span className="text-gray-500 dark:text-gray-500">
                Duration and Days out. are calendar days from the invoice date (Inv. date) through today.
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={sortedRows.length === 0}
            className="print:hidden flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 shrink-0"
            title="Print or save as PDF"
          >
            <Printer className="h-5 w-5" />
            Print / Export to PDF
          </button>
        </div>
        <div className="flex flex-wrap gap-4 items-center print:hidden">
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Year:</span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Client:</span>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">PO:</span>
            <select
              value={filterPO}
              onChange={(e) => setFilterPO(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[160px]"
            >
              <option value="">All</option>
              {purchaseOrders
                .filter((po) => !filterClient || po.site_id === filterClient)
                .map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_number}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Duration:</span>
            <select
              value={filterDuration}
              onChange={(e) => setFilterDuration(e.target.value as DurationBucket)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">All</option>
              <option value="0-30">0–30 days</option>
              <option value="31-60">31–60 days</option>
              <option value="61-90">61–90 days</option>
              <option value="91-120">91–120 days</option>
              <option value=">120">&gt;120 days</option>
            </select>
          </label>
        </div>
        {hasActiveFilters && (
          <p className="text-xs text-gray-500 dark:text-gray-400 print:hidden">
            Showing {sortedRows.length} of {rows.length} invoice line(s)
          </p>
        )}
      </div>

      <div className="overflow-x-auto max-w-full">
        <table className="w-full min-w-[720px] text-xs sm:text-sm divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
          <colgroup>
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[17%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('client')} className="inline-flex items-center text-left hover:text-gray-900 dark:hover:text-gray-100">
                  Client
                  <SortIcon col="client" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('po_number')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  PO #
                  <SortIcon col="po_number" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('project_name')} className="inline-flex items-center text-left hover:text-gray-900 dark:hover:text-gray-100">
                  Project Name
                  <SortIcon col="project_name" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('invoice_number')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  Invoice #
                  <SortIcon col="invoice_number" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap">
                <button type="button" onClick={() => handleSort('invoice_date')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  Inv. date
                  <SortIcon col="invoice_date" />
                </button>
              </th>
              <th
                className="px-2 sm:px-3 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase whitespace-nowrap"
                title="Calendar days from invoice date to today"
              >
                <button
                  type="button"
                  onClick={() => handleSort('days_outstanding')}
                  className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Days out.
                  <SortIcon col="days_outstanding" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button
                  type="button"
                  onClick={() => handleSort('current_po_balance')}
                  className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                >
                  PO Balance
                  <SortIcon col="current_po_balance" />
                </button>
              </th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button
                  type="button"
                  onClick={() => handleSort('invoice_amount')}
                  className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Inv. amt
                  <SortIcon col="invoice_amount" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {rows.length === 0 ? 'No outstanding invoices found' : 'No rows match your filters'}
                </td>
              </tr>
            ) : (
              <>
                {clientGroups.map((group) => (
                  <Fragment key={group.client}>
                    {group.rows.map((row) => (
                      <tr key={row.invoice_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-900 dark:text-gray-100 align-top break-words">
                          {row.client}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-900 dark:text-gray-100 align-top whitespace-nowrap">
                          <Link href={`/dashboard/budget?poId=${row.po_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {row.po_number}
                          </Link>
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-900 dark:text-gray-100 align-top break-words">
                          {row.project_name}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-900 dark:text-gray-100 align-top whitespace-nowrap">
                          {displayInvoiceNumber(row)}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-gray-900 dark:text-gray-100 align-top whitespace-nowrap tabular-nums">
                          {formatInvoiceDate(row.invoice_date)}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-right text-gray-900 dark:text-gray-100 align-top whitespace-nowrap tabular-nums">
                          {displayDaysOutstanding(row.invoice_date)}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-right text-gray-900 dark:text-gray-100 align-top whitespace-nowrap tabular-nums">
                          {formatCurrency(row.current_po_balance)}
                        </td>
                        <td className="px-2 sm:px-3 py-2 sm:py-3 text-right text-gray-900 dark:text-gray-100 align-top whitespace-nowrap tabular-nums">
                          {formatCurrency(row.invoice_amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 dark:bg-gray-700/40 font-semibold border-t-2 border-gray-200 dark:border-gray-600">
                      <td className="px-2 sm:px-3 py-2 text-sm text-gray-800 dark:text-gray-200" colSpan={3}>
                        Subtotal — {group.client}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-2 sm:px-3 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-2 sm:px-3 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-2 sm:px-3 py-2 text-sm text-right text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-2 sm:px-3 py-2 text-sm text-right text-gray-900 dark:text-gray-100 tabular-nums">
                        {formatCurrency(group.sum)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {clientGroups.length > 1 && (
                  <tr className="bg-orange-50 dark:bg-orange-900/20 font-bold border-t-2 border-orange-200 dark:border-orange-800">
                    <td className="px-2 sm:px-3 py-3 text-sm" colSpan={3}>
                      Grand total (all visible rows)
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-sm text-gray-500">—</td>
                    <td className="px-2 sm:px-3 py-3 text-sm text-gray-500">—</td>
                    <td className="px-2 sm:px-3 py-3 text-sm text-gray-500">—</td>
                    <td className="px-2 sm:px-3 py-3 text-sm text-right text-gray-500">—</td>
                    <td className="px-2 sm:px-3 py-3 text-sm text-right">{formatCurrency(grandTotal)}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
