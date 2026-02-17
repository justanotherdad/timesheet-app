import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import RejectedEmailHandler from './RejectedEmailHandler'

export default async function RejectedPage(props: { searchParams: Promise<{ email?: string; reason?: string; week_ending?: string }> }) {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const params = await props.searchParams

  if (!params.email) {
    redirect('/dashboard/approvals')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Rejected" showBack backUrl="/dashboard/approvals" user={user} />
      <RejectedEmailHandler
        email={params.email}
        reason={params.reason || ''}
        weekEnding={params.week_ending || ''}
      />
    </div>
  )
}
