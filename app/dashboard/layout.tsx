import { getCurrentUser } from '@/lib/auth'
import AutoLogout from '@/components/AutoLogout'
import PasswordChangeGuard from '@/components/PasswordChangeGuard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  const mustChangePassword = !!(user?.profile as { must_change_password?: boolean })?.must_change_password

  return (
    <>
      <AutoLogout timeoutMinutes={30} />
      <PasswordChangeGuard mustChangePassword={mustChangePassword}>
        {children}
      </PasswordChangeGuard>
    </>
  )
}
