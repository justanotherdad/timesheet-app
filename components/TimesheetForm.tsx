'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const timesheetSchema = z.object({
  week_ending: z.string().min(1, 'Week ending date is required'),
  site_id: z.string().min(1, 'Site is required'),
  po_id: z.string().min(1, 'Purchase Order is required'),
  system_id: z.string().min(1, 'System is required'),
  activity_id: z.string().min(1, 'Activity is required'),
  deliverable_id: z.string().min(1, 'Deliverable is required'),
  hours: z.number().min(0.01, 'Hours must be greater than 0').max(168, 'Hours cannot exceed 168 per week'),
})

type TimesheetFormData = z.infer<typeof timesheetSchema>

interface TimesheetFormProps {
  sites: Array<{ id: string; name: string; code?: string }>
  purchaseOrders: Array<{ id: string; po_number: string; description?: string }>
  systems: Array<{ id: string; name: string; code?: string }>
  activities: Array<{ id: string; name: string; code?: string }>
  deliverables: Array<{ id: string; name: string; code?: string }>
  defaultWeekEnding: string
  userId: string
  timesheetId?: string
  initialData?: Partial<TimesheetFormData>
}

export default function TimesheetForm({
  sites,
  purchaseOrders,
  systems,
  activities,
  deliverables,
  defaultWeekEnding,
  userId,
  timesheetId,
  initialData,
}: TimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TimesheetFormData>({
    resolver: zodResolver(timesheetSchema),
    defaultValues: {
      week_ending: initialData?.week_ending || defaultWeekEnding,
      site_id: initialData?.site_id || '',
      po_id: initialData?.po_id || '',
      system_id: initialData?.system_id || '',
      activity_id: initialData?.activity_id || '',
      deliverable_id: initialData?.deliverable_id || '',
      hours: initialData?.hours || 0,
    },
  })

  const siteId = watch('site_id')
  const poId = watch('po_id')
  const systemId = watch('system_id')
  const activityId = watch('activity_id')
  const deliverableId = watch('deliverable_id')

  const onSubmit = async (data: TimesheetFormData) => {
    setError(null)
    setLoading(true)

    try {
      if (timesheetId) {
        // Update existing timesheet
        const { error: updateError } = await supabase
          .from('timesheets')
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', timesheetId)

        if (updateError) throw updateError
      } else {
        // Create new timesheet
        const { error: insertError } = await supabase
          .from('timesheets')
          .insert({
            ...data,
            user_id: userId,
            status: 'draft',
          })

        if (insertError) throw insertError
      }

      router.push('/dashboard/timesheets')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Transform purchase orders to match SearchableSelect format
  const poOptions = purchaseOrders.map(po => ({
    id: po.id,
    name: po.po_number,
    code: po.description,
  }))

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="week_ending" className="block text-sm font-medium text-gray-700 mb-1">
          Week Ending <span className="text-red-500">*</span>
        </label>
        <input
          id="week_ending"
          type="date"
          {...register('week_ending')}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {errors.week_ending && (
          <p className="mt-1 text-sm text-red-600">{errors.week_ending.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SearchableSelect
          label="Site"
          options={sites}
          value={siteId}
          onChange={(value) => setValue('site_id', value || '', { shouldValidate: true })}
          placeholder="Select a site"
          required
        />
        {errors.site_id && (
          <p className="text-sm text-red-600">{errors.site_id.message}</p>
        )}

        <SearchableSelect
          label="Purchase Order"
          options={poOptions}
          value={poId}
          onChange={(value) => setValue('po_id', value || '', { shouldValidate: true })}
          placeholder="Select a PO"
          required
        />
        {errors.po_id && (
          <p className="text-sm text-red-600">{errors.po_id.message}</p>
        )}

        <SearchableSelect
          label="System"
          options={systems}
          value={systemId}
          onChange={(value) => setValue('system_id', value || '', { shouldValidate: true })}
          placeholder="Select a system"
          required
        />
        {errors.system_id && (
          <p className="text-sm text-red-600">{errors.system_id.message}</p>
        )}

        <SearchableSelect
          label="Activity"
          options={activities}
          value={activityId}
          onChange={(value) => setValue('activity_id', value || '', { shouldValidate: true })}
          placeholder="Select an activity"
          required
        />
        {errors.activity_id && (
          <p className="text-sm text-red-600">{errors.activity_id.message}</p>
        )}

        <SearchableSelect
          label="Deliverable"
          options={deliverables}
          value={deliverableId}
          onChange={(value) => setValue('deliverable_id', value || '', { shouldValidate: true })}
          placeholder="Select a deliverable"
          required
        />
        {errors.deliverable_id && (
          <p className="text-sm text-red-600">{errors.deliverable_id.message}</p>
        )}

        <div>
          <label htmlFor="hours" className="block text-sm font-medium text-gray-700 mb-1">
            Hours <span className="text-red-500">*</span>
          </label>
          <input
            id="hours"
            type="number"
            step="0.01"
            min="0"
            max="168"
            {...register('hours', { valueAsNumber: true })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {errors.hours && (
            <p className="mt-1 text-sm text-red-600">{errors.hours.message}</p>
          )}
        </div>
      </div>

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

