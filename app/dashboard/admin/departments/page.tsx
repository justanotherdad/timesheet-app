import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import SiteDepartmentManager from '@/components/admin/SiteDepartmentManager'

export default async function DepartmentsAdminPage() {
  const user = await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const sitesResult = await withQueryTimeout(() =>
    supabase
      .from('sites')
      .select('*')
      .order('name')
  )

  const sites = (sitesResult.data || []) as Array<{ id: string; name: string; code?: string }>

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Departments" showBack backUrl="/dashboard/admin" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <SiteDepartmentManager sites={sites} />
        </div>
      </div>
    </div>
  )
}
