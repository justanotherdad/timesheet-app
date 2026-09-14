'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  const unavailable =
    error.name === 'AuthUnavailableError' ||
    /temporarily unavailable|timed out|timeout/i.test(error.message || '')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {unavailable ? 'Temporarily unavailable' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {unavailable
            ? 'We could not verify your session. Your login was not cleared — wait a moment and try again.'
            : 'Please try again. If this keeps happening, contact an administrator.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
