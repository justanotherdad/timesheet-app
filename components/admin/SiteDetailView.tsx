'use client'

import { useState } from 'react'
import { FileText, X, ChevronRight } from 'lucide-react'
import ClientCard from './ClientCard'
import POInfoCard from './POInfoCard'

interface SiteDetailViewProps {
  site: any
  departments: Array<{ id: string; name: string; site_id: string }>
  purchaseOrders: Array<{ id: string; po_number: string; site_id: string; department_id?: string; description?: string; original_po_amount?: number; po_issue_date?: string; po_balance?: number; proposal_number?: string; project_name?: string; budget_type?: string }>
  onSave: () => void
  onClose: () => void
  onDepartmentAdded?: (dept: { id: string; name: string; site_id: string }) => void
  readOnly?: boolean
  showBudgetLink?: boolean
}

export default function SiteDetailView({
  site,
  departments,
  purchaseOrders,
  onSave,
  onClose,
  onDepartmentAdded,
  readOnly = false,
  showBudgetLink = false,
}: SiteDetailViewProps) {
  const [editingClient, setEditingClient] = useState(false)
  const [editingPO, setEditingPO] = useState<any>(null)

  const sitePOs = purchaseOrders
    .filter((p) => p.site_id === site.id)
    .sort((a, b) => (a.po_number || '').localeCompare(b.po_number || '', undefined, { numeric: true }))
  const addressParts = [site.address_street, [site.address_city, site.address_state, site.address_zip].filter(Boolean).join(', ')].filter(Boolean)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center z-10">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{site.name}</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Client Card */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Client</h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditingClient(true)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="space-y-1 text-sm">
                <p><strong>Client / Site:</strong> {site.name}</p>
                {site.contact && <p><strong>Contact:</strong> {site.contact}</p>}
                {addressParts.length > 0 && (
                  <p><strong>Address:</strong> {addressParts.join(', ')}</p>
                )}
                {!site.contact && !addressParts.length && (
                  <p className="text-gray-500 dark:text-gray-400">No contact or address. Click Edit to add.</p>
                )}
              </div>
            </div>

            {/* PO Cards */}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Purchase Orders</h3>
              {sitePOs.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Add a purchase order in the Purchase Orders tab first.</p>
              ) : (
                <div className="space-y-2">
                  {sitePOs.map((po) => {
                    const deptName = departments.find((d) => d.id === po.department_id)?.name
                    const desc = po.description || po.project_name || deptName
                    return (
                      <button
                        key={po.id}
                        type="button"
                        onClick={() => setEditingPO(po)}
                        className="w-full flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-5 w-5 text-gray-500 shrink-0" />
                          <span className="font-medium truncate">
                            {po.po_number}
                            {desc ? ` — ${desc}` : ''}
                          </span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingClient && (
        <ClientCard
          site={site}
          onSave={onSave}
          onClose={() => setEditingClient(false)}
          readOnly={readOnly}
        />
      )}

      {editingPO && (
        <POInfoCard
          po={editingPO}
          siteId={site.id}
          departments={departments}
          onSave={onSave}
          onClose={() => setEditingPO(null)}
          onDepartmentAdded={onDepartmentAdded}
          readOnly={readOnly}
          showBudgetLink={showBudgetLink}
        />
      )}
    </>
  )
}
