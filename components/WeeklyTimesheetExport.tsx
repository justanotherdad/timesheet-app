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

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Time Sheet - ${formatDate(weekDates.end)}</title>
          <style>
            @media print {
              @page { margin: 0.5in; }
            }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 10pt;
              margin: 0;
              padding: 0;
            }
            .header {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .company-info {
              flex: 1;
            }
            .company-name {
              font-size: 14pt;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .services {
              text-align: right;
              font-size: 9pt;
            }
            .banner {
              background-color: #0066CC;
              color: white;
              text-align: center;
              padding: 10px;
              font-size: 18pt;
              font-weight: bold;
              margin: 20px 0;
            }
            .timesheet-info {
              margin-bottom: 15px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #000;
              padding: 5px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
              text-align: center;
            }
            .day-header {
              text-align: center;
            }
            .day-date {
              font-size: 8pt;
              font-weight: normal;
            }
            .subtotal-row {
              background-color: #FFFF99;
              font-weight: bold;
            }
            .grand-total-row {
              background-color: #90EE90;
              font-weight: bold;
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
          ${exportRef.current.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={handleDownload}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
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

      <div ref={exportRef} className="bg-white p-8 print:p-0" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt' }}>
        {/* Header */}
        <div className="header mb-5">
          <div className="company-info">
            <div className="company-name">
              {companyInfo.name || 'COMPLIANCE TECHNOLOGY GROUP, INC.'}
            </div>
            <div style={{ fontSize: '9pt' }}>
              {companyInfo.address || '505 South Franklin Street, West Chester, PA 19382'}
            </div>
            <div style={{ fontSize: '9pt' }}>
              {companyInfo.phone && `Phone ${companyInfo.phone}`}
              {companyInfo.fax && ` | Fax ${companyInfo.fax}`}
              {companyInfo.website && ` | ${companyInfo.website}`}
            </div>
          </div>
          <div className="services">
            {(companyInfo.services || [
              'Commissioning & Validation',
              'Steam Quality Testing',
              'Controlled Environment Services'
            ]).map((service, idx) => (
              <div key={idx} style={{ fontSize: '9pt' }}>{service}</div>
            ))}
          </div>
        </div>

        {/* Banner */}
        <div className="banner" style={{ backgroundColor: '#0066CC', color: 'white', textAlign: 'center', padding: '10px', fontSize: '18pt', fontWeight: 'bold', margin: '20px 0' }}>
          Weekly Time Sheet
        </div>

        {/* Timesheet Info */}
        <div className="timesheet-info mb-4">
          <div><strong>Time Sheet For:</strong> {user.name}</div>
          <div>
            <strong>From:</strong> {formatDate(weekDates.start)} <strong>To:</strong> {formatDate(weekDates.end)}
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
                  <div>{format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
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
                <td style={{ border: '1px solid #000', padding: '5px' }}>
                  {entry.sites?.name || entry.client_project_id || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px' }}>
                  {entry.purchase_orders?.po_number || entry.po_id || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '5px' }}>
                  {entry.task_description || ''}
                </td>
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                    {(entry[`${day}_hours`] || 0).toFixed(2)}
                  </td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>
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
            <tr className="subtotal-row" style={{ backgroundColor: '#FFFF99', fontWeight: 'bold' }}>
              <td colSpan={3} style={{ border: '1px solid #000', padding: '5px' }}>Sub Totals</td>
              {days.map((day) => (
                <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                  {getBillableSubtotal(day).toFixed(2)}
                </td>
              ))}
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                {getBillableGrandTotal().toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signature Section */}
        <div className="signature-section" style={{ marginTop: '30px' }}>
          <div style={{ marginBottom: '15px' }}>
            <strong>Employee Signature / Date:</strong>
            {timesheet.employee_signed_at ? (
              <span style={{ marginLeft: '10px' }}>
                {user.name} {new Date(timesheet.employee_signed_at).toLocaleDateString()}
              </span>
            ) : (
              <div className="signature-line" style={{ borderTop: '1px solid #000', width: '250px', marginTop: '10px' }}></div>
            )}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong>Supervisor Approval by / Date:</strong>
            {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor') ? (
              <span style={{ marginLeft: '10px' }}>
                {timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').user_profiles?.name}{' '}
                {new Date(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'supervisor').signed_at).toLocaleDateString()}
              </span>
            ) : (
              <div className="signature-line" style={{ borderTop: '1px solid #000', width: '250px', marginTop: '10px' }}></div>
            )}
          </div>
          <div>
            <strong>Manager Approval by / Date:</strong>
            {timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager') ? (
              <span style={{ marginLeft: '10px' }}>
                {timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').user_profiles?.name}{' '}
                {new Date(timesheet.timesheet_signatures.find((s: any) => s.signer_role === 'manager').signed_at).toLocaleDateString()}
              </span>
            ) : (
              <div className="signature-line" style={{ borderTop: '1px solid #000', width: '250px', marginTop: '10px' }}></div>
            )}
          </div>
        </div>

        {/* Unbillable Time Section */}
        <div style={{ marginTop: '30px' }}>
          <h3 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '10px' }}>UNBILLABLE TIME</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left' }}>Description</th>
                {weekDates.days.map((day, idx) => (
                  <th key={idx} className="day-header" style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>
                    <div>{format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
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
                  <td style={{ border: '1px solid #000', padding: '5px', fontWeight: 'bold' }}>
                    {entry.description}
                  </td>
                  {days.map((day) => (
                    <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                      {(entry[`${day}_hours`] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right', fontWeight: 'bold' }}>
                    {calculateTotal(entry).toFixed(2)}
                  </td>
                </tr>
              ))}
              
              {/* Sub Totals */}
              <tr className="subtotal-row" style={{ backgroundColor: '#FFFF99', fontWeight: 'bold' }}>
                <td style={{ border: '1px solid #000', padding: '5px' }}>Sub Totals</td>
                {days.map((day) => (
                  <td key={day} style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                    {getUnbillableSubtotal(day).toFixed(2)}
                  </td>
                ))}
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>
                  {getUnbillableGrandTotal().toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div className="grand-total-row" style={{ backgroundColor: '#90EE90', fontWeight: 'bold', padding: '10px', marginTop: '20px', textAlign: 'right', fontSize: '12pt' }}>
          <span style={{ marginRight: '20px' }}>GRAND TOTAL</span>
          <span>{getGrandTotal().toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

