'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { format, endOfWeek, subWeeks } from 'date-fns'
import { Filter } from 'lucide-react'

interface TimesheetFiltersProps {
  users: { id: string; name: string }[]
}

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function TimesheetFilters({ users }: TimesheetFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filterUser = searchParams.get('user') || ''
  const filterWeekEnding = searchParams.get('weekEnding') || ''
  const filterStatus = searchParams.get('status') || ''

  const buildUrl = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    return `/dashboard/timesheets?${params.toString()}`
  }

  const handleChange = (key: string, value: string) => {
    router.push(buildUrl({ [key]: value }))
  }

  // Generate last 52 week endings (YYYY-MM-DD)
  const weekEndingOptions: { value: string; label: string }[] = [
    { value: '', label: 'All' },
  ]
  let current = endOfWeek(new Date(), { weekStartsOn: 1 })
  for (let i = 0; i < 52; i++) {
    const dateStr = format(current, 'yyyy-MM-dd')
    weekEndingOptions.push({
      value: dateStr,
      label: format(current, 'MMM d, yyyy'),
    })
    current = subWeeks(current, 1)
  }

  const hasActiveFilters = filterUser || filterWeekEnding || filterStatus

  const clearFilters = () => {
    router.push('/dashboard/timesheets')
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6 border border-gray-200 dark:border-gray-600">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <Filter className="h-5 w-5" />
          <span className="font-medium text-sm">Filter</span>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Person:</span>
          <select
            value={filterUser}
            onChange={(e) => handleChange('user', e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[160px]"
          >
            <option value="">All</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Week ending:</span>
          <select
            value={filterWeekEnding}
            onChange={(e) => handleChange('weekEnding', e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[140px]"
          >
            {weekEndingOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => handleChange('status', e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1.5 text-sm min-w-[120px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
