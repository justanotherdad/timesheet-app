import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'
import PurchaseOrderManager from '@/components/admin/PurchaseOrderManager'

export default async function PurchaseOrdersAdminPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin'])
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
      <Header title="Manage Purchase Orders" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <PurchaseOrderManager sites={sites} />
        </div>
      </div>
    </div>
  )
}

