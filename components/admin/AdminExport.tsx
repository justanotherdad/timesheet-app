'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { formatWeekEnding } from '@/lib/utils'

interface AdminExportProps {
  timesheets: any[]
}

export default function AdminExport({ timesheets }: AdminExportProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([])

  // Get unique week endings
  const weekEndings = Array.from(
    new Set(timesheets.map(ts => ts.week_ending))
  ).sort().reverse()

  // Filter timesheets by selected week
  const filteredTimesheets = selectedWeek
    ? timesheets.filter(ts => ts.week_ending === selectedWeek)
    : timesheets

  const handleExport = () => {
    const toExport = selectedTimesheets.length > 0
      ? timesheets.filter(ts => selectedTimesheets.includes(ts.id))
      : filteredTimesheets

    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }

    // Create CSV content
    const headers = ['Week Ending', 'Employee', 'Email', 'Site', 'PO', 'Hours', 'Status']
    const rows = toExport.map(ts => [
      formatWeekEnding(ts.week_ending),
      ts.user_profiles?.name || '',
      ts.user_profiles?.email || '',
      ts.sites?.name || '',
      ts.purchase_orders?.po_number || '',
      ts.hours,
      ts.status,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheets-${selectedWeek || 'all'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Week Ending
          </label>
          <select
            value={selectedWeek}
            onChange={(e) => {
              setSelectedWeek(e.target.value)
              setSelectedTimesheets([])
            }}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Weeks</option>
            {weekEndings.map(we => (
              <option key={we} value={we}>
                {formatWeekEnding(we)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleExport}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export {selectedTimesheets.length > 0 ? `${selectedTimesheets.length} Selected` : 'All'} Timesheets
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                <input
                  type="checkbox"
                  checked={selectedTimesheets.length === filteredTimesheets.length && filteredTimesheets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTimesheets(filteredTimesheets.map(ts => ts.id))
                    } else {
                      setSelectedTimesheets([])
                    }
                  }}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Week Ending</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTimesheets.map((ts) => (
              <tr key={ts.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedTimesheets.includes(ts.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTimesheets([...selectedTimesheets, ts.id])
                      } else {
                        setSelectedTimesheets(selectedTimesheets.filter(id => id !== ts.id))
                      }
                    }}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatWeekEnding(ts.week_ending)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.user_profiles?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.sites?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.purchase_orders?.po_number || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.hours}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                  {ts.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

