import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import { getAccessibleSiteIds } from '@/lib/access'
import HierarchicalItemManager from '@/components/admin/HierarchicalItemManager'

export default async function DeliverablesAdminPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const sitesResult = await withQueryTimeout(() =>
    supabase.from('sites').select('*').order('name')
  )
  let sites = (sitesResult.data || []) as Array<{ id: string; name: string; code?: string }>
  const role = user.profile.role as 'supervisor' | 'manager' | 'admin' | 'super_admin'
  const accessibleSiteIds = await getAccessibleSiteIds(supabase, user.id, role)
  if (accessibleSiteIds !== null) {
    sites = accessibleSiteIds.length === 0 ? [] : sites.filter((s) => accessibleSiteIds.includes(s.id))
  }

  const readOnly = role === 'supervisor'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={readOnly ? 'View Deliverables' : 'Manage Deliverables'} showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <HierarchicalItemManager
            sites={sites}
            tableName="deliverables"
            title="Deliverables"
            itemName="Deliverable"
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  )
}

