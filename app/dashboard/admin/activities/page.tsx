import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import HierarchicalItemManager from '@/components/admin/HierarchicalItemManager'

export default async function ActivitiesAdminPage() {
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
      <Header title="Manage Activities" showBack backUrl="/dashboard/admin" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <HierarchicalItemManager 
            sites={sites}
            tableName="activities"
            title="Activities"
            itemName="Activity"
          />
        </div>
      </div>
    </div>
  )
}

