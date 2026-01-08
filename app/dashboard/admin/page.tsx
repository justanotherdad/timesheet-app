import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'
import { Users, Settings, FileText, Building, ShoppingCart, Activity, Package } from 'lucide-react'

export default async function AdminPage() {
  const user = await requireRole(['admin', 'super_admin'])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/dashboard/admin/users"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Users</h3>
                  <p className="text-sm text-gray-600">Add, edit, and manage user accounts</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/sites"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-green-100 p-3 rounded-lg">
                  <Building className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Sites</h3>
                  <p className="text-sm text-gray-600">Add and edit site options</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/purchase-orders"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <ShoppingCart className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage POs</h3>
                  <p className="text-sm text-gray-600">Add and edit purchase orders</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/systems"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-orange-100 p-3 rounded-lg">
                  <Activity className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Systems</h3>
                  <p className="text-sm text-gray-600">Add and edit system options</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/activities"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-pink-100 p-3 rounded-lg">
                  <Activity className="h-6 w-6 text-pink-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Activities</h3>
                  <p className="text-sm text-gray-600">Add and edit activity options</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/deliverables"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <Package className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Deliverables</h3>
                  <p className="text-sm text-gray-600">Add and edit deliverable options</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/admin/export"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="bg-teal-100 p-3 rounded-lg">
                  <FileText className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Export Timesheets</h3>
                  <p className="text-sm text-gray-600">Export timesheets for any week</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

