'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Printer } from 'lucide-react'

interface POStatusRow {
  client: string
  site_id: string
  po_id: string
  po_number: string
  original_po_amount: number
  original_po_date: string
  cos_display: string
  cos_total: number
  total_invoiced: number
  total_paid: number
  total_outstanding: number
  po_balance: number
  budget_balance: number
}

interface POStatusData {
  rows: POStatusRow[]
  clients: { id: string; name: string }[]
  years: string[]
  purchaseOrders: { id: string; po_number: string; site_id: string }[]
}

function formatCurrency(val: number): string {
  return `$${(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type SortColumn = 'client' | 'po_number' | 'original_po_amount' | 'total_invoiced' | 'total_paid' | 'total_outstanding' | 'po_balance' | 'budget_balance'

export default function POStatusReport() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<POStatusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterPO, setFilterPO] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('client')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterYear) params.set('year', filterYear)
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
  }, [filterYear, filterClient, filterPO])

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
        case 'original_po_amount':
          aVal = a.original_po_amount ?? 0
          bVal = b.original_po_amount ?? 0
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
          <button
            type="button"
            onClick={handlePrint}
            className="print:hidden flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors shrink-0"
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
              {(data?.years || []).map((y) => (
                <option key={y} value={y}>{y}</option>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Original PO (Date)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">COs (Dates)</th>
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
                    original_po_amount: acc.original_po_amount + (r.original_po_amount ?? 0),
                    cos_total: acc.cos_total + (r.cos_total ?? 0),
                    total_invoiced: acc.total_invoiced + (r.total_invoiced ?? 0),
                    total_paid: acc.total_paid + (r.total_paid ?? 0),
                    total_outstanding: acc.total_outstanding + (r.total_outstanding ?? 0),
                    po_balance: acc.po_balance + (r.po_balance ?? 0),
                    budget_balance: acc.budget_balance + (r.budget_balance ?? 0),
                  }),
                  { original_po_amount: 0, cos_total: 0, total_invoiced: 0, total_paid: 0, total_outstanding: 0, po_balance: 0, budget_balance: 0 }
                )
                return (
                  <React.Fragment key={clientName}>
                    {clientRows.map((row) => (
                      <tr key={row.po_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.client}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.po_number}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {formatCurrency(row.original_po_amount)} {row.original_po_date !== '—' ? `(${row.original_po_date})` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={row.cos_display}>
                          {row.cos_display}
                        </td>
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
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">—</td>
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
