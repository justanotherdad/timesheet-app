'use client'

import { useRef, useState, useEffect } from 'react'
import { Download, Printer, Filter } from 'lucide-react'
import { formatDate, formatDateShort, formatDateInEastern, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'

// SVG: Rotate phone to landscape (instructional icon - no external assets)
const RotateToLandscapeSvg = () => (
  <svg viewBox="0 0 200 120" className="w-48 h-auto mx-auto" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="30" y="15" width="40" height="70" rx="4" strokeDasharray="2 2" opacity="0.6" />
    <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.5" />
    <path d="M 75 50 Q 100 30, 125 50" strokeWidth="3" fill="none" markerEnd="url(#arrow-rotate)" />
    <defs>
      <marker id="arrow-rotate" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
      </marker>
    </defs>
    <rect x="130" y="35" width="70" height="40" rx="4" />
    <circle cx="165" cy="55" r="6" fill="currentColor" />
  </svg>
)

interface WeeklyTimesheetExportProps {
  timesheet: any
  entries: any[]
  unbillable: any[]
  user: any
  companyInfo?: {
    name?: string
    address?: string
    phone?: string
    fax?: string
    website?: string
    services?: string[]
  }
}

export default function WeeklyTimesheetExport({ 
  timesheet, 
  entries, 
  unbillable, 
  user,
  companyInfo = {}
}: WeeklyTimesheetExportProps) {
  const exportRef = useRef<HTMLDivElement>(null)
  const [isPortrait, setIsPortrait] = useState(false)
  const [showExportFilter, setShowExportFilter] = useState(false)
  const [exportFilter, setExportFilter] = useState<{
    clientIds: string[]
    poIds: string[]
    systemIds: string[]
    includeNonBillable: boolean
  }>({ clientIds: [], poIds: [], systemIds: [], includeNonBillable: true })

  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.matchMedia('(orientation: portrait)').matches
      const isMobile = window.matchMedia('(max-width: 768px)').matches
      setIsPortrait(isMobile && portrait)
    }
    checkOrientation()
    const mql = window.matchMedia('(orientation: portrait)')
    const handler = () => checkOrientation()
    mql.addEventListener('change', handler)
    window.addEventListener('resize', handler)
    return () => {
      mql.removeEventListener('change', handler)
      window.removeEventListener('resize', handler)
    }
  }, [])

  const weekDates = getWeekDates(timesheet.week_ending)
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

  const calculateTotal = (entry: any): number => {
    return (entry.mon_hours || 0) + (entry.tue_hours || 0) + (entry.wed_hours || 0) + 
           (entry.thu_hours || 0) + (entry.fri_hours || 0) + (entry.sat_hours || 0) + (entry.sun_hours || 0)
  }

  const getDayTotal = (day: typeof days[number], entriesToUse = entries, unbillableToUse = unbillable): number => {
    const billable = entriesToUse.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
    const unbillableTotal = unbillableToUse.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
    return billable + unbillableTotal
  }

  const getBillableSubtotal = (day: typeof days[number], entriesToUse = entries): number => {
    return entriesToUse.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
  }

  const getUnbillableSubtotal = (day: typeof days[number], unbillableToUse = unbillable): number => {
    return unbillableToUse.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
  }

  const getBillableGrandTotal = (entriesToUse = entries): number => {
    return entriesToUse.reduce((sum, e) => sum + calculateTotal(e), 0)
  }

  const getUnbillableGrandTotal = (unbillableToUse = unbillable): number => {
    return unbillableToUse.reduce((sum, e) => sum + calculateTotal(e), 0)
  }

  const getGrandTotal = (entriesToUse = entries, unbillableToUse = unbillable): number => {
    return getBillableGrandTotal(entriesToUse) + getUnbillableGrandTotal(unbillableToUse)
  }

  const handlePrint = () => {
    window.print()
  }

  const escapeHtml = (text: string | null | undefined): string => {
    if (!text) return ''
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  const buildExportHtml = (entriesToUse = entries, unbillableToUse = unbillable) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const sig = (role: string) => {
      const s = timesheet.timesheet_signatures?.find((x: any) => x.signer_role === role)
      const name = s ? (s.signer_name || s.user_profiles?.name || '') : ''
      return s ? `${escapeHtml(name)} ${formatDateInEastern(s.signed_at)}` : ''
    }
    const showSupervisor = (user?.supervisor_id != null && user?.supervisor_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'supervisor')
    const showManager = (user?.manager_id != null && user?.manager_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'manager')
    const showFinal = (user?.final_approver_id != null && user?.final_approver_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'final_approver')

    return `
      <div style="font-family: Arial, sans-serif; font-size: 8pt; color: #000;">
        <div style="width: 100%; margin-bottom: 6px;"><img src="${origin}/ctg-header-logo.png" alt="CTG" style="width: 100%; height: auto; max-height: 70px; object-fit: contain;" /></div>
        <div style="margin-bottom: 6px;"><strong>Time Sheet For:</strong> ${escapeHtml(user?.name)}</div>
        <div style="margin-bottom: 6px;"><strong>From:</strong> ${formatDate(weekDates.start)} <strong>To:</strong> ${formatDate(weekDates.end)}</div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8pt;">
          <thead><tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">Client / Project #</th>
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">PO#</th>
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">Task Description</th>
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">System</th>
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">Deliverable</th>
            <th style="border: 1px solid #000; padding: 3px; text-align: left;">Activity</th>
            ${weekDates.days.map((d, i) => `<th style="border: 1px solid #000; padding: 3px; text-align: center;"><div>${format(d, 'EEE')}</div><div style="font-size: 7pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}
            <th style="border: 1px solid #000; padding: 3px; text-align: center;">Total</th>
          </tr></thead>
          <tbody>
            ${entriesToUse.map((e: any) => `<tr>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.sites?.name || e.client_project_id)}</td>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.purchase_orders?.po_number || e.po_id)}</td>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.task_description)}</td>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.system_name || e.systems?.name || '—')}</td>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.deliverables?.name || '—')}</td>
              <td style="border: 1px solid #000; padding: 3px;">${escapeHtml(e.activities?.name || '—')}</td>
              ${days.map(day => `<td style="border: 1px solid #000; padding: 3px; text-align: right;">${(e[`${day}_hours`] || 0).toFixed(2)}</td>`).join('')}
              <td style="border: 1px solid #000; padding: 3px; text-align: right; font-weight: bold;">${calculateTotal(e).toFixed(2)}</td>
            </tr>`).join('')}
            ${Array.from({ length: Math.max(0, 3 - entriesToUse.length) }).map(() => `<tr>${[1,2,3,4,5,6].map(() => '<td style="border: 1px solid #000; padding: 3px;"></td>').join('')}${days.map(() => '<td style="border: 1px solid #000; padding: 3px; text-align: right;">0.00</td>').join('')}<td style="border: 1px solid #000; padding: 3px; text-align: right;">0.00</td></tr>`).join('')}
            <tr style="background-color: #FFFF99; font-weight: bold;"><td colspan="6" style="border: 1px solid #000; padding: 3px;">Sub Totals</td>${days.map(day => `<td style="border: 1px solid #000; padding: 3px; text-align: right;">${getBillableSubtotal(day, entriesToUse).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 3px; text-align: right;">${getBillableGrandTotal(entriesToUse).toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top: 6px;">
          <div style="margin-bottom: 4px;"><strong>Employee Signature / Date:</strong> ${timesheet.employee_signed_at ? `${escapeHtml(user?.name)} ${formatDateInEastern(timesheet.employee_signed_at)}` : '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>
          ${showSupervisor ? `<div style="margin-bottom: 4px; text-align: right;"><strong>Supervisor Approval by / Date:</strong> ${sig('supervisor') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
          ${showManager ? `<div style="margin-bottom: 4px; text-align: right;"><strong>Manager Approval by / Date:</strong> ${sig('manager') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
          ${showFinal ? `<div style="text-align: right;"><strong>Final Approver by / Date:</strong> ${sig('final_approver') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
        </div>
        <div style="margin-top: 6px;"><h3 style="font-size: 9pt; margin-bottom: 4px;">UNBILLABLE TIME</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed;">
          <colgroup><col style="width:5.5rem"/><col/>${days.map(() => '<col style="width:3rem"/>').join('')}<col style="width:4.5rem"/></colgroup>
          <thead><tr style="background-color: #f0f0f0;"><th style="border: 1px solid #000; padding: 3px; white-space: nowrap;">Description</th><th style="border: 1px solid #000; padding: 3px; text-align: left;">Notes</th>${weekDates.days.map((d, i) => `<th style="border: 1px solid #000; padding: 3px; text-align: center;"><div>${format(d, 'EEE')}</div><div style="font-size: 7pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}<th style="border: 1px solid #000; padding: 3px; text-align: center; white-space: nowrap;">Total</th></tr></thead>
          <tbody>${unbillableToUse.map((u: any) => `<tr><td style="border: 1px solid #000; padding: 3px; font-weight: bold;">${escapeHtml(u.description)}</td><td style="border: 1px solid #000; padding: 3px;">${escapeHtml(u.notes || '')}</td>${days.map(day => `<td style="border: 1px solid #000; padding: 3px; text-align: right;">${(u[`${day}_hours`] || 0).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 3px; text-align: right; font-weight: bold;">${calculateTotal(u).toFixed(2)}</td></tr>`).join('')}
          <tr style="background-color: #FFFF99; font-weight: bold;"><td colspan="2" style="border: 1px solid #000; padding: 3px;">Sub Totals</td>${days.map(day => `<td style="border: 1px solid #000; padding: 3px; text-align: right;">${getUnbillableSubtotal(day, unbillableToUse).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 3px; text-align: right;">${getUnbillableGrandTotal(unbillableToUse).toFixed(2)}</td></tr>
          </tbody></table></div>
        <div style="background-color: #90EE90; font-weight: bold; padding: 6px; margin-top: 6px; text-align: right; font-size: 9pt;">GRAND TOTAL ${getGrandTotal(entriesToUse, unbillableToUse).toFixed(2)}</div>
      </div>
    `
  }

  const filterEntry = (e: any, f: typeof exportFilter) => {
    if (f.clientIds.length && !f.clientIds.includes(e.client_project_id)) return false
    if (f.poIds.length && !f.poIds.includes(e.po_id)) return false
    if (f.systemIds.length) {
      const sysId = e.system_id || (e.system_name ? `custom:${e.system_name}` : null)
      if (!sysId || !f.systemIds.includes(sysId)) return false
    }
    return true
  }

  const handleDownload = (entriesToUse = entries, unbillableToUse = unbillable) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const html = buildExportHtml(entriesToUse, unbillableToUse)
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Time Sheet - ${formatDate(weekDates.end)}</title>
          <style>
            @page { size: landscape; margin: 0.25in; }
            @media print { @page { size: landscape; margin: 0.25in; } }
            @media print { html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; } }
            @media print { .print-hide { display: none !important; } }
            body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 0; color: #000; }
            .fit-page-container {
              width: 10.5in;
              height: 7.5in;
              overflow: hidden;
              position: relative;
            }
            @media print {
              .fit-page-container {
                width: 10.5in !important;
                height: 7.5in !important;
                page-break-after: avoid;
              }
            }
            .fit-page-content {
              transform-origin: top left;
            }
            .print-hide { background: #fef3c7; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; border: 1px solid #f59e0b; border-radius: 6px; }
          </style>
        </head>
        <body>
          <div class="print-hide"><strong>Before printing:</strong> In the print dialog, open &quot;More settings&quot; and <strong>uncheck &quot;Headers and footers&quot;</strong> to remove the URL and page numbers from the output.</div>
          <div class="fit-page-container">
            <div class="fit-page-content" id="fit-content">${html}</div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    const applyScaleAndPrint = () => {
      try {
        if (printWindow.closed) return
        const container = printWindow.document.querySelector('.fit-page-container')
        const content = printWindow.document.getElementById('fit-content')
        if (container && content) {
          const cw = container.clientWidth
          const ch = container.clientHeight
          const contentWidth = content.scrollWidth
          const contentHeight = content.scrollHeight
          const scale = Math.min(cw / contentWidth, ch / contentHeight, 1)
          content.style.transform = `scale(${scale})`
          content.style.width = `${100 / scale}%`
          content.style.height = `${100 / scale}%`
        }
        printWindow.print()
      } catch {
        // User may have closed the print window
      }
    }
    // Wait for content (including images) to render, then scale to fit one page
    setTimeout(applyScaleAndPrint, 600)
  }

  const handleDownloadClick = () => {
    setShowExportFilter(true)
  }

  const handleExportWithFilter = () => {
    setShowExportFilter(false)
    const f = exportFilter
    const filteredEntries = f.clientIds.length || f.poIds.length || f.systemIds.length
      ? entries.filter((e: any) => filterEntry(e, f))
      : entries
    const filteredUnbillable = f.includeNonBillable ? unbillable : []
    handleDownload(filteredEntries, filteredUnbillable)
  }

  const filterClients = Array.from(new Map(
    entries.filter((e: any) => e.client_project_id).map((e: any) => [
      e.client_project_id,
      { id: e.client_project_id, name: e.sites?.name || e.client_project_id }
    ])
  ).values())
  const filterPOs = Array.from(new Map(
    entries.filter((e: any) => e.po_id).map((e: any) => [
      e.po_id,
      { id: e.po_id, name: e.purchase_orders?.po_number || e.po_id }
    ])
  ).values())
  const filterSystems = Array.from(new Map(
    entries.flatMap((e: any) => {
      const sysId = e.system_id || (e.system_name ? `custom:${e.system_name}` : null)
      const sysName = e.system_name || e.systems?.name || '—'
      return sysId ? [[sysId, { id: sysId, name: sysName }]] : []
    })
  ).values())

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={handleDownloadClick}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          title="Click to download PDF. In the print dialog, select 'Save as PDF' as the destination."
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>
        <button
          onClick={handlePrint}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 print:hidden">
        Note: The PDF download will open a print dialog. Select &quot;Save as PDF&quot; as the destination to save the file.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 print:hidden">
        To remove the URL and page number from the printed/PDF output, turn off <strong>Headers and footers</strong> in your browser&apos;s print dialog (e.g. in Chrome: click &quot;More settings&quot; and uncheck &quot;Headers and footers&quot;).
      </p>

      {/* Export Filter Popup */}
      {showExportFilter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Export Data
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Select which data to include. Leave all unchecked to include everything.
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client / Site</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {filterClients.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportFilter.clientIds.includes(c.id)}
                        onChange={e => setExportFilter(prev => ({
                          ...prev,
                          clientIds: e.target.checked ? [...prev.clientIds, c.id] : prev.clientIds.filter(id => id !== c.id)
                        }))}
                        className="rounded"
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                  {filterClients.length === 0 && (
                    <p className="text-sm text-gray-500">No clients in this timesheet</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PO</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {filterPOs.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportFilter.poIds.includes(p.id)}
                        onChange={e => setExportFilter(prev => ({
                          ...prev,
                          poIds: e.target.checked ? [...prev.poIds, p.id] : prev.poIds.filter(id => id !== p.id)
                        }))}
                        className="rounded"
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                  {filterPOs.length === 0 && (
                    <p className="text-sm text-gray-500">No POs in this timesheet</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Systems</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {filterSystems.map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportFilter.systemIds.includes(s.id)}
                        onChange={e => setExportFilter(prev => ({
                          ...prev,
                          systemIds: e.target.checked ? [...prev.systemIds, s.id] : prev.systemIds.filter(id => id !== s.id)
                        }))}
                        className="rounded"
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                  {filterSystems.length === 0 && (
                    <p className="text-sm text-gray-500">No systems in this timesheet</p>
                  )}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportFilter.includeNonBillable}
                    onChange={e => setExportFilter(prev => ({ ...prev, includeNonBillable: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Include non-billable hours</span>
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={handleExportWithFilter}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
              >
                Export PDF
              </button>
              <button
                onClick={() => setShowExportFilter(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: portrait shows rotate prompt; landscape shows scrollable timesheet with pinch zoom */}
      <div className={`relative ${isPortrait ? 'min-h-[400px]' : ''}`}>
        {isPortrait && (
          <div className="md:hidden absolute inset-0 z-20 flex flex-col items-center justify-center py-12 px-4 bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <RotateToLandscapeSvg />
            <p className="mt-4 text-center text-gray-700 dark:text-gray-300 font-medium">
              Rotate your device to landscape
            </p>
            <p className="mt-2 text-sm text-center text-gray-500 dark:text-gray-400">
              For the best view, turn your phone sideways. You can then pinch to zoom.
            </p>
          </div>
        )}
        <div
          className={`overflow-auto overscroll-contain touch-pan-x touch-pan-y print:overflow-visible ${isPortrait ? 'md:block max-md:invisible max-md:absolute max-md:inset-0 max-md:opacity-0' : 'max-md:min-h-[60vh]'}`}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div ref={exportRef} className={`timesheet-print-content bg-white p-8 print:p-0 ${!isPortrait ? 'md:min-w-0 min-w-max' : ''}`} style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: '#000' }}>
        {/* Header Logo */}
        <div className="header-logo mb-5">
          <img 
            src={`${typeof window !== 'undefined' ? window.location.origin : ''}/ctg-header-logo.png`}
            alt="Compliance Technology Group, Inc." 
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '150px', objectFit: 'contain' }}
            onError={(e) => {
              // Fallback if image doesn't exist - show text header
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const fallback = target.nextElementSibling as HTMLElement
              if (fallback) fallback.style.display = 'block'
            }}
          />
          <div style={{ display: 'none', color: '#000' }}>
            <div style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '5px', color: '#000' }}>
              {companyInfo.name || 'COMPLIANCE TECHNOLOGY GROUP, INC.'}
            </div>
            <div style={{ fontSize: '9pt', color: '#000' }}>
              {companyInfo.address || '505 South Franklin Street, West Chester, PA 19382'}
            </div>
            <div style={{ fontSize: '9pt', color: '#000' }}>
              {companyInfo.phone && `Phone ${companyInfo.phone}`}
              {companyInfo.fax && ` | Fax ${companyInfo.fax}`}
              {companyInfo.website && ` | ${companyInfo.website}`}
            </div>
            <div style={{ textAlign: 'right', fontSize: '9pt', color: '#000' }}>
              {(companyInfo.services || [
                'Commissioning & Validation',
                'Steam Quality Testing',
                'Controlled Environment Services'
              ]).map((service, idx) => (
                <div key={idx}>{service}</div>
              ))}
            </div>
            <div style={{ backgroundColor: '#0066CC', color: 'white', textAlign: 'center', padding: '10px', fontSize: '18pt', fontWeight: 'bold', margin: '20px 0' }}>
              Weekly Time Sheet
            </div>
          </div>
        </div>

        {/* Timesheet Info */}
        <div className="timesheet-info mb-2" style={{ color: '#000' }}>
          <div style={{ color: '#000' }}><strong style={{ color: '#000' }}>Time Sheet For:</strong> {user.name}</div>
          <div style={{ color: '#000' }}>
            <strong style={{ color: '#000' }}>From:</strong> {formatDate(weekDates.start)} <strong style={{ color: '#000' }}>To:</strong> {formatDate(weekDates.end)}
          </div>
        </div>

        {/* Billable Time Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Client / Project #</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>PO#</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Task Description</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>System</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Deliverable</th>
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Activity</th>
              {weekDates.days.map((day, idx) => (
                <th key={idx} className="day-header" style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>
                  <div>{format(day, 'EEE')}</div>
                  <div className="day-date" style={{ fontSize: '8pt', fontWeight: 'normal' }}>
                    {formatDateShort(weekDates.days[idx])}
                  </div>
                </th>
              ))}
              <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.sites?.name || entry.client_project_id || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.purchase_orders?.po_number || entry.po_id || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.task_description || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.system_name || entry.systems?.name || '—'}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.deliverables?.name || '—'}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                  {entry.activities?.name || '—'}
                </td>
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                    {(entry[`${day}_hours`] || 0).toFixed(2)}
                  </td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>
                  {calculateTotal(entry).toFixed(2)}
                </td>
              </tr>
            ))}
            
            {/* Add empty rows if needed */}
            {entries.length < 5 && Array.from({ length: 5 - entries.length }).map((_, idx) => (
              <tr key={`empty-${idx}`}>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                <td style={{ border: '1px solid #000', padding: '5px' }}></td>
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>0.00</td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>0.00</td>
              </tr>
            ))}

            {/* Sub Totals */}
            <tr className="subtotal-row" style={{ backgroundColor: '#FFFF99', fontWeight: 'bold', color: '#000' }}>
              <td colSpan={6} style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>Sub Totals</td>
              {days.map((day) => (
                <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                  {getBillableSubtotal(day).toFixed(2)}
                </td>
              ))}
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                {getBillableGrandTotal().toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signature Section - only show approval lines that exist on the user profile */}
        <div className="signature-section" style={{ marginTop: '15px', color: '#000' }}>
          <div style={{ marginBottom: '8px', color: '#000' }}>
            <strong style={{ color: '#000' }}>Employee Signature / Date:</strong>
            {timesheet.employee_signed_at ? (
              <span style={{ marginLeft: '10px', color: '#000' }}>
                {user.name} {formatDateInEastern(timesheet.employee_signed_at)}
              </span>
            ) : (
              <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
            )}
          </div>
          {(user.supervisor_id != null && user.supervisor_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'supervisor') ? (
            <div style={{ marginBottom: '8px', color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Supervisor Approval by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').signer_name) || timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').user_profiles?.name}{' '}
                  {formatDateInEastern(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').signed_at)}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          ) : null}
          {(user.manager_id != null && user.manager_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'manager') ? (
            <div style={{ marginBottom: '8px', color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Manager Approval by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').signer_name) || timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').user_profiles?.name}{' '}
                  {formatDateInEastern(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').signed_at)}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          ) : null}
          {(user.final_approver_id != null && user.final_approver_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'final_approver') ? (
            <div style={{ color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Final Approver by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'final_approver') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'final_approver').signer_name) || timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'final_approver').user_profiles?.name}{' '}
                  {formatDateInEastern(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'final_approver').signed_at)}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          ) : null}
        </div>

        {/* Unbillable Time Section */}
        <div className="unbillable-section" style={{ marginTop: '15px', color: '#000' }}>
          <h3 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '10px', color: '#000' }}>UNBILLABLE TIME</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' as const }}>
            <colgroup>
              <col style={{ width: '5.5rem' }} />
              <col />
              {weekDates.days.map((_, idx) => (
                <col key={idx} style={{ width: '3rem' }} />
              ))}
              <col style={{ width: '4.5rem' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', whiteSpace: 'nowrap' }}>Description</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Notes</th>
                {weekDates.days.map((day, idx) => (
                  <th key={idx} className="day-header" style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>
                    <div>{format(day, 'EEE')}</div>
                    <div className="day-date" style={{ fontSize: '8pt', fontWeight: 'normal' }}>
                      {formatDateShort(weekDates.days[idx])}
                    </div>
                  </th>
                ))}
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', whiteSpace: 'nowrap' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {unbillable.map((entry) => (
                <tr key={entry.id || entry.description}>
                  <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold', color: '#000' }}>
                    {entry.description}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>
                    {(entry as { notes?: string }).notes || '—'}
                  </td>
                  {days.map((day) => (
                    <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                      {(entry[`${day}_hours`] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>
                    {calculateTotal(entry).toFixed(2)}
                  </td>
                </tr>
              ))}
              
              {/* Sub Totals */}
              <tr className="subtotal-row" style={{ backgroundColor: '#FFFF99', fontWeight: 'bold', color: '#000' }}>
                <td colSpan={2} style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>Sub Totals</td>
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                    {getUnbillableSubtotal(day).toFixed(2)}
                  </td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', color: '#000' }}>
                  {getUnbillableGrandTotal().toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div className="grand-total-row" style={{ backgroundColor: '#90EE90', fontWeight: 'bold', padding: '10px', marginTop: '20px', textAlign: 'right', fontSize: '12pt', color: '#000' }}>
          <span style={{ marginRight: '20px', color: '#000' }}>GRAND TOTAL</span>
          <span style={{ color: '#000' }}>{getGrandTotal().toFixed(2)}</span>
        </div>
          </div>
        </div>
      </div>
    </div>
  )
}

