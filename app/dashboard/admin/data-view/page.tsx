export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccessibleSiteIds } from '@/lib/access'
import { getDataViewAccess, mergeDataViewSiteScope } from '@/lib/data-view-access'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import DataViewManager from '@/components/admin/DataViewManager'

export default async function DataViewPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const adminSupabase = createAdminClient()

  const [usersResult, sitesResult, departmentsResult, purchaseOrdersResult] = await Promise.all([
    withQueryTimeout(() =>
      adminSupabase
        .from('user_profiles')
        .select('id, name, email, supervisor_id, manager_id, final_approver_id, role')
        .order('name')
    ),
    withQueryTimeout(() => adminSupabase.from('sites').select('id, name').order('name')),
    withQueryTimeout(() => adminSupabase.from('departments').select('id, name, site_id').order('name')),
    withQueryTimeout(() =>
      adminSupabase.from('purchase_orders').select('id, po_number, site_id, department_id').order('po_number')
    ),
  ])

  const allUsers = (usersResult.data || []) as Array<{
    id: string
    name: string
    email: string
    supervisor_id?: string | null
    manager_id?: string | null
    final_approver_id?: string | null
    role: string
  }>
  const role = user.profile.role

  const [access, rawSiteIds] = await Promise.all([
    getDataViewAccess(adminSupabase, user.id, role, allUsers),
    getAccessibleSiteIds(adminSupabase, user.id, role),
  ])
  const accessibleIdSet = new Set(access.accessibleUserIds)
  const users = allUsers.filter((u) => accessibleIdSet.has(u.id))

  const accessibleSiteIds = mergeDataViewSiteScope(rawSiteIds, access.grantedSiteIds)
  let sites = (sitesResult.data || []) as Array<{ id: string; name: string }>
  let departments = (departmentsResult.data || []) as Array<{ id: string; name: string; site_id: string }>
  let purchaseOrders = (purchaseOrdersResult.data || []) as Array<{
    id: string
    po_number: string
    site_id?: string
    department_id?: string
  }>

  if (accessibleSiteIds !== null) {
    const siteSet = new Set(accessibleSiteIds)
    sites = sites.filter((s) => siteSet.has(s.id))
    departments = departments.filter((d) => siteSet.has(d.site_id))
    purchaseOrders = purchaseOrders.filter(
      (p) => access.grantedPoIds.has(p.id) || (p.site_id && siteSet.has(p.site_id))
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Data View" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto overflow-hidden">
          <DataViewManager
            users={users}
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
          />
        </div>
      </div>
    </div>
  )
}
