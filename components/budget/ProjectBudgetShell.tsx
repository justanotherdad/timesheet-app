'use client'

import { useState } from 'react'
import { ArrowLeft, PowerOff } from 'lucide-react'

interface ProjectBudgetShellProps {
  po: any
  sites?: Array<{ id: string; name?: string }>
  onBack: () => void
}

export default function ProjectBudgetShell({ po, sites = [], onBack }: ProjectBudgetShellProps) {
  const [deactivating, setDeactivating] = useState(false)
  const isActive = po.active !== false

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to budget list
        </button>
        <button
          type="button"
          onClick={async () => {
            if (isActive) {
              if (!confirm('Deactivate this project? Its systems, deliverables, and activities will no longer appear in timesheet dropdowns.')) return
              setDeactivating(true)
              try {
                const res = await fetch(`/api/budget/${po.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) })
                if (res.ok) window.location.reload()
              } finally {
                setDeactivating(false)
              }
            } else {
              setDeactivating(true)
              try {
                const res = await fetch(`/api/budget/${po.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: true }) })
                if (res.ok) window.location.reload()
              } finally {
                setDeactivating(false)
              }
            }
          }}
          disabled={deactivating}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
        >
          <PowerOff className="h-4 w-4" />
          {deactivating ? '…' : isActive ? 'Deactivate project' : 'Reactivate project'}
        </button>
      </div>
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
          Project Budget View (Coming Soon)
        </h2>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          The project budget view will include individual systems, deliverables, and activities with
          budgeted hours compared to actual hours billed per activity. This is under development.
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          PO: {po.po_number} — {po.sites?.name || (po.site_id && sites.find((s) => s.id === po.site_id)?.name) || 'Unknown client'}
          {!isActive && <span className="ml-2 text-amber-600 dark:text-amber-400">(Inactive)</span>}
        </p>
      </div>
    </div>
  )
}
