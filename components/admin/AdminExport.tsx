'use client'

import { useState, useMemo } from 'react'
import { Download, FileText, FileSpreadsheet, File, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { formatWeekEnding, formatDate, formatDateShort, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'

interface AdminExportProps {
  timesheets: any[]
}

type ExportFormat = 'csv' | 'excel' | 'pdf'

export default function AdminExport({ timesheets }: AdminExportProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedPO, setSelectedPO] = useState<string>('')
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)
  const [sortColumn, setSortColumn] = useState<string>('week_ending')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Get unique filter options from timesheets
  const weekEndings = Array.from(new Set(timesheets.map(ts => ts.week_ending))).filter(Boolean).sort().reverse()
  const statuses = Array.from(new Set(timesheets.map(ts => ts.status))).filter(Boolean).sort()
  const sitesList = timesheets.map(ts => ts.sites).filter(Boolean)
  const uniqueSites = Array.from(new Map(sitesList.map((s: any) => [s.id, s])).values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
  const posList = timesheets.map(ts => ts.purchase_orders).filter(Boolean)
  const uniquePOs = Array.from(new Map(posList.map((p: any) => [p.id, p])).values()).sort((a: any, b: any) => (a.po_number || '').localeCompare(b.po_number || ''))
  const employeesList = timesheets.map(ts => ({ id: ts.user_id, name: ts.user_profiles?.name || 'Unknown' }))
  const uniqueEmployees = Array.from(new Map(employeesList.map((e: any) => [e.id, e])).values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))

  // Filter timesheets by all selected filters
  const filteredTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      if (selectedWeek && ts.week_ending !== selectedWeek) return false
      if (selectedStatus && ts.status !== selectedStatus) return false
      if (selectedSite && ts.sites?.id !== selectedSite) return false
      if (selectedPO && ts.purchase_orders?.id !== selectedPO) return false
      if (selectedEmployee && ts.user_id !== selectedEmployee) return false
      return true
    })
  }, [timesheets, selectedWeek, selectedStatus, selectedSite, selectedPO, selectedEmployee])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedTimesheets = useMemo(() => {
    const sorted = [...filteredTimesheets]
    const mult = sortDirection === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (sortColumn) {
        case 'week_ending': aVal = a.week_ending || ''; bVal = b.week_ending || ''; break
        case 'employee': aVal = (a.user_profiles?.name || '').toLowerCase(); bVal = (b.user_profiles?.name || '').toLowerCase(); break
        case 'site': aVal = (a.sites?.name || '').toLowerCase(); bVal = (b.sites?.name || '').toLowerCase(); break
        case 'po': aVal = (a.purchase_orders?.po_number || '').toLowerCase(); bVal = (b.purchase_orders?.po_number || '').toLowerCase(); break
        case 'hours': aVal = Number(a.hours) || 0; bVal = Number(b.hours) || 0; break
        case 'status': aVal = (a.status || '').toLowerCase(); bVal = (b.status || '').toLowerCase(); break
        default: aVal = a.week_ending || ''; bVal = b.week_ending || ''
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') return mult * (aVal - bVal)
      return mult * String(aVal).localeCompare(String(bVal))
    })
    return sorted
  }, [filteredTimesheets, sortColumn, sortDirection])

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

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
                      <div>${format(day, 'EEE')}</div>
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

            <!-- Signature Section - only show approval lines that exist on the user profile -->
            <div style="margin-top: 15px; color: #000;">
              <div style="margin-bottom: 8px; color: #000;">
                <strong style="color: #000;">Employee Signature / Date:</strong>
                ${timesheet.employee_signed_at ? `
                  <span style="margin-left: 10px; color: #000;">${escapeHtml(user.name)} ${new Date(timesheet.employee_signed_at).toLocaleDateString()}</span>
                ` : `
                  <span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>
                `}
              </div>
              ${(user.supervisor_id != null && user.supervisor_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'supervisor') ? `
              <div style="margin-bottom: 8px; color: #000; text-align: right;">
                <strong style="color: #000;">Supervisor Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor')
                  const name = sig ? (sig.signer_name || sig.user_profiles?.name || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${new Date(sig.signed_at).toLocaleDateString()}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
              ${(user.manager_id != null && user.manager_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'manager') ? `
              <div style="margin-bottom: 8px; color: #000; text-align: right;">
                <strong style="color: #000;">Manager Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager')
                  const name = sig ? (sig.signer_name || sig.user_profiles?.name || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${new Date(sig.signed_at).toLocaleDateString()}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
              ${(user.final_approver_id != null && user.final_approver_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'final_approver') ? `
              <div style="color: #000; text-align: right;">
                <strong style="color: #000;">Final Approver by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'final_approver')
                  const name = sig ? (sig.signer_name || sig.user_profiles?.name || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${new Date(sig.signed_at).toLocaleDateString()}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
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
                        <div>${format(day, 'EEE')}</div>
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

  const clearFiltersAndSelection = () => setSelectedTimesheets([])

  const filterSelectClass = "px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm min-w-0"

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="mb-6 space-y-4">
        {/* Filters row - all in one row on desktop */}
        <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Week Ending</label>
            <select
              value={selectedWeek}
              onChange={(e) => { setSelectedWeek(e.target.value); clearFiltersAndSelection() }}
              className={filterSelectClass}
            >
              <option value="">All Weeks</option>
              {weekEndings.map(we => (
                <option key={we} value={we}>{formatWeekEnding(we)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); clearFiltersAndSelection() }}
              className={filterSelectClass}
            >
              <option value="">All Statuses</option>
              {statuses.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Site</label>
            <select
              value={selectedSite}
              onChange={(e) => { setSelectedSite(e.target.value); clearFiltersAndSelection() }}
              className={filterSelectClass}
            >
              <option value="">All Sites</option>
              {uniqueSites.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">PO</label>
            <select
              value={selectedPO}
              onChange={(e) => { setSelectedPO(e.target.value); clearFiltersAndSelection() }}
              className={filterSelectClass}
            >
              <option value="">All POs</option>
              {uniquePOs.map((p: any) => (
                <option key={p.id} value={p.id}>{p.po_number}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0 md:min-w-[140px]">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
            <select
              value={selectedEmployee}
              onChange={(e) => { setSelectedEmployee(e.target.value); clearFiltersAndSelection() }}
              className={filterSelectClass}
            >
              <option value="">All Employees</option>
              {uniqueEmployees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Export format and Export button - all in one row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Export Format:</span>
            <button
              onClick={() => setExportFormat('csv')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                exportFormat === 'csv' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              <FileText className="h-4 w-4" />
              CSV
            </button>
            <button
              onClick={() => setExportFormat('excel')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                exportFormat === 'excel' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button
              onClick={() => setExportFormat('pdf')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                exportFormat === 'pdf' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              <File className="h-4 w-4" />
              PDF
            </button>
          </div>
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

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <input
                  type="checkbox"
                  checked={selectedTimesheets.length === sortedTimesheets.length && sortedTimesheets.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedTimesheets(sortedTimesheets.map(ts => ts.id))
                    } else {
                      setSelectedTimesheets([])
                    }
                  }}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('week_ending')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Week Ending <SortIcon col="week_ending" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('employee')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Employee <SortIcon col="employee" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('site')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Site <SortIcon col="site" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('po')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  PO <SortIcon col="po" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('hours')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Hours <SortIcon col="hours" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button onClick={() => handleSort('status')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Status <SortIcon col="status" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedTimesheets.map((ts) => (
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {formatWeekEnding(ts.week_ending)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {ts.user_profiles?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {ts.sites?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {ts.purchase_orders?.po_number || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {ts.hours}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">
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

