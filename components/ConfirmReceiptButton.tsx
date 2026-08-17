'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

export default function ConfirmReceiptButton({ timesheetId }: { timesheetId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    setPending(true)
    try {
      const res = await fetch(`/api/timesheet-confirmations/${timesheetId}/confirm`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error || 'Could not confirm.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not confirm.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 gap-1 rounded-lg bg-indigo-600 text-white px-4 py-2.5 font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        <CheckCircle className="h-4 w-4 shrink-0" />
        {pending ? '…' : 'Confirm receipt'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400 max-w-[14rem]">{error}</span>}
    </span>
  )
}
