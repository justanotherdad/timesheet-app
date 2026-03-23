'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface POLinkWithBalanceTooltipProps {
  poId: string
  poNumber: string
}

export default function POLinkWithBalanceTooltip({ poId, poNumber }: POLinkWithBalanceTooltipProps) {
  const [balance, setBalance] = useState<{ budgetBalance: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const fetchedRef = useRef(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchBalance = useCallback(async () => {
    if (fetchedRef.current || loading) return
    fetchedRef.current = true
    setLoading(true)
    try {
      const res = await fetch(`/api/budget/${poId}/balance`)
      if (res.ok) {
        const data = await res.json()
        setBalance({ budgetBalance: data.budgetBalance ?? 0 })
      }
    } catch {
      setBalance({ budgetBalance: 0 })
    } finally {
      setLoading(false)
    }
  }, [poId, loading])

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    fetchBalance()
    setShow(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: rect.left })
  }

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => setShow(false), 200)
  }

  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
  }, [])

  const formattedBalance = balance
    ? `$${balance.budgetBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : loading
      ? 'Loading...'
      : '—'

  return (
    <span className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Link
        href={`/dashboard/budget?poId=${poId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
      >
        {poNumber}
      </Link>
      {show && (
        <div
          className="fixed z-50 px-3 py-2 text-sm bg-gray-900 dark:bg-gray-700 text-white rounded-lg shadow-lg whitespace-nowrap"
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          <span className="text-gray-300 dark:text-gray-400">Budget Balance: </span>
          <span className="font-semibold">{formattedBalance}</span>
        </div>
      )}
    </span>
  )
}
