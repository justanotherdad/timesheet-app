'use client'

import { useRef, useState, useEffect } from 'react'
import { Download, Printer } from 'lucide-react'
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

  const getDayTotal = (day: typeof days[number]): number => {
    const billable = entries.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
    const unbillableTotal = unbillable.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
    return billable + unbillableTotal
  }

  const getBillableSubtotal = (day: typeof days[number]): number => {
    return entries.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
  }

  const getUnbillableSubtotal = (day: typeof days[number]): number => {
    return unbillable.reduce((sum, e) => sum + (e[`${day}_hours`] || 0), 0)
  }

  const getBillableGrandTotal = (): number => {
    return entries.reduce((sum, e) => sum + calculateTotal(e), 0)
  }

  const getUnbillableGrandTotal = (): number => {
    return unbillable.reduce((sum, e) => sum + calculateTotal(e), 0)
  }

  const getGrandTotal = (): number => {
    return getBillableGrandTotal() + getUnbillableGrandTotal()
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

  const buildExportHtml = () => {
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
      <div style="font-family: Arial, sans-serif; font-size: 9pt; color: #000;">
        <div style="width: 100%; margin-bottom: 8px;"><img src="${origin}/ctg-header-logo.png" alt="CTG" style="width: 100%; height: auto; max-height: 120px; object-fit: contain;" /></div>
        <div style="margin-bottom: 8px;"><strong>Time Sheet For:</strong> ${escapeHtml(user?.name)}</div>
        <div style="margin-bottom: 8px;"><strong>From:</strong> ${formatDate(weekDates.start)} <strong>To:</strong> ${formatDate(weekDates.end)}</div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt;">
          <thead><tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">Client / Project #</th>
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">PO#</th>
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">Task Description</th>
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">System</th>
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">Deliverable</th>
            <th style="border: 1px solid #000; padding: 4px; text-align: left;">Activity</th>
            ${weekDates.days.map((d, i) => `<th style="border: 1px solid #000; padding: 4px; text-align: center;"><div>${format(d, 'EEE')}</div><div style="font-size: 7pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}
            <th style="border: 1px solid #000; padding: 4px; text-align: center;">Total</th>
          </tr></thead>
          <tbody>
            ${entries.map((e: any) => `<tr>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.sites?.name || e.client_project_id)}</td>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.purchase_orders?.po_number || e.po_id)}</td>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.task_description)}</td>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.system_name || e.systems?.name || '—')}</td>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.deliverables?.name || '—')}</td>
              <td style="border: 1px solid #000; padding: 4px;">${escapeHtml(e.activities?.name || '—')}</td>
              ${days.map(day => `<td style="border: 1px solid #000; padding: 4px; text-align: right;">${(e[`${day}_hours`] || 0).toFixed(2)}</td>`).join('')}
              <td style="border: 1px solid #000; padding: 4px; text-align: right; font-weight: bold;">${calculateTotal(e).toFixed(2)}</td>
            </tr>`).join('')}
            ${Array.from({ length: Math.max(0, 5 - entries.length) }).map(() => `<tr>${[1,2,3,4,5,6].map(() => '<td style="border: 1px solid #000; padding: 4px;"></td>').join('')}${days.map(() => '<td style="border: 1px solid #000; padding: 4px; text-align: right;">0.00</td>').join('')}<td style="border: 1px solid #000; padding: 4px; text-align: right;">0.00</td></tr>`).join('')}
            <tr style="background-color: #FFFF99; font-weight: bold;"><td colspan="6" style="border: 1px solid #000; padding: 4px;">Sub Totals</td>${days.map(day => `<td style="border: 1px solid #000; padding: 4px; text-align: right;">${getBillableSubtotal(day).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 4px; text-align: right;">${getBillableGrandTotal().toFixed(2)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top: 10px;">
          <div style="margin-bottom: 6px;"><strong>Employee Signature / Date:</strong> ${timesheet.employee_signed_at ? `${escapeHtml(user?.name)} ${formatDateInEastern(timesheet.employee_signed_at)}` : '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>
          ${showSupervisor ? `<div style="margin-bottom: 6px; text-align: right;"><strong>Supervisor Approval by / Date:</strong> ${sig('supervisor') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
          ${showManager ? `<div style="margin-bottom: 6px; text-align: right;"><strong>Manager Approval by / Date:</strong> ${sig('manager') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
          ${showFinal ? `<div style="text-align: right;"><strong>Final Approver by / Date:</strong> ${sig('final_approver') || '<span style="border-bottom: 1px solid #000; display: inline-block; min-width: 180px;"></span>'}</div>` : ''}
        </div>
        <div style="margin-top: 10px;"><h3 style="font-size: 10pt; margin-bottom: 6px;">UNBILLABLE TIME</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
          <thead><tr style="background-color: #f0f0f0;"><th style="border: 1px solid #000; padding: 4px;">Description</th>${weekDates.days.map((d, i) => `<th style="border: 1px solid #000; padding: 4px; text-align: center;"><div>${format(d, 'EEE')}</div><div style="font-size: 7pt;">${formatDateShort(weekDates.days[i])}</div></th>`).join('')}<th style="border: 1px solid #000; padding: 4px; text-align: center;">Total</th></tr></thead>
          <tbody>${unbillable.map((u: any) => `<tr><td style="border: 1px solid #000; padding: 4px; font-weight: bold;">${escapeHtml(u.description)}</td>${days.map(day => `<td style="border: 1px solid #000; padding: 4px; text-align: right;">${(u[`${day}_hours`] || 0).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 4px; text-align: right; font-weight: bold;">${calculateTotal(u).toFixed(2)}</td></tr>`).join('')}
          <tr style="background-color: #FFFF99; font-weight: bold;"><td style="border: 1px solid #000; padding: 4px;">Sub Totals</td>${days.map(day => `<td style="border: 1px solid #000; padding: 4px; text-align: right;">${getUnbillableSubtotal(day).toFixed(2)}</td>`).join('')}<td style="border: 1px solid #000; padding: 4px; text-align: right;">${getUnbillableGrandTotal().toFixed(2)}</td></tr>
          </tbody></table></div>
        <div style="background-color: #90EE90; font-weight: bold; padding: 8px; margin-top: 10px; text-align: right; font-size: 11pt;">GRAND TOTAL ${getGrandTotal().toFixed(2)}</div>
      </div>
    `
  }

  const handleDownload = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const origin = window.location.origin
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Time Sheet - ${formatDate(weekDates.end)}</title>
          <style>
            @page { size: landscape; margin: 0.25in; }
            @media print { @page { size: landscape; margin: 0.25in; } }
            @media print { html, body { width: 100%; height: 100%; margin: 0; padding: 0; } }
            @media print { .print-hide { display: none !important; } }
            body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 0; color: #000; }
            .fit-page { transform-origin: top left; }
            .print-hide { background: #fef3c7; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; border: 1px solid #f59e0b; border-radius: 6px; }
            @media print {
              .fit-page { width: 11in; height: 8.5in; overflow: hidden; }
            }
          </style>
        </head>
        <body>
          <div class="print-hide"><strong>Before printing:</strong> In the print dialog, open &quot;More settings&quot; and <strong>uncheck &quot;Headers and footers&quot;</strong> to remove the URL and page numbers from the output.</div>
          <div class="fit-page">${buildExportHtml()}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={handleDownload}
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Description</th>
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
              {unbillable.map((entry) => (
                <tr key={entry.id || entry.description}>
                  <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold', color: '#000' }}>
                    {entry.description}
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
                <td style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>Sub Totals</td>
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

