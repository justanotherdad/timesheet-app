'use client'

import { useRef } from 'react'
import { Download, Printer } from 'lucide-react'
import { formatDate, formatDateShort, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'

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

  const handleDownload = () => {
    if (!exportRef.current) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    // Get the origin for absolute image URLs
    const origin = window.location.origin

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Time Sheet - ${formatDate(weekDates.end)}</title>
          <style>
            @page {
              size: landscape;
              margin: 0.25in;
            }
            @media print {
              @page {
                size: landscape;
                margin: 0.25in;
              }
            }
            @media print {
              html, body {
                width: 100%;
                height: 100%;
              }
            }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 10pt;
              margin: 0;
              padding: 0;
              color: #000;
              width: 100%;
            }
            .header-logo {
              width: 100%;
              margin-bottom: 10px;
            }
            .header-logo img {
              width: 100%;
              height: auto;
              display: block;
              max-height: 150px;
              object-fit: contain;
            }
            .timesheet-info {
              margin-bottom: 15px;
              color: #000;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10px;
            }
            th, td {
              border: 1px solid #000;
              padding: 5px;
              text-align: left;
              color: #000;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
              text-align: center;
              color: #000;
            }
            .day-header {
              text-align: center;
            }
            .day-date {
              font-size: 8pt;
              font-weight: normal;
              color: #000;
            }
            .subtotal-row {
              background-color: #FFFF99;
              font-weight: bold;
              color: #000 !important;
            }
            .subtotal-row td {
              color: #000 !important;
            }
            .grand-total-row {
              background-color: #90EE90;
              font-weight: bold;
              color: #000;
            }
            .signature-section {
              margin-top: 30px;
            }
            .signature-line {
              border-top: 1px solid #000;
              width: 250px;
              margin-top: 40px;
              padding-top: 5px;
            }
            .text-center {
              text-align: center;
            }
            .text-right {
              text-align: right;
            }
          </style>
        </head>
        <body>
          ${exportRef.current.innerHTML.replace(/src="\/ctg-header-logo\.png"/g, `src="${origin}/ctg-header-logo.png"`)}
        </body>
      </html>
    `)
    printWindow.document.close()
    
    // Wait for content to load, then trigger print (which will open save dialog if Print to PDF is selected)
    setTimeout(() => {
      // For better PDF generation, users should select "Save as PDF" in the print dialog
      // This is the standard browser behavior - cannot force a direct save dialog
      printWindow.print()
    }, 1000)
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

      <div ref={exportRef} className="timesheet-print-content bg-white p-8 print:p-0" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: '#000' }}>
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
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>0.00</td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>0.00</td>
              </tr>
            ))}

            {/* Sub Totals */}
            <tr className="subtotal-row" style={{ backgroundColor: '#FFFF99', fontWeight: 'bold', color: '#000' }}>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '5px', color: '#000' }}>Sub Totals</td>
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
                {user.name} {new Date(timesheet.employee_signed_at).toLocaleDateString()}
              </span>
            ) : (
              <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
            )}
          </div>
          {user.supervisor_id != null && user.supervisor_id !== '' && (
            <div style={{ marginBottom: '8px', color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Supervisor Approval by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').user_profiles?.name}{' '}
                  {new Date(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').signed_at).toLocaleDateString()}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          )}
          {user.manager_id != null && user.manager_id !== '' && (
            <div style={{ marginBottom: '8px', color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Manager Approval by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').user_profiles?.name}{' '}
                  {new Date(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').signed_at).toLocaleDateString()}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          )}
          {user.final_approver_id != null && user.final_approver_id !== '' && (
            <div style={{ color: '#000', textAlign: 'right' }}>
              <strong style={{ color: '#000' }}>Final Approver by / Date:</strong>
              {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'final_approver') ? (
                <span style={{ marginLeft: '10px', color: '#000' }}>
                  {timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'final_approver').user_profiles?.name}{' '}
                  {new Date(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'final_approver').signed_at).toLocaleDateString()}
                </span>
              ) : (
                <span style={{ marginLeft: '10px', borderBottom: '1px solid #000', display: 'inline-block', minWidth: '200px' }}></span>
              )}
            </div>
          )}
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
  )
}

