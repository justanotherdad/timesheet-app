'use client'

import { useState } from 'react'
import { Receipt, BarChart3 } from 'lucide-react'
import OutstandingInvoicesReport from './OutstandingInvoicesReport'
import POStatusReport from './POStatusReport'

type ReportType = 'outstanding-invoices' | 'po-status' | null

export default function ReportsPageClient() {
  const [activeReport, setActiveReport] = useState<ReportType>(null)

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="print:hidden">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Select a Report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <button
          type="button"
          onClick={() => setActiveReport(activeReport === 'outstanding-invoices' ? null : 'outstanding-invoices')}
          className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
            activeReport === 'outstanding-invoices'
              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300 dark:hover:border-orange-700'
          }`}
        >
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <Receipt className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Outstanding Invoices</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Invoices without payment received, organized by client</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveReport(activeReport === 'po-status' ? null : 'po-status')}
          className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors text-left ${
            activeReport === 'po-status'
              ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300 dark:hover:border-orange-700'
          }`}
        >
          <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
            <BarChart3 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">PO Status</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Full PO status by client with totals and filters</p>
          </div>
        </button>
        </div>
      </div>

      {activeReport === 'outstanding-invoices' && <OutstandingInvoicesReport />}
      {activeReport === 'po-status' && <POStatusReport />}
    </div>
  )
}
