'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Printer, Download } from 'lucide-react'

interface POStatusRow {
  client: string
  site_id: string
  po_id: string
  po_number: string
  project_name: string
  original_po_amount_incl_cos: number
  total_invoiced: number
  total_paid: number
  total_outstanding: number
  po_balance: number
  budget_balance: number
}

interface POStatusData {
  rows: POStatusRow[]
  clients: { id: string; name: string }[]
  purchaseOrders: { id: string; po_number: string; site_id: string }[]
}

function formatCurrency(val: number): string {
  return `$${(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type SortColumn = 'client' | 'po_number' | 'project_name' | 'original_po_amount_incl_cos' | 'total_invoiced' | 'total_paid' | 'total_outstanding' | 'po_balance' | 'budget_balance'

export default function POStatusReport() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<POStatusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterIncludeDeactivated, setFilterIncludeDeactivated] = useState(false)
  const [filterClient, setFilterClient] = useState('')
  const [filterPO, setFilterPO] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('client')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterIncludeDeactivated) params.set('includeDeactivated', 'true')
      if (filterClient) params.set('client', filterClient)
      if (filterPO) params.set('po', filterPO)
      const res = await fetch(`/api/reports/po-status?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load report')
      }
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filterIncludeDeactivated, filterClient, filterPO])

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    const rows = data?.rows || []
    const mult = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (sortColumn) {
        case 'client':
          aVal = a.client || ''
          bVal = b.client || ''
          break
        case 'po_number':
          aVal = a.po_number || ''
          bVal = b.po_number || ''
          break
        case 'original_po_amount_incl_cos':
          aVal = a.original_po_amount_incl_cos ?? 0
          bVal = b.original_po_amount_incl_cos ?? 0
          break
        case 'project_name':
          aVal = a.project_name || ''
          bVal = b.project_name || ''
          break
        case 'total_invoiced':
          aVal = a.total_invoiced ?? 0
          bVal = b.total_invoiced ?? 0
          break
        case 'total_paid':
          aVal = a.total_paid ?? 0
          bVal = b.total_paid ?? 0
          break
        case 'total_outstanding':
          aVal = a.total_outstanding ?? 0
          bVal = b.total_outstanding ?? 0
          break
        case 'po_balance':
          aVal = a.po_balance ?? 0
          bVal = b.po_balance ?? 0
          break
        case 'budget_balance':
          aVal = a.budget_balance ?? 0
          bVal = b.budget_balance ?? 0
          break
        default:
          aVal = ''
          bVal = ''
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') return mult * aVal.localeCompare(bVal)
      return mult * ((aVal as number) - (bVal as number))
    })
  }, [data?.rows, sortColumn, sortDir])

  // Group by client for subtotals
  const rowsByClient = useMemo(() => {
    const map = new Map<string, POStatusRow[]>()
    for (const row of sortedRows) {
      const key = row.client || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [sortedRows])

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-4 w-4 inline opacity-50" />
    return sortDir === 'asc' ? <ArrowUp className="h-4 w-4 inline" /> : <ArrowDown className="h-4 w-4 inline" />
  }

  if (loading && !data) {
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

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const q = (v: string | number | null | undefined) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const n = (v: number | null | undefined) => (v ?? 0).toFixed(2)
    const header = [
      'Client',
      'PO #',
      'Project Name',
      'Original PO Amount (incl. COs)',
      'Total Invoiced',
      'Total Paid',
      'Total Outstanding',
      'PO Balance',
      'Budget Balance',
    ]
    const lines: string[] = [header.map(q).join(',')]
    for (const [clientName, clientRows] of Array.from(rowsByClient.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      for (const r of clientRows) {
        lines.push(
          [
            q(r.client),
            q(r.po_number),
            q(r.project_name),
            q(n(r.original_po_amount_incl_cos)),
            q(n(r.total_invoiced)),
            q(n(r.total_paid)),
            q(n(r.total_outstanding)),
            q(n(r.po_balance)),
            q(n(r.budget_balance)),
          ].join(',')
        )
      }
      const t = clientRows.reduce(
        (acc, r) => ({
          original_po_amount_incl_cos: acc.original_po_amount_incl_cos + (r.original_po_amount_incl_cos ?? 0),
          total_invoiced: acc.total_invoiced + (r.total_invoiced ?? 0),
          total_paid: acc.total_paid + (r.total_paid ?? 0),
          total_outstanding: acc.total_outstanding + (r.total_outstanding ?? 0),
          po_balance: acc.po_balance + (r.po_balance ?? 0),
          budget_balance: acc.budget_balance + (r.budget_balance ?? 0),
        }),
        { original_po_amount_incl_cos: 0, total_invoiced: 0, total_paid: 0, total_outstanding: 0, po_balance: 0, budget_balance: 0 }
      )
      lines.push(
        [
          q(`Subtotal: ${clientName}`),
          q(''),
          q(''),
          q(n(t.original_po_amount_incl_cos)),
          q(n(t.total_invoiced)),
          q(n(t.total_paid)),
          q(n(t.total_outstanding)),
          q(n(t.po_balance)),
          q(n(t.budget_balance)),
        ].join(',')
      )
    }
    const csvContent = '\uFEFF' + lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `po-status_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden report-print-container">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">PO Status Report</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Full PO status by client with Original PO, Change Orders, Invoices, Balances. Each client has a subtotal.
            </p>
          </div>
          <div className="print:hidden flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={sortedRows.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              title="Export current view to CSV"
            >
              <Download className="h-5 w-5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
              title="Print or save as PDF"
            >
              <Printer className="h-5 w-5" />
              Print / Export to PDF
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center print:hidden">
          <fieldset className="flex items-center gap-4">
            <legend className="sr-only">PO status</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="po-status-filter"
                checked={!filterIncludeDeactivated}
                onChange={() => setFilterIncludeDeactivated(false)}
                className="border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Active POs only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="po-status-filter"
                checked={filterIncludeDeactivated}
                onChange={() => setFilterIncludeDeactivated(true)}
                className="border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">Include deactivated POs</span>
            </label>
          </fieldset>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Client:</span>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[180px]"
            >
              <option value="">All</option>
              {(data?.clients || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
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
              {(data?.purchaseOrders || [])
                .filter((po) => !filterClient || po.site_id === filterClient)
                .map((po) => (
                  <option key={po.id} value={po.id}>{po.po_number}</option>
                ))}
            </select>
          </label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('client')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100">
                  Client <SortIcon col="client" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('po_number')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100">
                  PO # <SortIcon col="po_number" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('project_name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100">
                  Project Name <SortIcon col="project_name" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('original_po_amount_incl_cos')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  Original PO Amount (incl. COs) <SortIcon col="original_po_amount_incl_cos" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('total_invoiced')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  Total Invoiced <SortIcon col="total_invoiced" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('total_paid')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  Total Paid <SortIcon col="total_paid" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('total_outstanding')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  Total Outstanding <SortIcon col="total_outstanding" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('po_balance')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  PO Balance <SortIcon col="po_balance" />
                </button>
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">
                <button type="button" onClick={() => handleSort('budget_balance')} className="flex items-center gap-1 ml-auto hover:text-gray-900 dark:hover:text-gray-100">
                  Budget Balance <SortIcon col="budget_balance" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No data found
                </td>
              </tr>
            ) : (
              Array.from(rowsByClient.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([clientName, clientRows]) => {
                const clientTotal = clientRows.reduce(
                  (acc, r) => ({
                    original_po_amount_incl_cos: acc.original_po_amount_incl_cos + (r.original_po_amount_incl_cos ?? 0),
                    total_invoiced: acc.total_invoiced + (r.total_invoiced ?? 0),
                    total_paid: acc.total_paid + (r.total_paid ?? 0),
                    total_outstanding: acc.total_outstanding + (r.total_outstanding ?? 0),
                    po_balance: acc.po_balance + (r.po_balance ?? 0),
                    budget_balance: acc.budget_balance + (r.budget_balance ?? 0),
                  }),
                  { original_po_amount_incl_cos: 0, total_invoiced: 0, total_paid: 0, total_outstanding: 0, po_balance: 0, budget_balance: 0 }
                )
                return (
                  <React.Fragment key={clientName}>
                    {clientRows.map((row) => (
                      <tr key={row.po_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.client}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          <Link href={`/dashboard/budget?poId=${row.po_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {row.po_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.project_name}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.original_po_amount_incl_cos)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.total_invoiced)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.total_paid)}</td>
                        <td className="px-4 py-3 text-sm text-right text-amber-700 dark:text-amber-300">{formatCurrency(row.total_outstanding)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.po_balance)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.budget_balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 dark:bg-gray-700/50 font-semibold">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100" colSpan={2}>
                        Subtotal: {clientName}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(clientTotal.original_po_amount_incl_cos)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(clientTotal.total_invoiced)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(clientTotal.total_paid)}</td>
                      <td className="px-4 py-2 text-sm text-right text-amber-700 dark:text-amber-300">{formatCurrency(clientTotal.total_outstanding)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(clientTotal.po_balance)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(clientTotal.budget_balance)}</td>
                    </tr>
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
