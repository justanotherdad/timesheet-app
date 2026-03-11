import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import OptionsManager from '@/components/admin/OptionsManager'
import Header from '@/components/Header'
import { withQueryTimeout } from '@/lib/timeout'

export default async function SitesAdminPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const sitesResult = await withQueryTimeout(() =>
    supabase
      .from('sites')
      .select('*')
      .order('name')
  )

  const sites = (sitesResult.data || []) as Array<{ id: string; name: string; code?: string; week_starting_day?: number }>

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Manage Sites" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Configure sites (clients).
            </p>
          </div>
          <OptionsManager
            options={sites}
            tableName="sites"
            title="Sites"
            fields={[
              { name: 'name', label: 'Site Name', type: 'text', required: true },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
