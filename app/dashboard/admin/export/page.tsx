import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminExport from '@/components/admin/AdminExport'

export default async function AdminExportPage() {
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: timesheets } = await supabase
    .from('weekly_timesheets')
    .select(`
      *,
      user_profiles!user_id(name, email)
    `)
    .order('week_ending', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Export Timesheets</h1>
          <AdminExport timesheets={timesheets || []} />
        </div>
      </div>
    </div>
  )
}

