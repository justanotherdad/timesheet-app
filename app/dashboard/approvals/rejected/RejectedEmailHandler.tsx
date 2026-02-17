'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { formatWeekEnding } from '@/lib/utils'

interface RejectedEmailHandlerProps {
  email: string
  reason: string
  weekEnding: string
}

export default function RejectedEmailHandler({ email, reason, weekEnding }: RejectedEmailHandlerProps) {
  useEffect(() => {
    if (!email) return

    const subject = 'Rejected Timesheet'
    const weekText = weekEnding ? ` (Week Ending ${formatWeekEnding(weekEnding)})` : ''
    const body = `Your timesheet${weekText} has been rejected.

Rejection note:
${reason}

Please review the note, make the necessary changes, and resubmit your timesheet.`

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = mailtoUrl
  }, [email, reason, weekEnding])

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Timesheet rejected
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Your default email client has been opened with a draft notification to the employee.
            </p>
            {email && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                To: {email}
              </p>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          The email includes the rejection note. You can edit the message before sending, or close the email window to skip.
        </p>
        <Link
          href="/dashboard/approvals"
          className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Back to Pending Approvals
        </Link>
      </div>
    </div>
  )
}