import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import UserManagement from '@/components/admin/UserManagement'

export default async function UsersAdminPage() {
  const user = await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('user_profiles')
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
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Manage Users</h1>
          <UserManagement users={users || []} currentUserRole={user.profile.role} />
        </div>
      </div>
    </div>
  )
}

