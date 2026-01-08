import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import OptionsManager from '@/components/admin/OptionsManager'

export default async function ActivitiesAdminPage() {
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .order('name')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/dashboard/admin"
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Admin
            </Link>
          </div>
          <OptionsManager
            options={activities || []}
            tableName="activities"
            title="Activities"
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

