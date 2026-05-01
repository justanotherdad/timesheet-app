'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import BasicBudgetView from './BasicBudgetView'
import ProjectBudgetMatrix from './ProjectBudgetMatrix'
import BudgetPoSummaryPanel from './BudgetPoSummaryPanel'

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

function BudgetPageClientInner({
  sites,
  purchaseOrders,
  initialPoId,
  user,
  hasLimitedAccess = false,
}: BudgetPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const matrixMode = searchParams.get('matrix') === '1'

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
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null)

  // Sort POs by po_number using a trimmed, case-insensitive comparator. We
  // strip leading whitespace and invisible chars (zero-width space etc.)
  // before comparing — the server's ORDER BY can otherwise put a record with
  // a stray leading space before everything else even though the rendered
  // string looks identical. The numeric option keeps "SNFITQ00001363" sorting
  // before "SNFITQ00002240" inside a shared prefix.
  const sortedPurchaseOrders = useMemo(() => {
    const sortKey = (s: string | null | undefined) =>
      String(s ?? '')
        .replace(/^[\s\u200B-\u200D\uFEFF]+/, '')
        .trim()
        .toUpperCase()
    return [...purchaseOrders].sort((a, b) =>
      sortKey(a.po_number).localeCompare(sortKey(b.po_number), undefined, {
        sensitivity: 'base',
        numeric: true,
      })
    )
  }, [purchaseOrders])

  const allSitePOsForNav = selectedSiteId ? sortedPurchaseOrders.filter((p) => p.site_id === selectedSiteId) : []
  const sitePOs = allSitePOsForNav
  const sitePOsForSelector = selectedSiteId
    ? sortedPurchaseOrders.filter((p) => {
        if (p.site_id !== selectedSiteId) return false
        // When showArchivedPOs is true, show ONLY archived (active === false)
        // When false, show only active (active !== false)
        return showArchivedPOs ? p.active === false : p.active !== false
      })
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

  const backToBudgetDetails = () => {
    if (selectedPoId) {
      router.replace(`/dashboard/budget?poId=${selectedPoId}`, { scroll: false })
    }
  }

  useEffect(() => {
    if (!matrixMode || !selectedPO) return
    if (selectedPO.budget_type !== 'project') {
      router.replace(selectedPoId ? `/dashboard/budget?poId=${selectedPoId}` : '/dashboard/budget', { scroll: false })
    }
  }, [matrixMode, selectedPO, selectedPoId, router])

  if (selectedPO) {
    const currentIndex = sitePOs.findIndex((p) => p.id === selectedPoId)
    const hasPrev = currentIndex > 0
    const hasNext = currentIndex >= 0 && currentIndex < sitePOs.length - 1

    if (matrixMode && selectedPO.budget_type === 'project') {
      return (
        <div className="max-w-7xl mx-auto space-y-6">
          <button
            type="button"
            onClick={backToBudgetDetails}
            className="print:hidden inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to budget details
          </button>
          <ProjectBudgetMatrix
            poId={selectedPO.id}
            refreshTick={budgetRefreshKey}
            reportTitle={`${selectedPO.po_number}${selectedPO.description ? ` — ${selectedPO.description}` : selectedPO.project_name ? ` — ${selectedPO.project_name}` : ''}`}
            fileBaseName={selectedPO.po_number}
            canEditMatrix={!hasLimitedAccess && ['manager', 'admin', 'super_admin'].includes(user.profile.role)}
            onMatrixRefresh={() => setBudgetRefreshKey((k) => k + 1)}
          />
        </div>
      )
    }

    return (
      <div className="max-w-7xl mx-auto">
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
              setExpandedPoId(null)
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
                  {showArchivedPOs ? 'No archived purchase orders for this client.' : hasArchived ? 'No active purchase orders. Check "Show archived POs" to view archived ones.' : 'No purchase orders for this client.'}
                </p>
              ) : (
                sitePOsForSelector.map((po) => {
                  const expanded = expandedPoId === po.id
                  return (
                    <div
                      key={po.id}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800/30"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedPoId((id) => (id === po.id ? null : po.id))}
                        aria-expanded={expanded}
                        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100 min-w-0">
                          {po.po_number}
                          {(po.description || po.departments?.name) ? ` — ${po.description || po.departments?.name}` : ''}
                          {po.active === false && (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">(Archived)</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                            {po.budget_type || 'basic'} budget
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 text-gray-400 dark:text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </span>
                      </button>
                      {expanded && (
                        <BudgetPoSummaryPanel
                          poId={po.id}
                          po={{
                            po_number: po.po_number,
                            project_name: po.project_name,
                            description: po.description,
                            po_issue_date: po.po_issue_date,
                            proposal_number: po.proposal_number,
                          }}
                          onViewDetails={() => handleSelectPO(po.id)}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BudgetLoadingFallback() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
    </div>
  )
}

export default function BudgetPageClient(props: BudgetPageClientProps) {
  return (
    <Suspense fallback={<BudgetLoadingFallback />}>
      <BudgetPageClientInner {...props} />
    </Suspense>
  )
}
