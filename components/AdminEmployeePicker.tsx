'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export type EmployeeOption = { id: string; name: string }

export default function AdminEmployeePicker({
  employees,
  selectedId,
}: {
  employees: EmployeeOption[]
  selectedId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
      <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
        Create timesheet for
      </label>
      <select
        value={selectedId}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString())
          params.set('forUser', e.target.value)
          router.push(`/dashboard/timesheets/new?${params.toString()}`)
        }}
        className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
      >
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
        The timesheet is owned by this employee and routes through their normal approval chain.
      </p>
    </div>
  )
}
