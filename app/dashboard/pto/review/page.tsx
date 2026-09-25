import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import PtoReviewClient from '@/components/PtoReviewClient'
import { isPtoApprover, loadPtoApproverIds } from '@/lib/pto'

export const dynamic = 'force-dynamic'

export default async function PtoReviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const approvers = await loadPtoApproverIds(admin)
  if (!isPtoApprover(user.id, approvers)) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="PTO Requests" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 max-w-3xl">
          Pending leave requests from internal employees. The first Approve or Deny settles the
          request for every reviewer. Settled requests stay on History.
        </p>
        <PtoReviewClient />
      </div>
    </div>
  )
}
