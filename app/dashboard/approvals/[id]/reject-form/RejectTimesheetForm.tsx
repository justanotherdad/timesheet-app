'use client'

import { useState } from 'react'
import Link from 'next/link'

interface RejectTimesheetFormProps {
  timesheetId: string
}

export default function RejectTimesheetForm({ timesheetId }: RejectTimesheetFormProps) {
  // Prevent double-submits: the reject route used to return a 400 on the
  // second POST (status was already 'rejected') and the user would see the
  // raw JSON error and miss the mailto popup. The route is now idempotent,
  // but we still keep the user from firing the form twice.
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action={`/dashboard/approvals/${timesheetId}/reject`}
      method="post"
      className="space-y-4"
      onSubmit={() => setSubmitting(true)}
    >
      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Note for employee (required change)
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={4}
          required
          placeholder="e.g. Please correct Monday hours for Project X to 8.0"
          className="w-full px-4 py-2 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 min-h-[120px]"
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Link
          href="/dashboard/approvals"
          className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] sm:min-h-0 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:bg-red-400 disabled:cursor-not-allowed"
        >
          {submitting ? 'Rejecting…' : 'Reject Timesheet'}
        </button>
      </div>
    </form>
  )
}
