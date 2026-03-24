'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BasicBudgetView from './BasicBudgetView'
import ProjectBudgetShell from './ProjectBudgetShell'

interface Site {
  id: string
  name: string
  address_street?: string
  address_city?: string
  address_state?: string
  address_zip?: string
  contact?: string
}

interface PurchaseOrder {
  id: string
  po_number: string
  site_id: string
  department_id?: string
  description?: string
  original_po_amount?: number
  po_issue_date?: string
  po_balance?: number
  proposal_number?: string
  project_name?: string
  budget_type?: string
  active?: boolean
  sites?: Site
  departments?: { id: string; name: string }
}

interface BudgetPageClientProps {
  sites: Site[]
  purchaseOrders: PurchaseOrder[]
  initialPoId: string | null
  user: { id: string; profile: { role: string } }
  hasLimitedAccess?: boolean
}

export default function BudgetPageClient({
  sites,
  purchaseOrders,
  initialPoId,
  user,
  hasLimitedAccess = false,
}: BudgetPageClientProps) {
  const router = useRouter()
  const [budgetRefreshKey, setBudgetRefreshKey] = useState(0)
  const [showArchivedPOs, setShowArchivedPOs] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => {
    if (initialPoId) {
      const po = purchaseOrders.find((p) => p.id === initialPoId)
      return po?.site_id || ''
    }
    return ''
  })
  const [selectedPoId, setSelectedPoId] = useState<string | null>(initialPoId)

  const allSitePOsForNav = selectedSiteId ? purchaseOrders.filter((p) => p.site_id === selectedSiteId) : []
  const sitePOs = allSitePOsForNav
  const sitePOsForSelector = selectedSiteId
    ? purchaseOrders.filter((p) => p.site_id === selectedSiteId && (showArchivedPOs || p.active !== false))
    : []

  const selectedPO = selectedPoId
    ? purchaseOrders.find((p) => p.id === selectedPoId)
    : null

  const handleSelectPO = (poId: string) => {
    setSelectedPoId(poId)
    router.replace(`/dashboard/budget?poId=${poId}`, { scroll: false })
  }

  const handleBackToSelector = () => {
    setSelectedPoId(null)
    router.replace('/dashboard/budget', { scroll: false })
  }

  if (selectedPO) {
    const isProject = selectedPO.budget_type === 'project'
    const currentIndex = sitePOs.findIndex((p) => p.id === selectedPoId)
    const hasPrev = currentIndex > 0
    const hasNext = currentIndex >= 0 && currentIndex < sitePOs.length - 1
    return (
      <div className="max-w-7xl mx-auto">
        {isProject ? (
          <ProjectBudgetShell
            key={`${selectedPoId}-${budgetRefreshKey}`}
            po={selectedPO}
            sites={sites}
            onBack={handleBackToSelector}
          />
        ) : (
          <BasicBudgetView
            key={`${selectedPoId}-${budgetRefreshKey}`}
            po={selectedPO}
            sites={sites}
            onBack={handleBackToSelector}
            hasLimitedAccess={hasLimitedAccess}
            onSave={() => {
              setBudgetRefreshKey((k) => k + 1)
              router.refresh()
            }}
            user={user}
            allSites={sites}
            sitePOs={sitePOs}
            selectedSiteId={selectedSiteId}
            selectedPoId={selectedPoId ?? undefined}
            onSelectSite={(siteId) => {
              setSelectedSiteId(siteId)
              const firstPo = purchaseOrders.find((p) => p.site_id === siteId)
              if (firstPo) {
                handleSelectPO(firstPo.id)
              } else {
                setSelectedPoId(null)
                router.replace('/dashboard/budget', { scroll: false })
              }
            }}
            onSelectPo={handleSelectPO}
            onPrev={hasPrev ? () => handleSelectPO(sitePOs[currentIndex - 1].id) : undefined}
            onNext={hasNext ? () => handleSelectPO(sitePOs[currentIndex + 1].id) : undefined}
          />
        )}
      </div>
    )
  }

  const hasArchived = allSitePOsForNav.some((p) => p.active === false)

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Select a Budget to View
      </h2>
      <div className="space-y-4">
        {hasArchived && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchivedPOs}
              onChange={(e) => setShowArchivedPOs(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show archived POs</span>
          </label>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Client / Site
          </label>
          <select
            value={selectedSiteId}
            onChange={(e) => {
              setSelectedSiteId(e.target.value)
              setSelectedPoId(null)
            }}
            className="w-full min-h-[2.5rem] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
          >
            <option value="">-- Select client --</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {selectedSiteId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Purchase Order
            </label>
            <div className="space-y-2">
              {sitePOsForSelector.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {hasArchived && !showArchivedPOs ? 'No active purchase orders. Check "Show archived POs" to see archived.' : 'No purchase orders for this client.'}
                </p>
              ) : (
                sitePOsForSelector.map((po) => (
                  <button
                    key={po.id}
                    type="button"
                    onClick={() => handleSelectPO(po.id)}
                    className="w-full flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                  >
                    <span className="font-medium">
                      {po.po_number}
                      {(po.description || po.departments?.name) ? ` — ${po.description || po.departments?.name}` : ''}
                      {po.active === false && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(Archived)</span>}
                    </span>
                    <span className="text-sm text-gray-500 capitalize">
                      {po.budget_type || 'basic'} budget
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
