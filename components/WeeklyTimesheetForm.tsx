'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import { getWeekDates, formatDate, formatDateShort, formatDateForInput } from '@/lib/utils'
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

  const weekDates = getWeekDates(defaultWeekEnding)
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
            week_ending: defaultWeekEnding,
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Week Information */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Week Ending:</span> {formatDate(weekDates.end)}
        </p>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Week Starting:</span> {formatDate(weekDates.start)}
        </p>
      </div>

      {/* Billable Time Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Billable Time</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Client / Project #</th>
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">PO#</th>
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Task Description</th>
                {weekDates.days.map((day, idx) => (
                  <th key={idx} className="border border-gray-300 px-2 py-2 text-center text-sm font-medium">
                    <div>{day.toUpperCase().slice(0, 2)}</div>
                    <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                  </th>
                ))}
                <th className="border border-gray-300 px-3 py-2 text-center text-sm font-medium">Total</th>
                <th className="border border-gray-300 px-2 py-2 text-center text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {billableEntries.map((entry, entryIdx) => (
                <tr key={entryIdx} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">
                    <SearchableSelect
                      options={sites}
                      value={entry.client_project_id || null}
                      onChange={(value) => updateBillableEntry(entryIdx, 'client_project_id', value)}
                      placeholder="Select..."
                    />
                  </td>
                  <td className="border border-gray-300 px-3 py-2">
                    <SearchableSelect
                      options={poOptions}
                      value={entry.po_id || null}
                      onChange={(value) => updateBillableEntry(entryIdx, 'po_id', value)}
                      placeholder="Select..."
                    />
                  </td>
                  <td className="border border-gray-300 px-3 py-2">
                    <input
                      type="text"
                      value={entry.task_description}
                      onChange={(e) => updateBillableEntry(entryIdx, 'task_description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
                        className="w-full px-2 py-1 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2 text-center font-medium">
                    {calculateTotal(entry).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeBillableEntry(entryIdx)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {/* Sub Totals Row */}
              <tr className="bg-yellow-50 font-semibold">
                <td colSpan={3} className="border border-gray-300 px-3 py-2">Sub Totals</td>
                {days.map((day) => (
                  <td key={day} className="border border-gray-300 px-2 py-2 text-center">
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
          className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add Row
        </button>
      </div>

      {/* Unbillable Time Section */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Unbillable Time</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left text-sm font-medium">Description</th>
                {weekDates.days.map((day, idx) => (
                  <th key={idx} className="border border-gray-300 px-2 py-2 text-center text-sm font-medium">
                    <div>{day.toUpperCase().slice(0, 2)}</div>
                    <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                  </th>
                ))}
                <th className="border border-gray-300 px-3 py-2 text-center text-sm font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {unbillableEntries.map((entry, entryIdx) => (
                <tr key={entryIdx} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2 font-medium">{entry.description}</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="24"
                        value={entry[`${day}_hours`] || ''}
                        onChange={(e) => updateUnbillableEntry(entryIdx, day, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2 text-center font-medium">
                    {calculateTotal(entry).toFixed(2)}
                  </td>
                </tr>
              ))}
              
              {/* Sub Totals Row */}
              <tr className="bg-yellow-50 font-semibold">
                <td className="border border-gray-300 px-3 py-2">Sub Totals</td>
                {days.map((day) => (
                  <td key={day} className="border border-gray-300 px-2 py-2 text-center">
                    {getUnbillableSubtotal(day).toFixed(2)}
                  </td>
                ))}
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grand Total */}
      <div className="bg-green-100 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">GRAND TOTAL</span>
          <span className="text-lg font-bold text-gray-900">{getGrandTotal().toFixed(2)}</span>
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
          className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

