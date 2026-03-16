'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface PasswordChangeGuardProps {
  children: React.ReactNode
  mustChangePassword?: boolean
}

export default function PasswordChangeGuard({ children, mustChangePassword }: PasswordChangeGuardProps) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!mustChangePassword) return
    if (pathname === '/dashboard/change-password') return
    router.replace('/dashboard/change-password?required=1')
  }, [mustChangePassword, pathname, router])

  return <>{children}</>
}
