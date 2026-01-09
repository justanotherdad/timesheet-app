'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteTimesheet } from '@/app/actions/delete-timesheet'

interface DeleteTimesheetButtonProps {
  timesheetId: string
  status: string
  onDeleted?: () => void
  variant?: 'button' | 'link' // 'button' for forms, 'link' for tables
}

export default function DeleteTimesheetButton({ timesheetId, status, onDeleted, variant = 'link' }: DeleteTimesheetButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this timesheet? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await deleteTimesheet(timesheetId)
      
      if (result.error) {
        setError(result.error)
      } else {
        if (onDeleted) {
          onDeleted()
        } else {
          window.location.href = '/dashboard/timesheets'
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete timesheet')
    } finally {
      setLoading(false)
    }
  }

  // Only show delete button for draft timesheets or if user is admin (handled server-side)
  if (status !== 'draft') {
    return null
  }

  // Link variant for table rows
  if (variant === 'link') {
    return (
      <>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50"
          title="Delete timesheet"
        >
          {loading ? 'Deleting...' : 'Delete'}
        </button>
        {error && (
          <span className="text-red-600 dark:text-red-400 text-xs ml-1">{error}</span>
        )}
      </>
    )
  }

  // Button variant for forms
  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        title="Delete timesheet"
      >
        <Trash2 className="h-4 w-4" />
        {loading ? 'Deleting...' : 'Delete'}
      </button>
      {error && (
        <span className="text-red-600 dark:text-red-400 text-xs">{error}</span>
      )}
    </>
  )
}
