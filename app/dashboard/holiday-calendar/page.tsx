export const dynamic = 'force-dynamic'

import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Header from '@/components/Header'
import HolidayCalendarClient from '@/components/HolidayCalendarClient'

export default async function HolidayCalendarPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const defaultYear = new Date().getFullYear()
  const isAdmin = ['admin', 'super_admin'].includes(user.profile.role)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <Header title="Holiday & Pay Calendar" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 flex flex-col min-h-0">
        <HolidayCalendarClient isAdmin={isAdmin} defaultYear={defaultYear} />
      </div>
    </div>
  )
}
