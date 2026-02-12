'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import SystemInput from './SystemInput'
import DeleteTimesheetButton from './DeleteTimesheetButton'
import { getWeekDates, formatDate, formatDateShort, formatDateForInput } from '@/lib/utils'
import { format } from 'date-fns'
import { Plus, Trash2, Edit2, X } from 'lucide-react'

interface WeeklyTimesheetFormProps {
  sites: Array<{ id: string; name: string; code?: string }>
  purchaseOrders: Array<{ id: string; po_number: string; description?: string }>
  systems?: Array<{ id: string; name: string; code?: string }>
  deliverables?: Array<{ id: string; name: string; code?: string }>
  activities?: Array<{ id: string; name: string; code?: string }>
  defaultWeekEnding: string
  userId: string
  timesheetId?: string
  timesheetStatus?: string
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
  defaultWeekEnding,
  userId,
  timesheetId,
  timesheetStatus = 'draft',
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

  const [unbillableEntries, setUnbillableEntries] = useState<UnbillableEntry[]>(
    initialData?.unbillable || [
      { description: 'HOLIDAY', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'INTERNAL', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'PTO', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
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
    
    const updated = [...billableEntries]
    updated[editingIndex] = editingEntry
    setBillableEntries(updated)
    handleCloseModal()
  }

  const handleAddEntry = () => {
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
    setBillableEntries([...billableEntries, newEntry])
    setEditingIndex(billableEntries.length)
    setEditingEntry(newEntry)
  }

  const handleRemoveEntry = (index: number) => {
    setBillableEntries(billableEntries.filter((_, i) => i !== index))
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
        // Check if timesheet already exists for this week
        const { data: existingTimesheet } = await supabase
          .from('weekly_timesheets')
          .select('id')
          .eq('user_id', userId)
          .eq('week_ending', weekEnding)
          .single()

        if (existingTimesheet) {
          currentTimesheetId = existingTimesheet.id
          const updateData: any = {
            week_ending: weekEnding,
            week_starting: formatDateForInput(weekDates.start),
            updated_at: new Date().toISOString(),
            status: newStatus,
          }

          if (shouldSubmit) {
            updateData.submitted_at = new Date().toISOString()
            updateData.employee_signed_at = new Date().toISOString()
          }

          const { error: updateError } = await supabase
            .from('weekly_timesheets')
            .update(updateData)
            .eq('id', currentTimesheetId)

          if (updateError) throw updateError

          await supabase.from('timesheet_entries').delete().eq('timesheet_id', currentTimesheetId)
          await supabase.from('timesheet_unbillable').delete().eq('timesheet_id', currentTimesheetId)
        } else {
          const insertData: any = {
            user_id: userId,
            week_ending: weekEnding,
            week_starting: formatDateForInput(weekDates.start),
            status: newStatus,
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
            if (createError.code === '23505' || createError.message.includes('duplicate key')) {
              const { data: existing } = await supabase
                .from('weekly_timesheets')
                .select('id')
                .eq('user_id', userId)
                .eq('week_ending', weekEnding)
                .single()
              
              if (existing) {
                currentTimesheetId = existing.id
                await supabase.from('timesheet_entries').delete().eq('timesheet_id', currentTimesheetId)
                await supabase.from('timesheet_unbillable').delete().eq('timesheet_id', currentTimesheetId)
              } else {
                throw createError
              }
            } else {
              throw createError
            }
          } else if (!newTimesheet) {
            throw new Error('Failed to create timesheet')
          } else {
            currentTimesheetId = newTimesheet.id
          }
        }
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

      // After Submit for Approval, go to list. After Save Draft, stay on edit page so user can submit without going back.
      if (shouldSubmit) {
        window.location.href = '/dashboard/timesheets'
      } else {
        window.location.href = `/dashboard/timesheets/${currentTimesheetId}/edit`
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

  const poOptions = purchaseOrders.map(po => ({
    id: po.id,
    name: po.po_number,
    code: po.description,
  }))

  const systemOptions = systems.map(s => ({
    id: s.id,
    name: s.name,
    code: s.code,
  }))

  const deliverableOptions = deliverables.map(d => ({
    id: d.id,
    name: d.name,
    code: d.code,
  }))

  const activityOptions = activities.map(a => ({
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
            {previousWeekData && ((previousWeekData.entries?.length ?? 0) > 0 || (previousWeekData.unbillable?.length ?? 0) > 0) && (
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
                This will copy all billable and unbillable entries from the previous week. You can edit them after copying.
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
                        ...e,
                        id: undefined, // Remove ID so it's treated as new entry
                      })))
                    }
                    if (previousWeekData.unbillable) {
                      setUnbillableEntries(previousWeekData.unbillable.map((e: any) => ({
                        ...e,
                        id: undefined, // Remove ID so it's treated as new entry
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
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100 w-12"></th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Client / Project #</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">PO#</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Task Description</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">System</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Deliverable</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Activity</th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Total</th>
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
                        {(entry[`${day}_hours`] || 0).toFixed(2)}
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center font-medium text-sm text-gray-900 dark:text-gray-100">
                      {calculateTotal(entry).toFixed(2)}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entryIdx)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
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
                      {getBillableSubtotal(day).toFixed(2)}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                    {billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleAddEntry}
            className="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </button>
        </div>

        {/* Unbillable Time Section - Unchanged */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Unbillable Time</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Description</th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {unbillableEntries.map((entry, entryIdx) => (
                  <tr key={entryIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{entry.description}</td>
                    {days.map((day) => (
                      <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="24"
                          value={entry[`${day}_hours`] || ''}
                          onChange={(e) => updateUnbillableEntry(entryIdx, day, parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                        />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center font-medium text-gray-900 dark:text-gray-100">
                      {calculateTotal(entry).toFixed(2)}
                    </td>
                  </tr>
                ))}
                
                {/* Sub Totals Row */}
                <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-gray-900 dark:text-gray-100">
                      {getUnbillableSubtotal(day).toFixed(2)}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                    {unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Grand Total */}
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">GRAND TOTAL</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{getGrandTotal().toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading || (currentStatus !== 'draft' && currentStatus !== 'rejected')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : timesheetId ? 'Save Draft' : 'Save Timesheet'}
          </button>
          {currentStatus === 'draft' && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full mx-4 min-w-[44rem] max-w-[min(56rem,95vw)] min-h-[28rem] max-h-[90vh] overflow-auto resize"
            style={{ width: 'min(52rem, 92vw)' }}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Client
                  </label>
                  <SearchableSelect
                    options={sites}
                    value={editingEntry.client_project_id || null}
                    onChange={(value) => setEditingEntry({ ...editingEntry, client_project_id: value || undefined })}
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
                    onChange={(value) => setEditingEntry({ ...editingEntry, po_id: value || undefined })}
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
              <div className="grid grid-cols-3 gap-4">
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
                <div className="grid grid-cols-7 gap-2">
                  {days.map((day, idx) => (
                    <div key={day}>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {format(weekDates.days[idx], 'EEE').toUpperCase().slice(0, 2)}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="24"
                        value={editingEntry[`${day}_hours`] || ''}
                        onChange={(e) => setEditingEntry({ ...editingEntry, [`${day}_hours`]: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
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
