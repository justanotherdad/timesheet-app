import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import AuditLogClient from '@/components/admin/AuditLogClient'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage() {
  const user = await requireRole(['admin', 'super_admin'])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Audit Log" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <AuditLogClient />
      </div>
    </div>
  )
}
