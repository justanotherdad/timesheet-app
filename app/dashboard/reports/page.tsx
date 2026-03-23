import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import ReportsPageClient from '@/components/reports/ReportsPageClient'

export default async function ReportsPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Reports" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <ReportsPageClient />
        </div>
      </div>
    </div>
  )
}
