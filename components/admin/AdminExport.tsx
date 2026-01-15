'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, File } from 'lucide-react'
import { formatWeekEnding, formatDate, formatDateShort, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'

interface AdminExportProps {
  timesheets: any[]
}

type ExportFormat = 'csv' | 'excel' | 'pdf'

export default function AdminExport({ timesheets }: AdminExportProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)

  // Get unique week endings
  const weekEndings = Array.from(
    new Set(timesheets.map(ts => ts.week_ending))
  ).sort().reverse()

  // Filter timesheets by selected week
  const filteredTimesheets = selectedWeek
    ? timesheets.filter(ts => ts.week_ending === selectedWeek)
    : timesheets

  const getExportData = () => {
    return selectedTimesheets.length > 0
      ? timesheets.filter(ts => selectedTimesheets.includes(ts.id))
      : filteredTimesheets
  }

  const handleExportCSV = () => {
    const toExport = getExportData()

    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }

    // Create CSV content
    const headers = ['Week Ending', 'Employee', 'Email', 'Site', 'PO', 'Hours', 'Status']
    const rows = toExport.map(ts => [
      formatWeekEnding(ts.week_ending),
      ts.user_profiles?.name || '',
      ts.user_profiles?.email || '',
      ts.sites?.name || '',
      ts.purchase_orders?.po_number || '',
      ts.hours || 0,
      ts.status,
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timesheets-${selectedWeek || 'all'}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleExportExcel = async () => {
    const toExport = getExportData()

    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }

    try {
      // Dynamic import for xlsx
      const XLSX = await import('xlsx')
      
      // Prepare data
      const data = toExport.map(ts => ({
        'Week Ending': formatWeekEnding(ts.week_ending),
        'Employee': ts.user_profiles?.name || '',
        'Email': ts.user_profiles?.email || '',
        'Site': ts.sites?.name || '',
        'PO': ts.purchase_orders?.po_number || '',
        'Hours': ts.hours || 0,
        'Status': ts.status,
      }))

      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Timesheets')

      // Generate Excel file
      XLSX.writeFile(wb, `timesheets-${selectedWeek || 'all'}-${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Error exporting to Excel. Please make sure the xlsx library is installed: npm install xlsx')
    }
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

  const handleExportPDF = async () => {
    const toExport = getExportData()

    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }

    setExporting(true)

    try {
      // Fetch full timesheet data for each selected timesheet
      const timesheetIds = toExport.map(ts => ts.id)
      
      // Fetch entries and unbillable for all timesheets
      const response = await fetch('/api/admin/export-timesheets-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetIds })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch timesheet data')
      }

      const timesheetData = await response.json()
      const origin = window.location.origin

      // Create a new window for PDF generation
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        alert('Please allow popups to generate PDF')
        setExporting(false)
        return
      }

      // Generate HTML for all timesheets
      let htmlContent = ''
      
      timesheetData.forEach((data: any, index: number) => {
        const { timesheet, entries, unbillable, user } = data
        const weekDates = getWeekDates(timesheet.week_ending)
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

        const calculateTotal = (entry: any): number => {
          return (entry.mon_hours || 0) + (entry.tue_hours || 0) + (entry.wed_hours || 0) + 
                 (entry.thu_hours || 0) + (entry.fri_hours || 0) + (entry.sat_hours || 0) + (entry.sun_hours || 0)
        }

        const getBillableSubtotal = (day: typeof days[number]): number => {
          return entries.reduce((sum: number, e: any) => sum + (e[`${day}_hours`] || 0), 0)
        }

        const getUnbillableSubtotal = (day: typeof days[number]): number => {
          return unbillable.reduce((sum: number, e: any) => sum + (e[`${day}_hours`] || 0), 0)
        }

        const getBillableGrandTotal = (): number => {
          return entries.reduce((sum: number, e: any) => sum + calculateTotal(e), 0)
        }

        const getUnbillableGrandTotal = (): number => {
          return unbillable.reduce((sum: number, e: any) => sum + calculateTotal(e), 0)
        }

        const getGrandTotal = (): number => {
          return getBillableGrandTotal() + getUnbillableGrandTotal()
        }

        // Add page break for multiple timesheets (except first)
        if (index > 0) {
          htmlContent += '<div style="page-break-before: always;"></div>'
        }

        htmlContent += `
          <div style="font-family: Arial, sans-serif; font-size: 10pt; color: #000; margin-bottom: 40px;">
            <!-- Header Logo -->
            <div style="width: 100%; margin-bottom: 10px;">
              <img 
                src="${origin}/ctg-header-logo.png"
                alt="Compliance Technology Group, Inc." 
                style="width: 100%; height: auto; display: block; max-height: 150px; object-fit: contain;"
              />
            </div>

            <!-- Timesheet Info -->
            <div style="margin-bottom: 10px; color: #000;">
              <div style="color: #000;"><strong style="color: #000;">Time Sheet For:</strong> ${escapeHtml(user.name)}</div>
              <div style="color: #000;">
                <strong style="color: #000;">From:</strong> ${formatDate(weekDates.start)} <strong style="color: #000;">To:</strong> ${formatDate(weekDates.end)}
              </div>
            </div>

            <!-- Billable Time Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
              <thead>
                <tr style="background-color: #f0f0f0;">
                  <th style="border: 1px solid #000; padding: 5px; text-align: left;">Client / Project #</th>
                  <th style="border: 1px solid #000; padding: 5px; text-align: left;">PO#</th>
                  <th style="border: 1px solid #000; padding: 5px; text-align: left;">Task Description</th>
                  ${weekDates.days.map((day, idx) => `
                    <th style="border: 1px solid #000; padding: 5px; text-align: center;">
                      <div>${format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
                      <div style="font-size: 8pt; font-weight: normal;">${formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  `).join('')}
                  <th style="border: 1px solid #000; padding: 5px; text-align: center;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map((entry: any) => `
                  <tr>
                    <td style="border: 1px solid #000; padding: 5px; color: #000;">${escapeHtml(entry.sites?.name || entry.client_project_id)}</td>
                    <td style="border: 1px solid #000; padding: 5px; color: #000;">${escapeHtml(entry.purchase_orders?.po_number || entry.po_id)}</td>
                    <td style="border: 1px solid #000; padding: 5px; color: #000;">${escapeHtml(entry.task_description)}</td>
                    ${days.map(day => `
                      <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${(entry[`${day}_hours`] || 0).toFixed(2)}</td>
                    `).join('')}
                    <td style="border: 1px solid #000; padding: 5px; text-align: right; font-weight: bold; color: #000;">${calculateTotal(entry).toFixed(2)}</td>
                  </tr>
                `).join('')}
                ${Array.from({ length: Math.max(0, 5 - entries.length) }).map(() => `
                  <tr>
                    <td style="border: 1px solid #000; padding: 5px;"></td>
                    <td style="border: 1px solid #000; padding: 5px;"></td>
                    <td style="border: 1px solid #000; padding: 5px;"></td>
                    ${days.map(() => `<td style="border: 1px solid #000; padding: 5px; text-align: right;">0.00</td>`).join('')}
                    <td style="border: 1px solid #000; padding: 5px; text-align: right;">0.00</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #FFFF99; font-weight: bold; color: #000;">
                  <td colspan="3" style="border: 1px solid #000; padding: 5px; color: #000;">Sub Totals</td>
                  ${days.map(day => `
                    <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${getBillableSubtotal(day).toFixed(2)}</td>
                  `).join('')}
                  <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${getBillableGrandTotal().toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <!-- Signature Section -->
            <div style="margin-top: 15px; color: #000;">
              <div style="margin-bottom: 8px; color: #000;">
                <strong style="color: #000;">Employee Signature / Date:</strong>
                ${timesheet.employee_signed_at ? `
                  <span style="margin-left: 10px; color: #000;">${escapeHtml(user.name)} ${new Date(timesheet.employee_signed_at).toLocaleDateString()}</span>
                ` : `
                  <span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>
                `}
              </div>
              <div style="margin-bottom: 8px; color: #000; text-align: right;">
                <strong style="color: #000;">Supervisor Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor')
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(sig.user_profiles?.name)} ${new Date(sig.signed_at).toLocaleDateString()}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              <div style="color: #000; text-align: right;">
                <strong style="color: #000;">Manager Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager')
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(sig.user_profiles?.name)} ${new Date(sig.signed_at).toLocaleDateString()}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
            </div>

            <!-- Unbillable Time Section -->
            <div style="margin-top: 15px; color: #000;">
              <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px; color: #000;">UNBILLABLE TIME</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f0f0f0;">
                    <th style="border: 1px solid #000; padding: 5px; text-align: left;">Description</th>
                    ${weekDates.days.map((day, idx) => `
                      <th style="border: 1px solid #000; padding: 5px; text-align: center;">
                        <div>${format(day, 'EEE').toUpperCase().slice(0, 2)}</div>
                        <div style="font-size: 8pt; font-weight: normal;">${formatDateShort(weekDates.days[idx])}</div>
                      </th>
                    `).join('')}
                    <th style="border: 1px solid #000; padding: 5px; text-align: center;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${unbillable.map((entry: any) => `
                    <tr>
                      <td style="border: 1px solid #000; padding: 5px; font-weight: bold; color: #000;">${entry.description}</td>
                      ${days.map(day => `
                        <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${(entry[`${day}_hours`] || 0).toFixed(2)}</td>
                      `).join('')}
                      <td style="border: 1px solid #000; padding: 5px; text-align: right; font-weight: bold; color: #000;">${calculateTotal(entry).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  <tr style="background-color: #FFFF99; font-weight: bold; color: #000;">
                    <td style="border: 1px solid #000; padding: 5px; color: #000;">Sub Totals</td>
                    ${days.map(day => `
                      <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${getUnbillableSubtotal(day).toFixed(2)}</td>
                    `).join('')}
                    <td style="border: 1px solid #000; padding: 5px; text-align: right; color: #000;">${getUnbillableGrandTotal().toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Grand Total -->
            <div style="background-color: #90EE90; font-weight: bold; padding: 10px; margin-top: 20px; text-align: right; font-size: 12pt; color: #000;">
              <span style="margin-right: 20px; color: #000;">GRAND TOTAL</span>
              <span style="color: #000;">${getGrandTotal().toFixed(2)}</span>
            </div>
          </div>
        `
      })

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Timesheets Export - ${new Date().toLocaleDateString()}</title>
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
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
      `)
      printWindow.document.close()
      
      // Wait a bit for images to load, then print
      setTimeout(() => {
        printWindow.print()
        setExporting(false)
      }, 500)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Error exporting PDF. Please try again.')
      setExporting(false)
    }
  }

  const handleExport = () => {
    switch (exportFormat) {
      case 'csv':
        handleExportCSV()
        break
      case 'excel':
        handleExportExcel()
        break
      case 'pdf':
        handleExportPDF()
        break
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Week Ending
          </label>
          <select
            value={selectedWeek}
            onChange={(e) => {
              setSelectedWeek(e.target.value)
              setSelectedTimesheets([])
            }}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Weeks</option>
            {weekEndings.map(we => (
              <option key={we} value={we}>
                {formatWeekEnding(we)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportFormat('csv')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  exportFormat === 'csv'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <FileText className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => setExportFormat('excel')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  exportFormat === 'excel'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
              <button
                onClick={() => setExportFormat('pdf')}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  exportFormat === 'pdf'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <File className="h-4 w-4" />
                PDF
              </button>
            </div>
          </div>

          <div className="flex-1">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : `Export ${selectedTimesheets.length > 0 ? `${selectedTimesheets.length} Selected` : 'All'} Timesheets`}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                <input
                  type="checkbox"
                  checked={selectedTimesheets.length === filteredTimesheets.length && filteredTimesheets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTimesheets(filteredTimesheets.map(ts => ts.id))
                    } else {
                      setSelectedTimesheets([])
                    }
                  }}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Week Ending</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTimesheets.map((ts) => (
              <tr key={ts.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedTimesheets.includes(ts.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTimesheets([...selectedTimesheets, ts.id])
                      } else {
                        setSelectedTimesheets(selectedTimesheets.filter(id => id !== ts.id))
                      }
                    }}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatWeekEnding(ts.week_ending)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.user_profiles?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.sites?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.purchase_orders?.po_number || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {ts.hours}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                  {ts.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

