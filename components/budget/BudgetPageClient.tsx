'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import BasicBudgetView from './BasicBudgetView'
import ProjectBudgetMatrix from './ProjectBudgetMatrix'
import BudgetPoSummaryPanel from './BudgetPoSummaryPanel'
import { formatDateShort } from '@/lib/utils'

/** Render a PO archive timestamp as "M/d/yy"; empty string if unparseable. */
function formatArchivedDate(value: string): string {
  try {
    return formatDateShort(value)
  } catch {
    return ''
  }
}

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
  archived_at?: string | null
  client_contact_name?: string | null
  sites?: Site
  departments?: { id: string; name: string }
}

type PoSortMode = 'po_number' | 'archived_oldest' | 'archived_newest'

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
  const [poSearch, setPoSearch] = useState('')
  const [poSortMode, setPoSortMode] = useState<PoSortMode>('po_number')
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

  // Apply active/archived filter, then the user's search query (matches
  // PO number, project name / description, proposal number, or client
  // contact name — all case-insensitive substring), then the chosen sort
  // mode. Sorting only by archived date in the archived view; for active
  // POs the only meaningful sort is PO number, so we fall back to the
  // pre-sorted list there.
  const sitePOsForSelector = useMemo(() => {
    if (!selectedSiteId) return []
    const base = sortedPurchaseOrders.filter((p) => {
      if (p.site_id !== selectedSiteId) return false
      // showArchivedPOs true → only archived (active === false); false → only active.
      return showArchivedPOs ? p.active === false : p.active !== false
    })

    const q = poSearch.trim().toLowerCase()
    const matchesQuery = (po: PurchaseOrder) => {
      if (!q) return true
      const haystack = [
        po.po_number,
        po.description,
        po.project_name,
        po.proposal_number,
        po.client_contact_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    }
    const filtered = base.filter(matchesQuery)

    if (!showArchivedPOs || poSortMode === 'po_number') {
      return filtered // already PO-number sorted via sortedPurchaseOrders
    }

    // Sort by archived_at; missing dates sink to the bottom regardless of
    // direction, then fall back to PO number for stable ordering.
    const archivedTime = (po: PurchaseOrder) => {
      if (!po.archived_at) return null
      const t = Date.parse(po.archived_at)
      return Number.isFinite(t) ? t : null
    }
    return [...filtered].sort((a, b) => {
      const ta = archivedTime(a)
      const tb = archivedTime(b)
      if (ta == null && tb == null) {
        return (a.po_number || '').localeCompare(b.po_number || '', undefined, { numeric: true })
      }
      if (ta == null) return 1
      if (tb == null) return -1
      return poSortMode === 'archived_oldest' ? ta - tb : tb - ta
    })
  }, [selectedSiteId, sortedPurchaseOrders, showArchivedPOs, poSearch, poSortMode])

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

  // Archived-date sorts only make sense in archived view. Snap back to PO
  // number when the user toggles archived off so the dropdown never shows
  // a disabled option as the active selection.
  useEffect(() => {
    if (!showArchivedPOs && poSortMode !== 'po_number') {
      setPoSortMode('po_number')
    }
  }, [showArchivedPOs, poSortMode])

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
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="search"
                value={poSearch}
                onChange={(e) => setPoSearch(e.target.value)}
                placeholder="Search PO #, project, proposal #, or contact"
                className="flex-1 min-h-[2.5rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
              />
              <select
                value={poSortMode}
                onChange={(e) => setPoSortMode(e.target.value as PoSortMode)}
                className="sm:w-64 min-h-[2.5rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                aria-label="Sort purchase orders"
              >
                <option value="po_number">Sort: PO number</option>
                <option value="archived_newest" disabled={!showArchivedPOs}>
                  Sort: Archived date (newest first)
                </option>
                <option value="archived_oldest" disabled={!showArchivedPOs}>
                  Sort: Archived date (oldest first)
                </option>
              </select>
            </div>
            <div className="space-y-2">
              {sitePOsForSelector.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {poSearch.trim()
                    ? 'No purchase orders match your search.'
                    : showArchivedPOs
                      ? 'No archived purchase orders for this client.'
                      : hasArchived
                        ? 'No active purchase orders. Check "Show archived POs" to view archived ones.'
                        : 'No purchase orders for this client.'}
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
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              (Archived
                              {po.archived_at ? ` ${formatArchivedDate(po.archived_at)}` : ''})
                            </span>
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
