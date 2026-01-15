'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Download, Filter } from 'lucide-react'
import { formatDateForInput, getWeekDates, formatDateForInput as formatInput } from '@/lib/utils'
import { parseISO, format, addDays } from 'date-fns'

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
  purchase_orders?: { po_number: string }
  sites?: { name: string }
}

// Expanded entry for display (one row per day with hours)
interface ExpandedEntry {
  id: string
  entry_id: string
  timesheet_id: string
  date: string
  day: string
  hours: number
  user_name: string
  user_email: string
  site_name: string
  po_number: string
  task_description: string
  system_name: string
  activity_name: string
  deliverable_name: string
  status: string
  week_ending: string
}

interface DataViewManagerProps {
  users: User[]
  sites: Site[]
  departments: Department[]
}

export default function DataViewManager({ users, sites, departments }: DataViewManagerProps) {
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [expandedEntries, setExpandedEntries] = useState<ExpandedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const filteredDepartments = selectedSite
    ? departments.filter(d => d.site_id === selectedSite)
    : departments

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // First, get weekly_timesheets with filters
      let timesheetQuery = supabase
        .from('weekly_timesheets')
        .select(`
          id,
          user_id,
          week_ending,
          status,
          user_profiles!user_id (
            name,
            email
          )
        `)

      // Apply filters on timesheets
      if (selectedUser) {
        timesheetQuery = timesheetQuery.eq('user_id', selectedUser)
      }

      if (status) {
        timesheetQuery = timesheetQuery.eq('status', status)
      }

      if (startDate) {
        timesheetQuery = timesheetQuery.gte('week_ending', startDate)
      }

      if (endDate) {
        timesheetQuery = timesheetQuery.lte('week_ending', endDate)
      }

      const { data: timesheets, error: timesheetError } = await timesheetQuery

      if (timesheetError) throw timesheetError

      if (!timesheets || timesheets.length === 0) {
        setEntries([])
        setLoading(false)
        return
      }

      // Get timesheet IDs
      const timesheetIds = timesheets.map(t => t.id)

      // Now get entries for these timesheets
      let entriesQuery = supabase
        .from('timesheet_entries')
        .select(`
          *,
          systems (name),
          activities (name),
          deliverables (name),
          purchase_orders (po_number)
        `)
        .in('timesheet_id', timesheetIds)

      const { data: entriesData, error: entriesError } = await entriesQuery

      if (entriesError) throw entriesError

      // Combine entries with timesheet data
      const combinedEntries = (entriesData || []).map((entry: any) => {
        const timesheet = timesheets.find((t: any) => t.id === entry.timesheet_id)
        return {
          ...entry,
          weekly_timesheets: timesheet ? {
            user_id: timesheet.user_id,
            week_ending: timesheet.week_ending,
            status: timesheet.status,
            user_profiles: timesheet.user_profiles
          } : null
        }
      }) as TimesheetEntry[]

      // Expand entries into daily rows (one row per day with hours > 0)
      const expanded: ExpandedEntry[] = []
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      const dayFields = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const

      combinedEntries.forEach((entry) => {
        if (!entry.weekly_timesheets) return

        const weekEnding = parseISO(entry.weekly_timesheets.week_ending)
        const weekDates = getWeekDates(weekEnding, 1) // Assuming week starts on Monday

        dayFields.forEach((dayField, dayIndex) => {
          const hours = entry[dayField] || 0
          if (hours > 0) {
            const dayDate = weekDates.days[dayIndex]
            const systemName = entry.system_name || entry.systems?.name || 'N/A'
            const activityName = entry.activities?.name || 'N/A'
            const deliverableName = entry.deliverables?.name || 'N/A'
            // Find site name from sites array
            const siteName = entry.client_project_id 
              ? sites.find(s => s.id === entry.client_project_id)?.name || 'N/A'
              : 'N/A'
            const poNumber = entry.purchase_orders?.po_number || 'N/A'

            expanded.push({
              id: `${entry.id}-${dayIndex}`,
              entry_id: entry.id,
              timesheet_id: entry.timesheet_id,
              date: formatInput(dayDate),
              day: dayNames[dayIndex],
              hours: hours,
              user_name: entry.weekly_timesheets?.user_profiles?.name || 'N/A',
              user_email: entry.weekly_timesheets?.user_profiles?.email || 'N/A',
              site_name: siteName,
              po_number: poNumber,
              task_description: entry.task_description || 'N/A',
              system_name: systemName,
              activity_name: activityName,
              deliverable_name: deliverableName,
              status: entry.weekly_timesheets?.status || 'N/A',
              week_ending: entry.weekly_timesheets?.week_ending || ''
            })
          }
        })
      })

      // Filter expanded entries by date range if specified
      let filteredExpanded = expanded
      if (startDate) {
        filteredExpanded = filteredExpanded.filter(e => e.date >= startDate)
      }
      if (endDate) {
        filteredExpanded = filteredExpanded.filter(e => e.date <= endDate)
      }

      // Filter by site if specified
      if (selectedSite) {
        filteredExpanded = filteredExpanded.filter(e => {
          const entry = combinedEntries.find(ent => ent.id === e.entry_id)
          return entry?.client_project_id === selectedSite
        })
      }

      // Sort by date descending
      filteredExpanded.sort((a, b) => {
        const dateA = parseISO(a.date)
        const dateB = parseISO(b.date)
        return dateB.getTime() - dateA.getTime()
      })

      setEntries(combinedEntries)
      setExpandedEntries(filteredExpanded)
    } catch (err: any) {
      setError(err.message || 'Failed to load timesheet data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedUser, startDate, endDate, status, selectedSite])

  const handleExport = () => {
    if (expandedEntries.length === 0) {
      setError('No data to export')
      return
    }

    const csv = [
      ['Week Ending', 'Date', 'Day', 'User', 'Email', 'Site', 'PO', 'Task Description', 'System', 'Activity', 'Deliverable', 'Hours', 'Status'].join(','),
      ...expandedEntries.map(entry => [
        entry.week_ending,
        entry.date,
        entry.day,
        entry.user_name,
        entry.user_email,
        entry.site_name,
        entry.po_number,
        `"${entry.task_description.replace(/"/g, '""')}"`, // Escape quotes in CSV
        entry.system_name,
        entry.activity_name,
        entry.deliverable_name,
        entry.hours,
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Timesheet Data View</h2>
        <button
          onClick={handleExport}
          disabled={expandedEntries.length === 0}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
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
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 dark:disabled:bg-gray-700"
          >
            <option value="">All Departments</option>
            {filteredDepartments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>

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

      {/* Results */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-300">Loading...</div>
        ) : expandedEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-300">No timesheet entries found</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Week Ending</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Day</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Site</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Task Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">System</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Deliverable</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {expandedEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {format(parseISO(entry.week_ending), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {format(parseISO(entry.date), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{entry.day}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {entry.user_name}
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
