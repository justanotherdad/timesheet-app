'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Printer } from 'lucide-react'

interface OutstandingRow {
  po_id: string
  client: string
  site_id: string
  po_number: string
  project_name: string
  original_po_amount: number
  current_po_balance: number
  current_budget_balance: number
}

function formatCurrency(val: number): string {
  return `$${(val ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function OutstandingInvoicesReport() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [error, setError] = useState<string | null>(null)

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
    return () => { cancelled = true }
  }, [])

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

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden report-print-container">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">All Outstanding Invoices</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            POs with at least one invoice without a Payment Received date, organized by client
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="print:hidden flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
          title="Print or save as PDF"
        >
          <Printer className="h-5 w-5" />
          Print / Export to PDF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Client</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">PO #</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Project Name</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Original PO Amount (incl. COs)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Current PO Balance</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase">Current Budget Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No outstanding invoices found
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.po_id}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.client}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    <Link href={`/dashboard/budget?poId=${row.po_id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      {row.po_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{row.project_name}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.original_po_amount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.current_po_balance)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(row.current_budget_balance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
