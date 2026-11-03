import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import CompReviewClient from '@/components/CompReviewClient'
import { canManageComp } from '@/lib/comp'

export const dynamic = 'force-dynamic'

export default async function CompReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const access = await canManageComp(createAdminClient(), user.id, user.profile.role)
  if (!access.allowed) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Comp Time Requests" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
          Bank Comp and Use Comp from internal employees. The first Approve or Deny settles the
          request. Approve checks submitted billable hours again. An admin can add hours here.
        </p>
        <CompReviewClient isAdmin={access.isAdmin} />
      </div>
    </div>
  )
}
