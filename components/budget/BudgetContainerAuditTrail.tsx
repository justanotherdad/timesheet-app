'use client'

import { formatDateTimeInEastern } from '@/lib/utils'

export interface ContainerAuditRow {
  id: string
  actor_name: string | null
  created_at: string
  description: string
}

interface BudgetContainerAuditTrailProps {
  entries: ContainerAuditRow[]
}

export default function BudgetContainerAuditTrail({ entries }: BudgetContainerAuditTrailProps) {
  if (!entries.length) return null

  return (
    <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        Recent changes
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="text-left py-1.5 pr-3 font-medium whitespace-nowrap">User</th>
              <th className="text-left py-1.5 pr-3 font-medium whitespace-nowrap">Date</th>
              <th className="text-left py-1.5 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 whitespace-nowrap align-top">
                  {entry.actor_name?.trim() || 'Unknown'}
                </td>
                <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400 whitespace-nowrap align-top">
                  {formatDateTimeInEastern(entry.created_at)}
                </td>
                <td className="py-1.5 text-gray-700 dark:text-gray-300 align-top">{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
