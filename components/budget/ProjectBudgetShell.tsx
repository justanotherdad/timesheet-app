'use client'

import { ArrowLeft } from 'lucide-react'

interface ProjectBudgetShellProps {
  po: any
  onBack: () => void
}

export default function ProjectBudgetShell({ po, onBack }: ProjectBudgetShellProps) {
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to budget list
      </button>
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
          Project Budget View (Coming Soon)
        </h2>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          The project budget view will include individual systems, deliverables, and activities with
          budgeted hours compared to actual hours billed per activity. This is under development.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          PO: {po.po_number} — {po.sites?.name || 'Unknown client'}
        </p>
      </div>
    </div>
  )
}
