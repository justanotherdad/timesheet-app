'use client'

import { useMemo, useState, useEffect } from 'react'
import { Download, Printer, Filter } from 'lucide-react'
import { formatDate, formatDateShort, formatDateInEastern, formatHoursAmount, getWeekDates } from '@/lib/utils'
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
}

/** Explicit column widths for the billable table that sum to ≤10.5in (landscape minus margins).
 *  These same day-column widths are reused in the unbillable table so the columns line up. */
const BILLABLE_COL_WIDTHS = {
  client:      '1.25in',
  po:          '1.05in',
  task:        '1.35in',
  system:      '0.78in',
  deliverable: '0.78in',
  activity:    '0.78in',
  day:         '0.44in', // × 7 = 3.08in
  total:       '0.47in',
}

export default function WeeklyTimesheetExport({ 
  timesheet, 
  entries, 
  unbillable, 
  user,
}: WeeklyTimesheetExportProps) {
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

  /**
   * Wrap the timesheet HTML in a full document with the @page landscape CSS
   * and the zoom-fit script. We use this for BOTH the on-page preview
   * (rendered into an iframe) and the popup window that opens for Print /
   * Download — same HTML in both places so the saved PDF matches exactly
   * what the user sees on screen, no more JSX-vs-HTML drift.
   */
  const buildFullExportDoc = (
    entriesToUse: any[],
    unbillableToUse: any[],
    options: { autoPrint: boolean }
  ): string => {
    const html = buildExportHtml(entriesToUse, unbillableToUse)
    const printHint = options.autoPrint
      ? `<div class="print-hide">
          <strong>Before printing:</strong> In the print dialog, open &quot;More settings&quot;
          and <strong>uncheck &quot;Headers and footers&quot;</strong> to remove the URL and page numbers.
        </div>`
      : ''
    const autoPrintScript = options.autoPrint ? `setTimeout(function() { window.print(); }, 250);` : ''
    return `<!DOCTYPE html>
<html>
  <head>
    <title>Weekly Time Sheet - ${formatDate(weekDates.end)}</title>
    <style>
      @page { size: landscape; margin: 0.25in; }
      @media print {
        @page { size: landscape; margin: 0.25in; }
        html, body { margin: 0; padding: 0; }
        .print-hide { display: none !important; }
        /* Safety net: never let content bleed past the page boundary */
        .timesheet-page { overflow: hidden; }
      }
      body { font-family: Arial, sans-serif; font-size: 8pt; margin: 0.1in; padding: 0; color: #000; }
      .print-hide {
        background: #fef3c7; padding: 8px 12px; margin-bottom: 12px;
        font-size: 11px; border: 1px solid #f59e0b; border-radius: 6px;
      }
    </style>
    <script>
      // Auto-fit: scale the timesheet down via CSS zoom so it never overflows
      // the printable area of one landscape page. Same target as the bulk
      // admin export so output matches across paths.
      var FIT_TARGET_H = 720;
      function fitPages() {
        var pages = document.querySelectorAll('.timesheet-page');
        pages.forEach(function(page) {
          var h = page.scrollHeight;
          if (h > FIT_TARGET_H) {
            page.style.zoom = (FIT_TARGET_H / h).toFixed(4);
            page.style.overflow = 'hidden';
          }
        });
      }
      window.addEventListener('load', function() {
        fitPages();
        ${autoPrintScript}
      });
    </script>
  </head>
  <body>
    ${printHint}
    ${html}
  </body>
</html>`
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(buildFullExportDoc(entries, unbillable, { autoPrint: true }))
    printWindow.document.close()
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

    // Shared colgroup used by BOTH tables so day columns align visually
    const billableColgroup = `<colgroup>
      <col style="width:${BILLABLE_COL_WIDTHS.client}"/>
      <col style="width:${BILLABLE_COL_WIDTHS.po}"/>
      <col style="width:${BILLABLE_COL_WIDTHS.task}"/>
      <col style="width:${BILLABLE_COL_WIDTHS.system}"/>
      <col style="width:${BILLABLE_COL_WIDTHS.deliverable}"/>
      <col style="width:${BILLABLE_COL_WIDTHS.activity}"/>
      ${days.map(() => `<col style="width:${BILLABLE_COL_WIDTHS.day}"/>`).join('')}
      <col style="width:${BILLABLE_COL_WIDTHS.total}"/>
    </colgroup>`

    const notesSection = timesheet.notes
      ? `<div style="margin-top:5px; margin-bottom:5px;">
           <strong>Notes:</strong>
           <div style="border:1px solid #ccc; padding:4px; margin-top:2px; white-space:pre-wrap; font-size:8pt;">${escapeHtml(timesheet.notes)}</div>
         </div>`
      : ''

    return `
      <div class="timesheet-page" style="font-family: Arial, sans-serif; font-size: 8pt; color: #000;">
        <div style="width: 100%; margin-bottom: 5px;"><img src="${origin}/ctg-header-logo.png" alt="CTG" style="width: 100%; height: auto; max-height: 70px; object-fit: contain;" /></div>
        <div style="margin-bottom: 4px;"><strong>Time Sheet For:</strong> ${escapeHtml(user?.name)}</div>
        <div style="margin-bottom: 4px;"><strong>From:</strong> ${formatDate(weekDates.start)} <strong>To:</strong> ${formatDate(weekDates.end)}</div>

        <!-- Billable table with fixed layout so all columns fit on landscape page -->
        <table style="width:100%; border-collapse:collapse; margin-bottom:4px; font-size:7.5pt; table-layout:fixed;">
          ${billableColgroup}
          <thead><tr style="background-color:#f0f0f0;">
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">Client / Project #</th>
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">PO#</th>
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">Task Description</th>
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">System</th>
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">Deliverable</th>
            <th style="border:1px solid #000;padding:2px 3px;text-align:left;overflow:hidden;">Activity</th>
            ${weekDates.days.map((d, i) => `<th style="border:1px solid #000;padding:2px 1px;text-align:center;"><div>${format(d, 'EEE')}</div><div style="font-size:6.5pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}
            <th style="border:1px solid #000;padding:2px 3px;text-align:center;">Total</th>
          </tr></thead>
          <tbody>
            ${entriesToUse.map((e: any) => `<tr>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.sites?.name || e.client_project_id)}</td>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.purchase_orders?.po_number || e.po_id)}</td>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.task_description)}</td>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.system_name || e.systems?.name || '—')}</td>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.deliverables?.name || '—')}</td>
              <td style="border:1px solid #000;padding:2px 3px;overflow:hidden;">${escapeHtml(e.activities?.name || '—')}</td>
              ${days.map(day => `<td style="border:1px solid #000;padding:2px 1px;text-align:right;">${formatHoursAmount(Number(e[`${day}_hours`]) || 0)}</td>`).join('')}
              <td style="border:1px solid #000;padding:2px 3px;text-align:right;font-weight:bold;">${formatHoursAmount(calculateTotal(e))}</td>
            </tr>`).join('')}
            ${Array.from({ length: Math.max(0, 3 - entriesToUse.length) }).map(() => `<tr>
              ${[1,2,3,4,5,6].map(() => '<td style="border:1px solid #000;padding:2px 3px;"></td>').join('')}
              ${days.map(() => '<td style="border:1px solid #000;padding:2px 1px;text-align:right;">0.00</td>').join('')}
              <td style="border:1px solid #000;padding:2px 3px;text-align:right;">0.00</td>
            </tr>`).join('')}
            <tr style="background-color:#FFFF99;font-weight:bold;">
              <td colspan="6" style="border:1px solid #000;padding:2px 3px;">Sub Totals</td>
              ${days.map(day => `<td style="border:1px solid #000;padding:2px 1px;text-align:right;">${formatHoursAmount(getBillableSubtotal(day, entriesToUse))}</td>`).join('')}
              <td style="border:1px solid #000;padding:2px 3px;text-align:right;">${formatHoursAmount(getBillableGrandTotal(entriesToUse))}</td>
            </tr>
          </tbody>
        </table>

        <!-- Signatures -->
        <div style="margin-top:4px;">
          <div style="margin-bottom:3px;"><strong>Employee Signature / Date:</strong> ${timesheet.employee_signed_at ? `${escapeHtml(user?.name)} ${formatDateInEastern(timesheet.employee_signed_at)}` : '<span style="border-bottom:1px solid #000;display:inline-block;min-width:150px;"></span>'}</div>
          ${showSupervisor ? `<div style="margin-bottom:3px;text-align:right;"><strong>Supervisor Approval by / Date:</strong> ${sig('supervisor') || '<span style="border-bottom:1px solid #000;display:inline-block;min-width:150px;"></span>'}</div>` : ''}
          ${showManager ? `<div style="margin-bottom:3px;text-align:right;"><strong>Manager Approval by / Date:</strong> ${sig('manager') || '<span style="border-bottom:1px solid #000;display:inline-block;min-width:150px;"></span>'}</div>` : ''}
          ${showFinal ? `<div style="text-align:right;"><strong>Final Approver by / Date:</strong> ${sig('final_approver') || '<span style="border-bottom:1px solid #000;display:inline-block;min-width:150px;"></span>'}</div>` : ''}
        </div>

        <!-- Unbillable table (same day-column widths as billable for visual alignment) -->
        <div style="margin-top:5px;">
          <h3 style="font-size:8.5pt;font-weight:bold;margin-bottom:3px;">UNBILLABLE TIME</h3>
          <table style="width:100%;border-collapse:collapse;font-size:7.5pt;table-layout:fixed;">
            <colgroup>
              <col style="width:0.65in"/>
              <col/>
              ${days.map(() => `<col style="width:${BILLABLE_COL_WIDTHS.day}"/>`).join('')}
              <col style="width:${BILLABLE_COL_WIDTHS.total}"/>
            </colgroup>
            <thead><tr style="background-color:#f0f0f0;">
              <th style="border:1px solid #000;padding:2px 3px;white-space:nowrap;">Description</th>
              <th style="border:1px solid #000;padding:2px 3px;text-align:left;">Notes</th>
              ${weekDates.days.map((d, i) => `<th style="border:1px solid #000;padding:2px 1px;text-align:center;"><div>${format(d, 'EEE')}</div><div style="font-size:6.5pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}
              <th style="border:1px solid #000;padding:2px 3px;text-align:center;white-space:nowrap;">Total</th>
            </tr></thead>
            <tbody>
              ${unbillableToUse.map((u: any) => `<tr>
                <td style="border:1px solid #000;padding:2px 3px;font-weight:bold;">${escapeHtml(u.description)}</td>
                <td style="border:1px solid #000;padding:2px 3px;">${escapeHtml(u.notes || '')}</td>
                ${days.map(day => `<td style="border:1px solid #000;padding:2px 1px;text-align:right;">${formatHoursAmount(Number(u[`${day}_hours`]) || 0)}</td>`).join('')}
                <td style="border:1px solid #000;padding:2px 3px;text-align:right;font-weight:bold;">${formatHoursAmount(calculateTotal(u))}</td>
              </tr>`).join('')}
              <tr style="background-color:#FFFF99;font-weight:bold;">
                <td colspan="2" style="border:1px solid #000;padding:2px 3px;">Sub Totals</td>
                ${days.map(day => `<td style="border:1px solid #000;padding:2px 1px;text-align:right;">${formatHoursAmount(getUnbillableSubtotal(day, unbillableToUse))}</td>`).join('')}
                <td style="border:1px solid #000;padding:2px 3px;text-align:right;">${formatHoursAmount(getUnbillableGrandTotal(unbillableToUse))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${notesSection}
        <div style="background-color:#90EE90;font-weight:bold;padding:5px;margin-top:5px;text-align:right;font-size:8.5pt;">GRAND TOTAL &nbsp; ${formatHoursAmount(getGrandTotal(entriesToUse, unbillableToUse))}</div>
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

  const handleDownload = (entriesToUse: any[] = entries, unbillableToUse: any[] = unbillable) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(buildFullExportDoc(entriesToUse, unbillableToUse, { autoPrint: true }))
    printWindow.document.close()
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

  // The preview iframe shows ALL data unconditionally — the export-time filter
  // (clientIds / poIds / systemIds / includeNonBillable) is applied only when
  // the user actually clicks Export PDF. Re-running buildFullExportDoc on
  // every keystroke would reload the iframe and steal focus, so memoize.
  const previewDoc = useMemo(
    () => buildFullExportDoc(entries, unbillable, { autoPrint: false }),
    // buildFullExportDoc closes over `timesheet`, `weekDates`, `user`, etc., but
    // for this component those are static for the lifetime of the page. We only
    // want to re-render the iframe when the underlying entries/unbillable
    // change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, unbillable]
  )

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

      {/* Preview iframe — renders the EXACT same HTML that the Print/Download
          popups write, so what the user sees here matches what gets saved
          (Option B: tight one-page-per-timesheet layout). The zoom-fit script
          inside the iframe shrinks oversized timesheets to fit a single page,
          mirroring the saved PDF. */}
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
        <iframe
          srcDoc={previewDoc}
          title="Timesheet preview"
          className={`w-full bg-white border border-gray-200 dark:border-gray-700 rounded-lg ${isPortrait ? 'md:block max-md:invisible max-md:absolute max-md:inset-0 max-md:opacity-0' : ''}`}
          style={{ height: '780px' }}
        />
        {/* Hidden legacy JSX preview removed — preview now uses the iframe
            above so it's byte-identical to the saved PDF. If you need to
            restore a JSX-based preview, see git history for this file. */}
      </div>
    </div>
  )
}

