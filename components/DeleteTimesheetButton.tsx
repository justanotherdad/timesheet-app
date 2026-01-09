'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteTimesheet } from '@/app/actions/delete-timesheet'
import { useRouter } from 'next/navigation'

interface DeleteTimesheetButtonProps {
  timesheetId: string
  status: string
}

export default function DeleteTimesheetButton({ timesheetId, status }: DeleteTimesheetButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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
        router.refresh()
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

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50"
        title="Delete timesheet"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && (
        <span className="text-red-600 dark:text-red-400 text-xs">{error}</span>
      )}
    </>
  )
}
