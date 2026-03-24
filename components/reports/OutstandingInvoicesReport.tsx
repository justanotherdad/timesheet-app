'use client'

import { Fragment, useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Printer, Search } from 'lucide-react'

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
  | 'current_po_balance'
  | 'invoice_amount'

function formatCurrency(val: number): string {
  return `$${(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function displayInvoiceNumber(row: OutstandingRow): string {
  const n = (row.invoice_number || '').trim()
  return n || '—'
}

export default function OutstandingInvoicesReport() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
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
        if (!cancelled) setRows(data.rows || [])
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

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.client,
        r.po_number,
        r.project_name,
        r.invoice_number,
        String(r.invoice_amount),
        String(r.current_po_balance),
        r.invoice_date || '',
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [rows, filterText])

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

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir(col === 'invoice_amount' || col === 'current_po_balance' ? 'desc' : 'asc')
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden report-print-container">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">All Outstanding Invoices</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Each row is an invoice without a Payment Received date, grouped by client. Current PO balance is the PO-level balance (original + COs − all invoiced).
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={sortedRows.length === 0}
          className="print:hidden flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
          title="Print or save as PDF"
        >
          <Printer className="h-5 w-5" />
          Print / Export to PDF
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Filter</label>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search client, PO, project, invoice #, amounts…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
        </div>
        {filterText.trim() && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Showing {sortedRows.length} of {rows.length} invoice line(s)
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('client')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  Client
                  <SortIcon col="client" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('po_number')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  PO #
                  <SortIcon col="po_number" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('project_name')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  Project Name
                  <SortIcon col="project_name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('invoice_number')} className="inline-flex items-center hover:text-gray-900 dark:hover:text-gray-100">
                  Invoice #
                  <SortIcon col="invoice_number" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button
                  type="button"
                  onClick={() => handleSort('current_po_balance')}
                  className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Current PO Balance
                  <SortIcon col="current_po_balance" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button
                  type="button"
                  onClick={() => handleSort('invoice_amount')}
                  className="inline-flex items-center justify-end w-full hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Invoice Amount
                  <SortIcon col="invoice_amount" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {rows.length === 0 ? 'No outstanding invoices found' : 'No rows match your filter'}
                </td>
              </tr>
            ) : (
              <>
                {clientGroups.map((group) => (
                  <Fragment key={group.client}>
                    {group.rows.map((row) => (
                      <tr key={row.invoice_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.client}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          <Link href={`/dashboard/budget?poId=${row.po_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {row.po_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.project_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{displayInvoiceNumber(row)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(row.current_po_balance)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(row.invoice_amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 dark:bg-gray-700/40 font-semibold border-t-2 border-gray-200 dark:border-gray-600">
                      <td className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200" colSpan={3}>
                        Subtotal — {group.client}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                        {formatCurrency(group.sum)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {clientGroups.length > 1 && (
                  <tr className="bg-orange-50 dark:bg-orange-900/20 font-bold border-t-2 border-orange-200 dark:border-orange-800">
                    <td className="px-4 py-3 text-sm" colSpan={3}>
                      Grand total (all visible rows)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">—</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">—</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(grandTotal)}</td>
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
