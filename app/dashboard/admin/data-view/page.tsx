import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import DataViewManager from '@/components/admin/DataViewManager'

export default async function DataViewPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  // Fetch all filter options
  const [usersResult, sitesResult, departmentsResult] = await Promise.all([
    withQueryTimeout(() => supabase.from('user_profiles').select('id, name, email').order('name')),
    withQueryTimeout(() => supabase.from('sites').select('id, name').order('name')),
    withQueryTimeout(() => supabase.from('departments').select('id, name, site_id').order('name')),
  ])

  const users = (usersResult.data || []) as any[]
  const sites = (sitesResult.data || []) as any[]
  const departments = (departmentsResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Data View" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <DataViewManager 
            users={users}
            sites={sites}
            departments={departments}
          />
        </div>
      </div>
    </div>
  )
}
