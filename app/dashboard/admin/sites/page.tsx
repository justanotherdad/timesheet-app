import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import OptionsManager from '@/components/admin/OptionsManager'

export default async function SitesAdminPage() {
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: sites } = await supabase
    .from('sites')
    .select('*')
    .order('name')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/dashboard/admin"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              ← Back to Admin
            </Link>
          </div>
          <OptionsManager
            options={sites || []}
            tableName="sites"
            title="Sites"
            fields={[
              { name: 'name', label: 'Name', required: true },
              { name: 'code', label: 'Code' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

