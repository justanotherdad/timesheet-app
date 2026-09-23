import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { getHeaderNavFlags } from '@/lib/nav-flags'
import AutoLogout from '@/components/AutoLogout'
import PasswordChangeGuard from '@/components/PasswordChangeGuard'
import ClientRouteGuard from '@/components/ClientRouteGuard'
import { HeaderNavProvider } from '@/components/HeaderNavProvider'
import NavigationProgress from '@/components/NavigationProgress'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, nav] = await Promise.all([getCurrentUser(), getHeaderNavFlags()])
  const mustChangePassword = !!(user?.profile as { must_change_password?: boolean })?.must_change_password

  return (
    <HeaderNavProvider value={nav}>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AutoLogout timeoutMinutes={60} />
      <PasswordChangeGuard mustChangePassword={mustChangePassword}>
        <ClientRouteGuard role={user?.profile.role}>
          {children}
        </ClientRouteGuard>
      </PasswordChangeGuard>
    </HeaderNavProvider>
  )
}
