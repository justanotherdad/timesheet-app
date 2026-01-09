'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import { getWeekDates, formatDate, formatDateShort, formatDateForInput } from '@/lib/utils'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'

interface WeeklyTimesheetFormProps {
  sites: Array<{ id: string; name: string; code?: string }>
  purchaseOrders: Array<{ id: string; po_number: string; description?: string }>
  defaultWeekEnding: string
  userId: string
  timesheetId?: string
  initialData?: {
    entries?: Array<{
      id?: string
      client_project_id?: string
      po_id?: string
      task_description: string
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
  defaultWeekEnding,
  userId,
  timesheetId,
  initialData,
}: WeeklyTimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [weekEnding, setWeekEnding] = useState<string>(defaultWeekEnding)

  const weekDates = getWeekDates(weekEnding)
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

  const [billableEntries, setBillableEntries] = useState<BillableEntry[]>(
    initialData?.entries || [
      { task_description: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 }
    ]
  )

  const [unbillableEntries, setUnbillableEntries] = useState<UnbillableEntry[]>(
    initialData?.unbillable || [
      { description: 'HOLIDAY', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'INTERNAL', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'PTO', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
    ]
  )

  const calculateTotal = (entry: BillableEntry | UnbillableEntry): number => {
    return entry.mon_hours + entry.tue_hours + entry.wed_hours + entry.thu_hours + 
           entry.fri_hours + entry.sat_hours + entry.sun_hours
  }

  const getDayTotal = (day: typeof days[number]): number => {
    const billable = billableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
    const unbillable = unbillableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
    return billable + unbillable
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (timesheetId) {
        // Update existing timesheet
        const { error: updateError } = await supabase
          .from('weekly_timesheets')
          .update({
            week_ending: weekEnding,
            week_starting: formatDateForInput(weekDates.start),
            updated_at: new Date().toISOString(),
          })
          .eq('id', timesheetId)

        if (updateError) throw updateError

        // Delete existing entries
        await supabase.from('timesheet_entries').delete().eq('timesheet_id', timesheetId)
        await supabase.from('timesheet_unbillable').delete().eq('timesheet_id', timesheetId)
      } else {
        // Create new timesheet
        const { data: newTimesheet, error: createError } = await supabase
          .from('weekly_timesheets')
          .insert({
            user_id: userId,
            week_ending: weekEnding,
            week_starting: formatDateForInput(weekDates.start),
            status: 'draft',
          })
          .select()
          .single()

        if (createError) throw createError
        if (!newTimesheet) throw new Error('Failed to create timesheet')

        timesheetId = newTimesheet.id
      }

      // Insert billable entries
      const entriesToInsert = billableEntries
        .filter(e => e.task_description.trim() || calculateTotal(e) > 0)
        .map(e => ({
          timesheet_id: timesheetId!,
          client_project_id: e.client_project_id || null,
          po_id: e.po_id || null,
          task_description: e.task_description,
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
        timesheet_id: timesheetId!,
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

      router.push('/dashboard/timesheets')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const addBillableEntry = () => {
    setBillableEntries([
      ...billableEntries,
      { task_description: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 }
    ])
  }

  const removeBillableEntry = (index: number) => {
    setBillableEntries(billableEntries.filter((_, i) => i !== index))
  }

  const updateBillableEntry = (index: number, field: keyof BillableEntry, value: any) => {
    const updated = [...billableEntries]
    updated[index] = { ...updated[index], [field]: value }
    setBillableEntries(updated)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Week Information */}
      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Week Ending Date
          </label>
          <input
            type="date"
            value={weekEnding}
            onChange={(e) => {
              const newWeekEnding = e.target.value
              setWeekEnding(newWeekEnding)
              // Recalculate week dates when week ending changes
              const newWeekDates = getWeekDates(newWeekEnding)
              // Update weekDates will happen automatically via state
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Week Ending:</span> {formatDate(weekDates.end)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <span className="font-semibold">Week Starting:</span> {formatDate(weekDates.start)}
        </p>
      </div>

      {/* Billable Time Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Time</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Client / Project #</th>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">PO#</th>
                <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Task Description</th>
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
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                    <SearchableSelect
                      options={sites}
                      value={entry.client_project_id || null}
                      onChange={(value) => updateBillableEntry(entryIdx, 'client_project_id', value)}
                      placeholder="Select..."
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                    <SearchableSelect
                      options={poOptions}
                      value={entry.po_id || null}
                      onChange={(value) => updateBillableEntry(entryIdx, 'po_id', value)}
                      placeholder="Select..."
                    />
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2">
                    <input
                      type="text"
                      value={entry.task_description}
                      onChange={(e) => updateBillableEntry(entryIdx, 'task_description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      placeholder="Task description..."
                    />
                  </td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="24"
                        value={entry[`${day}_hours`] || ''}
                        onChange={(e) => updateBillableEntry(entryIdx, `${day}_hours` as keyof BillableEntry, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                      />
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center font-medium text-gray-900 dark:text-gray-100">
                    {calculateTotal(entry).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeBillableEntry(entryIdx)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {/* Sub Totals Row */}
              <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                <td colSpan={3} className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                {days.map((day) => (
                  <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-gray-900 dark:text-gray-100">
                    {getBillableSubtotal(day).toFixed(2)}
                  </td>
                ))}
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0).toFixed(2)}
                </td>
                <td className="border border-gray-300 px-2 py-2"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addBillableEntry}
          className="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Row
        </button>
      </div>

      {/* Unbillable Time Section */}
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
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : timesheetId ? 'Update Timesheet' : 'Save Timesheet'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

