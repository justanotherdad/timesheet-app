'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { clientMayAccessPath, isClientRole } from '@/lib/client-access'

/** Redirects Client-role users away from dashboard paths they are not allowed to open. */
export default function ClientRouteGuard({
  role,
  children,
}: {
  role?: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isClientRole(role)) return
    if (!pathname?.startsWith('/dashboard')) return
    if (!clientMayAccessPath(pathname)) {
      router.replace('/dashboard')
    }
  }, [role, pathname, router])

  if (isClientRole(role) && pathname?.startsWith('/dashboard') && !clientMayAccessPath(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-300">
        Redirecting…
      </div>
    )
  }

  return <>{children}</>
}
