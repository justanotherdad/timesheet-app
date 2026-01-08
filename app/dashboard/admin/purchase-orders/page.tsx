import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import OptionsManager from '@/components/admin/OptionsManager'

export default async function PurchaseOrdersAdminPage() {
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  const purchaseOrdersResult = await supabase
    .from('purchase_orders')
    .select('*')
    .order('po_number')

  const purchaseOrders = (purchaseOrdersResult.data || []).map((po: any) => ({
    ...po,
    name: po.po_number || po.description || 'Unnamed PO'
  })) as Array<{ id: string; name: string; po_number: string; description?: string }>

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
            options={purchaseOrders}
            tableName="purchase_orders"
            title="Purchase Orders"
            fields={[
              { name: 'po_number', label: 'PO Number', required: true },
              { name: 'description', label: 'Description' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

