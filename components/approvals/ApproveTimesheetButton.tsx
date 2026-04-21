'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Approves via fetch + JSON so we avoid a full document navigation (form POST → redirect),
 * which reloads the app and can reset client-only UI such as dark mode.
 */
export default function ApproveTimesheetButton({
  timesheetId,
  returnTo,
  className,
  children = 'Approve',
  onAfterSuccess,
}: {
  timesheetId: string
  returnTo: string
  className?: string
  children?: React.ReactNode
  /** e.g. close mobile detail modal after approve */
  onAfterSuccess?: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    setPending(true)
    try {
      const fd = new FormData()
      fd.append('returnTo', returnTo)
      const res = await fetch(`/dashboard/approvals/${timesheetId}/approve`, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
      let data: { error?: string } = {}
      try {
        data = await res.json()
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Approval failed')
        return
      }
      onAfterSuccess?.()
      if (typeof window !== 'undefined') {
        const url = new URL(returnTo, window.location.origin)
        const same =
          window.location.pathname === url.pathname && window.location.search === url.search
        if (same) router.refresh()
        else router.push(returnTo)
      } else {
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={pending} onClick={handleApprove} className={className}>
        {pending ? '…' : children}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400 max-w-[14rem]">{error}</span>}
    </span>
  )
}
