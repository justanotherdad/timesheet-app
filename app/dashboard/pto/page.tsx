import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import Header from '@/components/Header'
import PtoRequestClient from '@/components/PtoRequestClient'
import { isInternalEmployee } from '@/lib/pto'

export const dynamic = 'force-dynamic'

export default async function PtoRequestPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.profile.role === 'client' || !isInternalEmployee(user.profile.employee_type)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Request PTO" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <PtoRequestClient />
      </div>
    </div>
  )
}
