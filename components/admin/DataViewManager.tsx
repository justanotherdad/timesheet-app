'use client'

import { useState, useEffect, useMemo } from 'react'
import { Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { parseISO, format } from 'date-fns'

interface User {
  id: string
  name: string
  email: string
}

interface Site {
  id: string
  name: string
}

interface Department {
  id: string
  name: string
  site_id: string
}

interface TimesheetEntry {
  id: string
  timesheet_id: string
  client_project_id?: string
  po_id?: string
  task_description: string
  system_id?: string
  system_name?: string
  deliverable_id?: string
  activity_id?: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
  weekly_timesheets?: {
    user_id: string
    week_ending: string
    status: string
    user_profiles?: {
      name: string
      email: string
    }
  }
  systems?: { name: string }
  activities?: { name: string }
  deliverables?: { name: string }
  purchase_orders?: { po_number: string; department_id?: string }
  sites?: { name: string }
}

// Expanded entry for display (one row per timesheet entry with weekly total hours)
interface ExpandedEntry {
  id: string
  entry_id: string
  timesheet_id: string
  user_id?: string
  hours: number
  non_billable_hours?: number
  user_name: string
  user_email?: string
  site_name: string
  po_number: string
  task_description: string
  system_name: string
  activity_name: string
  deliverable_name: string
  status: string
  week_ending: string
}

interface PurchaseOrder {
  id: string
  po_number: string
}

interface DataViewManagerProps {
  users: User[]
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
}

export default function DataViewManager({ users, sites, departments, purchaseOrders }: DataViewManagerProps) {
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [selectedPO, setSelectedPO] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState<string>('week_ending')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [expandedEntries, setExpandedEntries] = useState<ExpandedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredDepartments = selectedSite
    ? departments.filter(d => d.site_id === selectedSite)
    : departments

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (selectedUser) params.set('user', selectedUser)
      if (selectedSite) params.set('site', selectedSite)
      if (selectedDepartment) params.set('department', selectedDepartment)
      if (selectedPO) params.set('po', selectedPO)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (status) params.set('status', status)

      const res = await fetch(`/api/admin/data-view?${params.toString()}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to load data (${res.status})`)
      }

      const { expanded } = await res.json()
      setEntries([])
      setExpandedEntries((expanded || []).map((e: any) => ({
        ...e,
        non_billable_hours: e.non_billable_hours ?? 0
      })))
      setSelectedRowIds(new Set())
    } catch (err: any) {
      setError(err.message || 'Failed to load timesheet data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedUser, startDate, endDate, status, selectedSite, selectedDepartment, selectedPO])

  const sortedEntries = useMemo(() => {
    const sorted = [...expandedEntries]
    const mult = sortDirection === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (sortColumn) {
        case 'week_ending': aVal = a.week_ending; bVal = b.week_ending; break
        case 'user': aVal = a.user_name; bVal = b.user_name; break
        case 'site': aVal = a.site_name; bVal = b.site_name; break
        case 'po': aVal = a.po_number; bVal = b.po_number; break
        case 'task': aVal = a.task_description; bVal = b.task_description; break
        case 'system': aVal = a.system_name; bVal = b.system_name; break
        case 'activity': aVal = a.activity_name; bVal = b.activity_name; break
        case 'deliverable': aVal = a.deliverable_name; bVal = b.deliverable_name; break
        case 'hours': aVal = a.hours; bVal = b.hours; break
        case 'non_billable_hours': aVal = a.non_billable_hours ?? 0; bVal = b.non_billable_hours ?? 0; break
        case 'status': aVal = a.status; bVal = b.status; break
        default: aVal = a.week_ending; bVal = b.week_ending
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') return mult * (aVal - bVal)
      return mult * String(aVal).localeCompare(String(bVal))
    })
    return sorted
  }, [expandedEntries, sortColumn, sortDirection])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const toggleRowSelection = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedRowIds.size === sortedEntries.length) {
      setSelectedRowIds(new Set())
    } else {
      setSelectedRowIds(new Set(sortedEntries.map(e => e.id)))
    }
  }

  const handleExport = () => {
    const toExport = selectedRowIds.size > 0
      ? sortedEntries.filter(e => selectedRowIds.has(e.id))
      : sortedEntries
    if (toExport.length === 0) {
      setError(selectedRowIds.size > 0 ? 'No selected rows to export' : 'No data to export')
      return
    }

    const csv = [
      ['Week Ending', 'User', 'Site', 'PO', 'Task Description', 'System', 'Activity', 'Deliverable', 'Hours', 'Non-Billable Hours', 'Status'].join(','),
      ...toExport.map(entry => [
        entry.week_ending,
        entry.user_name,
        entry.site_name,
        entry.po_number,
        `"${(entry.task_description || '').replace(/"/g, '""')}"`, // Escape quotes in CSV
        entry.system_name,
        entry.activity_name,
        entry.deliverable_name,
        entry.hours,
        entry.non_billable_hours ?? 0,
        entry.status,
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheet_data_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Timesheet Data View</h2>
        <button
          onClick={handleExport}
          disabled={expandedEntries.length === 0}
          className="min-h-[44px] sm:min-h-0 w-full sm:w-auto bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Download className="h-4 w-4 shrink-0" />
          {selectedRowIds.size > 0 ? `Export Selected (${selectedRowIds.size})` : 'Export CSV'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        {/* Date range - stacked, fixed on left for desktop */}
        <div className="flex flex-col gap-4 lg:w-48 lg:shrink-0 lg:border-r lg:border-gray-200 dark:lg:border-gray-600 lg:pr-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            />
          </div>
        </div>

        {/* Other filters */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Users</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site</label>
            <select
              value={selectedSite}
              onChange={(e) => {
                setSelectedSite(e.target.value)
                setSelectedDepartment('')
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Sites</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={!selectedSite}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 dark:disabled:bg-gray-100"
            >
              <option value="">All Departments</option>
              {filteredDepartments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PO</label>
            <select
              value={selectedPO}
              onChange={(e) => setSelectedPO(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All POs</option>
              {purchaseOrders.map(po => (
                <option key={po.id} value={po.id}>{po.po_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results - single scroll container: both scrollbars at viewport edges, sticky header + sticky Select/User */}
      <div className="overflow-x-scroll overflow-y-auto max-h-[calc(100vh-22rem)] min-h-[300px]">
        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-300">Loading...</div>
        ) : expandedEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-300">No timesheet entries found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[72px] bg-gray-50 dark:bg-gray-700 px-4 py-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sortedEntries.length > 0 && selectedRowIds.size === sortedEntries.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Select</span>
                  </label>
                </th>
                <th className="sticky left-[72px] top-0 z-30 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                  <button onClick={() => handleSort('user')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    User <SortIcon col="user" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('week_ending')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Week Ending <SortIcon col="week_ending" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('site')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Site <SortIcon col="site" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('po')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    PO <SortIcon col="po" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('task')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Task Description <SortIcon col="task" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('system')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    System <SortIcon col="system" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('activity')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Activity <SortIcon col="activity" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('deliverable')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Deliverable <SortIcon col="deliverable" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('hours')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Hours <SortIcon col="hours" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('non_billable_hours')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Non-Billable <SortIcon col="non_billable_hours" />
                  </button>
                </th>
                <th className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-6 py-3 text-left">
                  <button onClick={() => handleSort('status')} className="inline-flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hover:text-gray-700 dark:hover:text-gray-200">
                    Status <SortIcon col="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedEntries.map((entry) => (
                <tr key={entry.id} className={selectedRowIds.has(entry.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                  <td className={`sticky left-0 z-20 min-w-[72px] px-4 py-4 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${selectedRowIds.has(entry.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'}`}>
                    <input
                      type="checkbox"
                      checked={selectedRowIds.has(entry.id)}
                      onChange={() => toggleRowSelection(entry.id)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  <td className={`sticky left-[72px] z-20 px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${selectedRowIds.has(entry.id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800'}`}>
                    {entry.user_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {format(parseISO(entry.week_ending), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.site_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.po_number}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{entry.task_description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.system_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.activity_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.deliverable_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{entry.hours}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{entry.non_billable_hours ?? 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">
                    {entry.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {expandedEntries.length > 0 && (
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          Showing {expandedEntries.length} entries
        </div>
      )}
    </div>
  )
}
