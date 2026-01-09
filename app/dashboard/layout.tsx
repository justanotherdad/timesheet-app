import AutoLogout from '@/components/AutoLogout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AutoLogout timeoutMinutes={30} />
      {children}
    </>
  )
}
