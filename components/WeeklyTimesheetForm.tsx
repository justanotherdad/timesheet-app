'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import SystemInput from './SystemInput'
import DeleteTimesheetButton from './DeleteTimesheetButton'
import { getWeekDates, formatDate, formatDateShort, formatDateForInput, formatHours } from '@/lib/utils'
import { format } from 'date-fns'
import { Plus, Trash2, Edit2, X } from 'lucide-react'

interface WeeklyTimesheetFormProps {
  sites: Array<{ id: string; name: string; code?: string }>
  purchaseOrders: Array<{ id: string; po_number: string; description?: string; site_id?: string; department_id?: string }>
  systems?: Array<{ id: string; name: string; code?: string; site_id?: string }>
  deliverables?: Array<{ id: string; name: string; code?: string; site_id?: string }>
  activities?: Array<{ id: string; name: string; code?: string; site_id?: string }>
  deliverablePOIds?: Record<string, string[]>
  deliverableDepartmentIds?: Record<string, string[]>
  activityPOIds?: Record<string, string[]>
  defaultWeekEnding: string
  userId: string
  timesheetId?: string
  timesheetStatus?: string
  rejectionReason?: string
  timesheetNotes?: string
  previousWeekData?: {
    entries?: Array<{
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
    }>
    unbillable?: Array<{
      description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
      notes?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
  }
  initialData?: {
    entries?: Array<{
      id?: string
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
    }>
    unbillable?: Array<{
      id?: string
      description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
      notes?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
  }
}

interface BillableEntry {
  id?: string
  client_project_id?: string
  po_id?: string
  task_description: string
  system_id?: string
  system_name?: string // Custom system name (not saved to DB, stored in entry)
  deliverable_id?: string
  activity_id?: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
}

interface UnbillableEntry {
  id?: string
  description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
  /** Free-text detail shown to the right of the type label */
  notes?: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
}

export default function WeeklyTimesheetForm({
  sites,
  purchaseOrders,
  systems = [],
  deliverables = [],
  activities = [],
  deliverablePOIds = {},
  deliverableDepartmentIds = {},
  activityPOIds = {},
  defaultWeekEnding,
  userId,
  timesheetId,
  timesheetStatus = 'draft',
  rejectionReason,
  timesheetNotes: initialTimesheetNotes = '',
  initialData,
  previousWeekData,
}: WeeklyTimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [weekEnding, setWeekEnding] = useState<string>(defaultWeekEnding)
  const [currentStatus, setCurrentStatus] = useState<string>(timesheetStatus)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<BillableEntry | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  const weekDates = getWeekDates(weekEnding)
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

  const [billableEntries, setBillableEntries] = useState<BillableEntry[]>(
    initialData?.entries || []
  )

  const [timesheetNotes, setTimesheetNotes] = useState<string>(initialTimesheetNotes)

  const [unbillableEntries, setUnbillableEntries] = useState<UnbillableEntry[]>(
    initialData?.unbillable || [
      { description: 'HOLIDAY', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'INTERNAL', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'PTO', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
    ]
  )

  // Modal closing is now handled by onMouseDown on the backdrop
  // This prevents closing when selecting text inside the modal

  const calculateTotal = (entry: BillableEntry | UnbillableEntry): number => {
    return entry.mon_hours + entry.tue_hours + entry.wed_hours + entry.thu_hours + 
           entry.fri_hours + entry.sat_hours + entry.sun_hours
  }

  const getBillableSubtotal = (day: typeof days[number]): number => {
    return billableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
  }

  const getUnbillableSubtotal = (day: typeof days[number]): number => {
    return unbillableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
  }

  const getGrandTotal = (): number => {
    const billableTotal = billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0)
    const unbillableTotal = unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0)
    return billableTotal + unbillableTotal
  }

  const getClientName = (clientId?: string): string => {
    if (!clientId) return ''
    const client = sites.find(s => s.id === clientId)
    return client ? `${client.name}${client.code ? ` (${client.code})` : ''}` : ''
  }

  const getPOName = (poId?: string): string => {
    if (!poId) return ''
    const po = purchaseOrders.find(p => p.id === poId)
    return po ? `${po.po_number}${po.description ? ` - ${po.description}` : ''}` : ''
  }

  const getSystemName = (entry: BillableEntry): string => {
    // Check for custom system name first
    if (entry.system_name) return entry.system_name
    // Then check for system_id
    if (entry.system_id) {
      const system = systems.find(s => s.id === entry.system_id)
      return system ? system.name : ''
    }
    return ''
  }

  const getDeliverableName = (deliverableId?: string): string => {
    if (!deliverableId) return ''
    const deliverable = deliverables.find(d => d.id === deliverableId)
    return deliverable ? deliverable.name : ''
  }

  const getActivityName = (activityId?: string): string => {
    if (!activityId) return ''
    const activity = activities.find(a => a.id === activityId)
    return activity ? activity.name : ''
  }

  const handleOpenEditModal = (index: number) => {
    setEditingIndex(index)
    setEditingEntry({ ...billableEntries[index] })
  }

  const handleCloseModal = () => {
    setEditingIndex(null)
    setEditingEntry(null)
  }

  const handleSaveEntry = () => {
    if (editingIndex === null || !editingEntry) return
    // If adding new row (editingIndex === length), append; otherwise update existing
    const updated = [...billableEntries]
    if (editingIndex >= updated.length) {
      updated.push(editingEntry)
    } else {
      updated[editingIndex] = editingEntry
    }
    setBillableEntries(updated)
    handleCloseModal()
  }

  const handleAddEntry = () => {
    // Open modal with new entry in memory only; row is added to timesheet only when user clicks Save
    const newEntry: BillableEntry = {
      task_description: '',
      system_name: undefined,
      mon_hours: 0,
      tue_hours: 0,
      wed_hours: 0,
      thu_hours: 0,
      fri_hours: 0,
      sat_hours: 0,
      sun_hours: 0
    }
    setEditingIndex(billableEntries.length)
    setEditingEntry(newEntry)
  }

  const handleRemoveEntry = (index: number) => {
    if (window.confirm('Delete this row?')) {
      setBillableEntries(billableEntries.filter((_, i) => i !== index))
    }
  }

  const saveTimesheet = async (shouldSubmit: boolean = false) => {
    setError(null)
    setLoading(true)

    try {
      let currentTimesheetId = timesheetId
      const newStatus = shouldSubmit ? 'submitted' : 'draft'

      if (currentTimesheetId) {
        // Update existing timesheet
        const updateData: any = {
          week_ending: weekEnding,
          week_starting: formatDateForInput(weekDates.start),
          notes: timesheetNotes.trim() || null,
          updated_at: new Date().toISOString(),
        }

        if (shouldSubmit && currentStatus === 'draft') {
          updateData.status = 'submitted'
          updateData.submitted_at = new Date().toISOString()
          updateData.employee_signed_at = new Date().toISOString()
        } else if (shouldSubmit && currentStatus === 'rejected') {
          // Resubmitting after rejection: clear approval signatures so workflow restarts
          await supabase.from('timesheet_signatures').delete().eq('timesheet_id', currentTimesheetId)
          updateData.status = 'submitted'
          updateData.submitted_at = new Date().toISOString()
          updateData.employee_signed_at = new Date().toISOString()
        } else if (!shouldSubmit) {
          updateData.status = 'draft'
        }

        const { error: updateError } = await supabase
          .from('weekly_timesheets')
          .update(updateData)
          .eq('id', currentTimesheetId)

        if (updateError) throw updateError

        // Delete existing entries
        await supabase.from('timesheet_entries').delete().eq('timesheet_id', currentTimesheetId)
        await supabase.from('timesheet_unbillable').delete().eq('timesheet_id', currentTimesheetId)
      } else {
        // Always create a new timesheet (allow multiple per week per user)
        const insertData: any = {
          user_id: userId,
          week_ending: weekEnding,
          week_starting: formatDateForInput(weekDates.start),
          status: newStatus,
          notes: timesheetNotes.trim() || null,
        }

        if (shouldSubmit) {
          insertData.submitted_at = new Date().toISOString()
          insertData.employee_signed_at = new Date().toISOString()
        }

        const { data: newTimesheet, error: createError } = await supabase
          .from('weekly_timesheets')
          .insert(insertData)
          .select()
          .single()

        if (createError) {
          throw createError
        }
        if (!newTimesheet) {
          throw new Error('Failed to create timesheet')
        }
        currentTimesheetId = newTimesheet.id
      }

      // Insert billable entries
      const entriesToInsert = billableEntries
        .filter(e => e.task_description.trim() || calculateTotal(e) > 0)
        .map(e => ({
          timesheet_id: currentTimesheetId!,
          client_project_id: e.client_project_id || null,
          po_id: e.po_id || null,
          task_description: e.task_description,
          system_id: e.system_id || null, // Only set if from dropdown, null if custom
          system_name: e.system_name || null, // Custom system name (not in systems table)
          deliverable_id: e.deliverable_id || null,
          activity_id: e.activity_id || null,
          mon_hours: e.mon_hours || 0,
          tue_hours: e.tue_hours || 0,
          wed_hours: e.wed_hours || 0,
          thu_hours: e.thu_hours || 0,
          fri_hours: e.fri_hours || 0,
          sat_hours: e.sat_hours || 0,
          sun_hours: e.sun_hours || 0,
        }))

      if (entriesToInsert.length > 0) {
        const { error: entriesError } = await supabase
          .from('timesheet_entries')
          .insert(entriesToInsert)

        if (entriesError) throw entriesError
      }

      // Insert/update unbillable entries
      const unbillableToInsert = unbillableEntries.map(e => ({
        timesheet_id: currentTimesheetId!,
        description: e.description,
        notes: (e.notes && e.notes.trim()) ? e.notes.trim() : null,
        mon_hours: e.mon_hours || 0,
        tue_hours: e.tue_hours || 0,
        wed_hours: e.wed_hours || 0,
        thu_hours: e.thu_hours || 0,
        fri_hours: e.fri_hours || 0,
        sat_hours: e.sat_hours || 0,
        sun_hours: e.sun_hours || 0,
      }))

      const { error: unbillableError } = await supabase
        .from('timesheet_unbillable')
        .insert(unbillableToInsert)

      if (unbillableError) throw unbillableError

      // After Submit for Approval: check if final approver (no one above) → auto-approve, then go to list
      if (shouldSubmit) {
        await fetch(`/api/timesheets/${currentTimesheetId}/check-auto-approve`, { method: 'POST' })
        router.refresh()
        router.push('/dashboard/timesheets')
      } else {
        router.refresh()
        router.push(`/dashboard/timesheets/${currentTimesheetId}/edit`)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveTimesheet(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveTimesheet(true)
  }

  const updateUnbillableEntry = (index: number, day: typeof days[number], value: number) => {
    const updated = [...unbillableEntries]
    updated[index] = { ...updated[index], [`${day}_hours`]: value }
    setUnbillableEntries(updated)
  }

  const updateUnbillableNotes = (index: number, value: string) => {
    const updated = [...unbillableEntries]
    updated[index] = { ...updated[index], notes: value }
    setUnbillableEntries(updated)
  }

  // Filter POs by selected client (site) - when client is selected, only show POs assigned to that client
  const poOptions = (editingEntry?.client_project_id
    ? purchaseOrders.filter(po => po.site_id === editingEntry.client_project_id)
    : purchaseOrders
  ).map(po => ({
    id: po.id,
    name: po.po_number,
    code: po.description,
  }))

  const systemOptions = systems.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
  }))

  // Filter deliverables by client (site) and PO; deduplicate by id
  // When deliverable has no PO assignments: only show if its department matches the selected PO's department
  const filteredDeliverables = (() => {
    let list = deliverables
    if (editingEntry?.client_project_id) {
      list = list.filter(d => d.site_id === editingEntry.client_project_id)
    }
    if (editingEntry?.po_id) {
      const selectedPO = purchaseOrders.find(p => p.id === editingEntry.po_id)
      const poDepartmentId = selectedPO?.department_id
      list = list.filter(d => {
        const poIds = deliverablePOIds[d.id] || []
        if (poIds.length > 0) {
          return poIds.includes(editingEntry.po_id!)
        }
        // No PO assignments
        const delDeptIds = deliverableDepartmentIds[d.id] || []
        if (delDeptIds.length === 0) return true // N/A department: show for any PO
        if (!poDepartmentId) return false
        return delDeptIds.includes(poDepartmentId)
      })
    }
    return Array.from(new Map(list.map(d => [d.id, d])).values())
  })()

  const deliverableOptions = filteredDeliverables.map(d => ({
    id: d.id,
    name: d.name,
    code: d.code,
  }))

  // Filter activities by client (site) and PO; deduplicate by id
  const filteredActivities = (() => {
    let list = activities
    if (editingEntry?.client_project_id) {
      list = list.filter(a => a.site_id === editingEntry.client_project_id)
    }
    if (editingEntry?.po_id) {
      list = list.filter(a => {
        const poIds = activityPOIds[a.id] || []
        return poIds.length === 0 || poIds.includes(editingEntry.po_id!)
      })
    }
    return Array.from(new Map(list.map(a => [a.id, a])).values())
  })()

  const activityOptions = filteredActivities.map(a => ({
    id: a.id,
    name: a.name,
    code: a.code,
  }))

  return (
    <>
      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {rejectionReason && currentStatus === 'rejected' && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Rejection Note</p>
            <p className="text-red-700 dark:text-red-300 mb-3">{rejectionReason}</p>
            <a
              href={`/dashboard/timesheets/new?week=${weekEnding}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Create new timesheet (start fresh) →
            </a>
          </div>
        )}

        {/* Week Information */}
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
          <div className="mb-3 flex justify-between items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Week Ending Date
              </label>
              <input
                type="date"
                value={weekEnding}
                onChange={(e) => {
                  const newWeekEnding = e.target.value
                  setWeekEnding(newWeekEnding)
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
              />
            </div>
            {previousWeekData && (previousWeekData.entries?.length ?? 0) > 0 && (
              <div className="ml-4">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  Copy Previous Week
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Week Ending:</span> {formatDate(weekDates.end)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Week Starting:</span> {formatDate(weekDates.start)}
          </p>
        </div>

        {/* Copy Previous Week Modal */}
        {showCopyModal && previousWeekData && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setShowCopyModal(false)
              }
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Copy Previous Week Data</h3>
                <button
                  onClick={() => setShowCopyModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                This will copy the structure (client, PO, task description, system, deliverable, activity) from the previous week&apos;s billable entries. Hours will start at zero for you to fill in.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previousWeekData.entries) {
                      setBillableEntries(previousWeekData.entries.map((e: any) => ({
                        client_project_id: e.client_project_id,
                        po_id: e.po_id,
                        task_description: e.task_description,
                        system_id: e.system_id,
                        system_name: e.system_name,
                        deliverable_id: e.deliverable_id,
                        activity_id: e.activity_id,
                        mon_hours: 0,
                        tue_hours: 0,
                        wed_hours: 0,
                        thu_hours: 0,
                        fri_hours: 0,
                        sat_hours: 0,
                        sun_hours: 0,
                      })))
                    }
                    setShowCopyModal(false)
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Copy Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Billable Time Section */}
        <div className="relative">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Time</h2>
          
          <div className="overflow-x-auto">
            {/* table-fixed so <col> widths are respected. Day columns use the same
                w-[3.5rem] as the unbillable table so both grids stay visually consistent. */}
            <table className="min-w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
              <colgroup>
                <col className="w-10" />         {/* edit btn */}
                <col />                           {/* Client — fills remaining space */}
                <col className="w-28" />          {/* PO# */}
                <col />                           {/* Task Description — fills remaining space */}
                <col className="w-24" />          {/* System */}
                <col className="w-24" />          {/* Deliverable */}
                <col className="w-24" />          {/* Activity */}
                {weekDates.days.map((_, idx) => (
                  <col key={idx} className="w-[3.5rem]" />  /* day columns */
                ))}
                <col className="w-[4.5rem]" />   {/* Total */}
                <col className="w-10" />          {/* delete btn */}
              </colgroup>
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Client / Project #</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">PO#</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Task Description</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">System</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Deliverable</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Activity</th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE')}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">Total</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {billableEntries.map((entry, entryIdx) => (
                  <tr key={entryIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(entryIdx)}
                        aria-label={`Edit row ${entryIdx + 1}`}
                        title="Edit row"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {getClientName(entry.client_project_id) || '-'}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {getPOName(entry.po_id) || '-'}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {entry.task_description || '-'}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {getSystemName(entry) || '-'}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {getDeliverableName(entry.deliverable_id) || '-'}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                      {getActivityName(entry.activity_id) || '-'}
                    </td>
                    {days.map((day) => (
                      <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm text-gray-900 dark:text-gray-100">
                        {formatHours(entry[`${day}_hours`])}
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center font-medium text-sm text-gray-900 dark:text-gray-100">
                      {formatHours(calculateTotal(entry))}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entryIdx)}
                        aria-label={`Delete row ${entryIdx + 1}`}
                        title="Delete row"
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                
                {/* Sub Totals Row */}
                <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                  <td colSpan={7} className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-gray-900 dark:text-gray-100">
                      {formatHours(getBillableSubtotal(day))}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                    {formatHours(billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0))}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleAddEntry}
            title="Add a new billable row"
            className="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </button>
        </div>

        {/* Unbillable Time */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Unbillable Time</h2>
          
          <div className="overflow-x-auto">
            {/* table-fixed + w-[3.5rem] day columns matches the billable table above. */}
            <table className="min-w-full w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
              <colgroup>
                <col className="w-[5.5rem]" />
                <col />
                {weekDates.days.map((_, idx) => (
                  <col key={idx} className="w-[3.5rem]" />
                ))}
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    Description
                  </th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0">
                    Notes
                  </th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE')}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {unbillableEntries.map((entry, entryIdx) => (
                  <tr key={entryIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {entry.description}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 min-w-0">
                      <input
                        type="text"
                        value={entry.notes ?? ''}
                        onChange={(e) => updateUnbillableNotes(entryIdx, e.target.value)}
                        placeholder="Optional"
                        className="w-full min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 bg-white dark:bg-gray-700 dark:text-gray-100"
                      />
                    </td>
                    {days.map((day) => (
                      <td key={day} className="border border-gray-300 dark:border-gray-600 px-1 py-2">
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          value={entry[`${day}_hours`] || ''}
                          onChange={(e) => {
                            const parsed = e.target.valueAsNumber
                            updateUnbillableEntry(entryIdx, day, isNaN(parsed) ? entry[`${day}_hours`] : parsed)
                          }}
                          className="w-full max-w-[3.25rem] min-w-[3rem] mx-auto px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                        />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatHours(calculateTotal(entry))}
                    </td>
                  </tr>
                ))}
                
                {/* Sub Totals Row */}
                <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                  <td colSpan={2} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-gray-900 dark:text-gray-100">
                      {formatHours(getUnbillableSubtotal(day))}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {formatHours(unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes Section */}
        <div>
          <label
            htmlFor="timesheet-notes"
            className="block text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2"
          >
            Notes
          </label>
          <textarea
            id="timesheet-notes"
            value={timesheetNotes}
            onChange={(e) => setTimesheetNotes(e.target.value)}
            placeholder="Optional — add any notes or comments for this timesheet"
            rows={3}
            disabled={currentStatus !== 'draft' && currentStatus !== 'rejected'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 resize-y disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Grand Total */}
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">GRAND TOTAL</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatHours(getGrandTotal())}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button
            type="submit"
            disabled={loading || (currentStatus !== 'draft' && currentStatus !== 'rejected')}
            className="min-h-[44px] sm:min-h-0 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : timesheetId ? 'Save Draft' : 'Save Timesheet'}
          </button>
          {(currentStatus === 'draft' || currentStatus === 'rejected') && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="min-h-[44px] sm:min-h-0 bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : currentStatus === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
            </button>
          )}
          {timesheetId && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/timesheets/${timesheetId}`)}
              className="min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              disabled={loading}
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          {timesheetId && currentStatus === 'draft' && (
            <DeleteTimesheetButton
              timesheetId={timesheetId}
              status={currentStatus}
              variant="button"
              onDeleted={() => {
                window.location.href = '/dashboard/timesheets'
              }}
            />
          )}
        </div>
      </form>

      {/* Edit Modal */}
      {editingIndex !== null && editingEntry && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
          onMouseDown={(e) => {
            // Only close if clicking directly on the backdrop, not on selected text
            if (e.target === e.currentTarget) {
              handleCloseModal()
            }
          }}
        >
          <div
            ref={modalRef}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 sm:p-6 min-h-[28rem] max-h-[min(90vh,calc(100vh-2rem))] overflow-auto resize w-[calc(100vw-2rem)] max-w-full min-w-0 mx-auto md:mx-4 md:w-[min(104rem,96vw)] md:min-w-[48rem] md:max-h-[90vh]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingIndex === billableEntries.length ? 'Add Billable Entry' : 'Edit Billable Entry'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Row 1: Client and PO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Client
                  </label>
                  <SearchableSelect
                    options={sites}
                    value={editingEntry.client_project_id || null}
                    onChange={(value) => {
                      const newClientId = value || undefined
                      // When client changes, clear PO if it's not assigned to the new client
                      const poStillValid = !newClientId || !editingEntry.po_id || purchaseOrders.some(po => po.id === editingEntry.po_id && po.site_id === newClientId)
                      // Clear deliverable/activity if they won't be in the filtered list for the new client
                      const delStillValid = !newClientId || !editingEntry.deliverable_id || deliverables.some(d => d.id === editingEntry.deliverable_id && d.site_id === newClientId)
                      const actStillValid = !newClientId || !editingEntry.activity_id || activities.some(a => a.id === editingEntry.activity_id && a.site_id === newClientId)
                      setEditingEntry({
                        ...editingEntry,
                        client_project_id: newClientId,
                        ...(poStillValid ? {} : { po_id: undefined }),
                        ...(delStillValid ? {} : { deliverable_id: undefined }),
                        ...(actStillValid ? {} : { activity_id: undefined }),
                      })
                    }}
                    placeholder="Select Client..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    PO
                  </label>
                  <SearchableSelect
                    options={poOptions}
                    value={editingEntry.po_id || null}
                    onChange={(value) => {
                      const newPOId = value || undefined
                      // When PO changes, clear deliverable/activity if they're not valid for the new PO
                      const delStillValid = !newPOId || !editingEntry.deliverable_id || (() => {
                        const poIds = deliverablePOIds[editingEntry.deliverable_id!] || []
                        if (poIds.length > 0) return poIds.includes(newPOId)
                        const delDeptIds = deliverableDepartmentIds[editingEntry.deliverable_id!] || []
                        if (delDeptIds.length === 0) return true // N/A department: valid for any PO
                        const newPO = purchaseOrders.find(p => p.id === newPOId)
                        if (!newPO?.department_id) return false
                        return delDeptIds.includes(newPO.department_id)
                      })()
                      const actStillValid = !newPOId || !editingEntry.activity_id || (() => {
                        const poIds = activityPOIds[editingEntry.activity_id!] || []
                        return poIds.length === 0 || poIds.includes(newPOId)
                      })()
                      setEditingEntry({
                        ...editingEntry,
                        po_id: newPOId,
                        ...(delStillValid ? {} : { deliverable_id: undefined }),
                        ...(actStillValid ? {} : { activity_id: undefined }),
                      })
                    }}
                    placeholder="Select PO..."
                  />
                </div>
              </div>

              {/* Row 2: Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Task Description
                </label>
                <input
                  type="text"
                  value={editingEntry.task_description}
                  onChange={(e) => setEditingEntry({ ...editingEntry, task_description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="Enter task description..."
                />
              </div>

              {/* Row 3: System, Deliverable, Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    System
                  </label>
                  <SystemInput
                    options={systemOptions}
                    value={editingEntry.system_id || null}
                    customValue={editingEntry.system_name}
                    onChange={(value, customValue) => {
                      if (customValue) {
                        // Custom value - store in system_name, clear system_id
                        setEditingEntry({ ...editingEntry, system_id: undefined, system_name: customValue })
                      } else {
                        // Selected from dropdown - store in system_id, clear system_name
                        setEditingEntry({ ...editingEntry, system_id: value || undefined, system_name: undefined })
                      }
                    }}
                    placeholder="Select or type System..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Deliverable
                  </label>
                  <SearchableSelect
                    options={deliverableOptions}
                    value={editingEntry.deliverable_id || null}
                    onChange={(value) => setEditingEntry({ ...editingEntry, deliverable_id: value || undefined })}
                    placeholder="Select Deliverable..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Activity
                  </label>
                  <SearchableSelect
                    options={activityOptions}
                    value={editingEntry.activity_id || null}
                    onChange={(value) => setEditingEntry({ ...editingEntry, activity_id: value || undefined })}
                    placeholder="Select Activity..."
                  />
                </div>
              </div>

              {/* Row 4: Days of the week */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hours by Day
                </label>
                <div className="grid grid-cols-7 gap-2 items-end">
                  {days.map((day, idx) => (
                    <div key={day} className="flex flex-col min-h-[3.25rem]">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1 shrink-0">
                        {format(weekDates.days[idx], 'EEE')}
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="24"
                        value={editingEntry[`${day}_hours`] || ''}
                        onChange={(e) => {
                          const parsed = e.target.valueAsNumber
                          setEditingEntry({ ...editingEntry, [`${day}_hours`]: isNaN(parsed) ? editingEntry[`${day}_hours`] : parsed })
                        }}
                        className="w-full h-9 min-h-9 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-base focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white box-border"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEntry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
