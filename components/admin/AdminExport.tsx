'use client'

import { useState, useMemo } from 'react'
import { Download, FileText, FileSpreadsheet, File, ArrowUpDown, ArrowUp, ArrowDown, X, Filter } from 'lucide-react'
import { formatWeekEnding, formatDate, formatDateShort, formatDateInEastern, getWeekDates } from '@/lib/utils'
import { format } from 'date-fns'

interface Site { id: string; name: string }
interface Department { id: string; name: string; site_id: string }
interface PurchaseOrder { id: string; po_number: string; site_id?: string; department_id?: string }

interface AdminExportProps {
  timesheets: any[]
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
  systems?: Array<{ id: string; name: string }>
}

type ExportFormat = 'csv' | 'excel' | 'pdf'

export default function AdminExport({ timesheets, sites, departments, purchaseOrders, systems = [] }: AdminExportProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [selectedPO, setSelectedPO] = useState<string>('')
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedTimesheets, setSelectedTimesheets] = useState<string[]>([])
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)
  const [sortColumn, setSortColumn] = useState<string>('week_ending')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showExportFilter, setShowExportFilter] = useState(false)
  const [exportFilter, setExportFilter] = useState<{
    clientIds: string[]
    poIds: string[]
    systemIds: string[]
    includeNonBillable: boolean
  }>({ clientIds: [], poIds: [], systemIds: [], includeNonBillable: true })

  // Cascading filters: each filter narrows the options in the others
  const filteredSites = useMemo(() => {
    if (selectedDepartment) {
      const dept = departments.find(d => d.id === selectedDepartment)
      return dept ? sites.filter(s => s.id === dept.site_id) : sites
    }
    if (selectedPO) {
      const po = purchaseOrders.find(p => p.id === selectedPO)
      return po?.site_id ? sites.filter(s => s.id === po.site_id) : sites
    }
    return sites
  }, [sites, departments, purchaseOrders, selectedDepartment, selectedPO])

  const filteredDepartments = useMemo(() => {
    if (selectedSite) return departments.filter(d => d.site_id === selectedSite)
    if (selectedPO) {
      const po = purchaseOrders.find(p => p.id === selectedPO)
      return po?.department_id ? departments.filter(d => d.id === po.department_id) : departments
    }
    return departments
  }, [departments, purchaseOrders, selectedSite, selectedPO])

  const filteredPOs = useMemo(() => {
    let list = purchaseOrders
    if (selectedSite) list = list.filter(po => po.site_id === selectedSite)
    if (selectedDepartment) list = list.filter(po => po.department_id === selectedDepartment)
    return list
  }, [purchaseOrders, selectedSite, selectedDepartment])

  // Get unique filter options from timesheets (for week, status, employee)
  const weekEndings = Array.from(new Set(timesheets.map(ts => ts.week_ending))).filter(Boolean).sort().reverse()
  const statuses = Array.from(new Set(timesheets.map(ts => ts.status))).filter(Boolean).sort()
  const employeesList = timesheets.map(ts => ({ id: ts.user_id, name: ts.user_profiles?.name || 'Unknown' }))
  const uniqueEmployees = Array.from(new Map(employeesList.map((e: any) => [e.id, e])).values()).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))

  const clearAllFilters = () => {
    setSelectedWeek('')
    setSelectedStatus('')
    setSelectedSite('')
    setSelectedDepartment('')
    setSelectedPO('')
    setSelectedEmployee('')
    setSelectedTimesheets([])
  }

  const hasActiveFilters = selectedWeek || selectedStatus || selectedSite || selectedDepartment || selectedPO || selectedEmployee

  // Filter timesheets by all selected filters (match if timesheet has ANY of selected site/PO)
  const filteredTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      if (selectedWeek && ts.week_ending !== selectedWeek) return false
      if (selectedStatus && ts.status !== selectedStatus) return false
      if (selectedSite && !(ts._site_ids || []).includes(selectedSite)) return false
      if (selectedPO && !(ts._po_ids || []).includes(selectedPO)) return false
      if (selectedDepartment) {
        const posForTs = (ts._po_ids || []).map((id: string) => purchaseOrders.find(p => p.id === id)).filter(Boolean)
        if (!posForTs.some((p: any) => p.department_id === selectedDepartment)) return false
      }
      if (selectedEmployee && ts.user_id !== selectedEmployee) return false
      return true
    })
  }, [timesheets, purchaseOrders, selectedWeek, selectedStatus, selectedSite, selectedDepartment, selectedPO, selectedEmployee])

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
        case 'site': aVal = (a.sitesDisplay || '').toLowerCase(); bVal = (b.sitesDisplay || '').toLowerCase(); break
        case 'po': aVal = (a.posDisplay || '').toLowerCase(); bVal = (b.posDisplay || '').toLowerCase(); break
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
      ts.sitesDisplay || ts.sites?.name || '',
      ts.posDisplay || ts.purchase_orders?.po_number || '',
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
        'Site': ts.sitesDisplay || ts.sites?.name || '',
        'PO': ts.posDisplay || ts.purchase_orders?.po_number || '',
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

  const handleExportPDF = async (filter?: { clientIds: string[]; poIds: string[]; systemIds: string[]; includeNonBillable: boolean }) => {
    const toExport = getExportData()
    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }

    setExporting(true)
    const f = filter || { clientIds: [], poIds: [], systemIds: [], includeNonBillable: true }

    try {
      const timesheetIds = toExport.map(ts => ts.id)
      const response = await fetch('/api/admin/export-timesheets-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetIds })
      })

      if (!response.ok) throw new Error('Failed to fetch timesheet data')

      const timesheetData = await response.json()
      const origin = window.location.origin

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        alert('Please allow popups to generate PDF')
        setExporting(false)
        return
      }

      const filterEntry = (entry: any) => {
        if (f.clientIds.length && !f.clientIds.includes(entry.client_project_id)) return false
        if (f.poIds.length && !f.poIds.includes(entry.po_id)) return false
        if (f.systemIds.length) {
          const sysMatch = entry.system_id ? f.systemIds.includes(entry.system_id) : f.systemIds.some(id => id.startsWith('custom:') && entry.system_name === id.replace('custom:', ''))
          if (!sysMatch) return false
        }
        return true
      }

      let htmlContent = ''
      timesheetData.forEach((data: any, index: number) => {
        let { timesheet, entries, unbillable, user } = data
        entries = entries.filter(filterEntry)
        if (!f.includeNonBillable) unbillable = []
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
          <div style="font-family: Arial, sans-serif; font-size: 8pt; color: #000; margin-bottom: 12px;">
            <!-- Header Logo -->
            <div style="width: 100%; margin-bottom: 6px;">
              <img 
                src="${origin}/ctg-header-logo.png"
                alt="Compliance Technology Group, Inc." 
                style="width: 100%; height: auto; display: block; max-height: 70px; object-fit: contain;"
              />
            </div>

            <!-- Timesheet Info -->
            <div style="margin-bottom: 6px; color: #000;">
              <div style="color: #000;"><strong style="color: #000;">Time Sheet For:</strong> ${escapeHtml(user.name)}</div>
              <div style="color: #000;">
                <strong style="color: #000;">From:</strong> ${formatDate(weekDates.start)} <strong style="color: #000;">To:</strong> ${formatDate(weekDates.end)}
              </div>
            </div>

            <!-- Billable Time Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 8pt;">
              <thead>
                <tr style="background-color: #f0f0f0;">
                  <th style="border: 1px solid #000; padding: 3px; text-align: left;">Client / Project #</th>
                  <th style="border: 1px solid #000; padding: 3px; text-align: left;">PO#</th>
                  <th style="border: 1px solid #000; padding: 3px; text-align: left;">Task Description</th>
                  ${weekDates.days.map((day, idx) => `
                    <th style="border: 1px solid #000; padding: 3px; text-align: center;">
                      <div>${format(day, 'EEE')}</div>
                      <div style="font-size: 7pt; font-weight: normal;">${formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  `).join('')}
                  <th style="border: 1px solid #000; padding: 3px; text-align: center;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${entries.map((entry: any) => `
                  <tr>
                    <td style="border: 1px solid #000; padding: 3px; color: #000;">${escapeHtml(entry.sites?.name || entry.client_project_id)}</td>
                    <td style="border: 1px solid #000; padding: 3px; color: #000;">${escapeHtml(entry.purchase_orders?.po_number || entry.po_id)}</td>
                    <td style="border: 1px solid #000; padding: 3px; color: #000;">${escapeHtml(entry.task_description)}</td>
                    ${days.map(day => `
                      <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${(entry[`${day}_hours`] || 0).toFixed(2)}</td>
                    `).join('')}
                    <td style="border: 1px solid #000; padding: 3px; text-align: right; font-weight: bold; color: #000;">${calculateTotal(entry).toFixed(2)}</td>
                  </tr>
                `).join('')}
                ${Array.from({ length: Math.max(0, 3 - entries.length) }).map(() => `
                  <tr>
                    <td style="border: 1px solid #000; padding: 3px;"></td>
                    <td style="border: 1px solid #000; padding: 3px;"></td>
                    <td style="border: 1px solid #000; padding: 3px;"></td>
                    ${days.map(() => `<td style="border: 1px solid #000; padding: 3px; text-align: right;">0.00</td>`).join('')}
                    <td style="border: 1px solid #000; padding: 3px; text-align: right;">0.00</td>
                  </tr>
                `).join('')}
                <tr style="background-color: #FFFF99; font-weight: bold; color: #000;">
                  <td colspan="3" style="border: 1px solid #000; padding: 3px; color: #000;">Sub Totals</td>
                  ${days.map(day => `
                    <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${getBillableSubtotal(day).toFixed(2)}</td>
                  `).join('')}
                  <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${getBillableGrandTotal().toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <!-- Signature Section - only show approval lines that exist on the user profile -->
            <div style="margin-top: 8px; color: #000;">
              <div style="margin-bottom: 4px; color: #000;">
                <strong style="color: #000;">Employee Signature / Date:</strong>
                ${timesheet.employee_signed_at ? `
                  <span style="margin-left: 10px; color: #000;">${escapeHtml(user.name)} ${formatDateInEastern(timesheet.employee_signed_at)}</span>
                ` : `
                  <span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>
                `}
              </div>
              ${(user.supervisor_id != null && user.supervisor_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'supervisor') ? `
              <div style="margin-bottom: 4px; color: #000; text-align: right;">
                <strong style="color: #000;">Supervisor Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'supervisor')
                  const up = sig?.user_profiles
                  const name = sig ? (sig.signer_name || (Array.isArray(up) ? up[0]?.name : up?.name) || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${formatDateInEastern(sig.signed_at)}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
              ${(user.manager_id != null && user.manager_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'manager') ? `
              <div style="margin-bottom: 4px; color: #000; text-align: right;">
                <strong style="color: #000;">Manager Approval by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'manager')
                  const up = sig?.user_profiles
                  const name = sig ? (sig.signer_name || (Array.isArray(up) ? up[0]?.name : up?.name) || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${formatDateInEastern(sig.signed_at)}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
              ${(user.final_approver_id != null && user.final_approver_id !== '') || timesheet.timesheet_signatures?.some((s: any) => s.signer_role === 'final_approver') ? `
              <div style="color: #000; text-align: right;">
                <strong style="color: #000;">Final Approver by / Date:</strong>
                ${(() => {
                  const sig = timesheet.timesheet_signatures?.find((s: any) => s.signer_role === 'final_approver')
                  const up = sig?.user_profiles
                  const name = sig ? (sig.signer_name || (Array.isArray(up) ? up[0]?.name : up?.name) || '') : ''
                  return sig ? `<span style="margin-left: 10px; color: #000;">${escapeHtml(name)} ${formatDateInEastern(sig.signed_at)}</span>` : `<span style="margin-left: 10px; border-bottom: 1px solid #000; display: inline-block; min-width: 200px;"></span>`
                })()}
              </div>
              ` : ''}
            </div>

            <!-- Unbillable Time Section -->
            <div style="margin-top: 8px; color: #000;">
              <h3 style="font-size: 9pt; font-weight: bold; margin-bottom: 4px; color: #000;">UNBILLABLE TIME</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 8pt;">
                <thead>
                  <tr style="background-color: #f0f0f0;">
                    <th style="border: 1px solid #000; padding: 3px; text-align: left;">Description</th>
                    ${weekDates.days.map((day, idx) => `
                      <th style="border: 1px solid #000; padding: 3px; text-align: center;">
                        <div>${format(day, 'EEE')}</div>
                        <div style="font-size: 7pt; font-weight: normal;">${formatDateShort(weekDates.days[idx])}</div>
                      </th>
                    `).join('')}
                    <th style="border: 1px solid #000; padding: 3px; text-align: center;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${unbillable.map((entry: any) => `
                    <tr>
                      <td style="border: 1px solid #000; padding: 3px; font-weight: bold; color: #000;">${entry.description}</td>
                      ${days.map(day => `
                        <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${(entry[`${day}_hours`] || 0).toFixed(2)}</td>
                      `).join('')}
                      <td style="border: 1px solid #000; padding: 3px; text-align: right; font-weight: bold; color: #000;">${calculateTotal(entry).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                  <tr style="background-color: #FFFF99; font-weight: bold; color: #000;">
                    <td style="border: 1px solid #000; padding: 3px; color: #000;">Sub Totals</td>
                    ${days.map(day => `
                      <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${getUnbillableSubtotal(day).toFixed(2)}</td>
                    `).join('')}
                    <td style="border: 1px solid #000; padding: 3px; text-align: right; color: #000;">${getUnbillableGrandTotal().toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Grand Total -->
            <div style="background-color: #90EE90; font-weight: bold; padding: 6px; margin-top: 8px; text-align: right; font-size: 9pt; color: #000;">
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
            @page { size: landscape; margin: 0.25in; }
            @media print { @page { size: landscape; margin: 0.25in; } }
            @media print { html, body { width: 100%; height: 100%; } }
            @media print { .print-hide { display: none !important; } }
            body { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; padding: 0; color: #000; width: 100%; }
            .print-hide { background: #fef3c7; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; border: 1px solid #f59e0b; border-radius: 6px; }
            </style>
          </head>
          <body>
            <div class="print-hide"><strong>Before printing:</strong> In the print dialog, open &quot;More settings&quot; and <strong>uncheck &quot;Headers and footers&quot;</strong> to remove the URL and page numbers from the output.</div>
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
    const toExport = getExportData()
    if (toExport.length === 0) {
      alert('No timesheets selected')
      return
    }
    if (exportFormat === 'pdf') {
      setShowExportFilter(true)
    } else {
      switch (exportFormat) {
        case 'csv':
          handleExportCSV()
          break
        case 'excel':
          handleExportExcel()
          break
      }
    }
  }

  const handleExportWithFilter = () => {
    setShowExportFilter(false)
    handleExportPDF(exportFilter)
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
              onChange={(e) => {
                const newSite = e.target.value
                setSelectedSite(newSite)
                clearFiltersAndSelection()
                if (!newSite) setSelectedDepartment('')
                else {
                  const deptsAtSite = departments.filter(d => d.site_id === newSite)
                  if (!deptsAtSite.some(d => d.id === selectedDepartment)) setSelectedDepartment('')
                }
                if (!newSite) setSelectedPO('')
                else {
                  const posAtSite = purchaseOrders.filter(p => p.site_id === newSite)
                  if (!posAtSite.some(p => p.id === selectedPO)) setSelectedPO('')
                }
              }}
              className={filterSelectClass}
            >
              <option value="">All Sites</option>
              {filteredSites.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
            <select
              value={selectedDepartment}
              onChange={(e) => {
                const newDept = e.target.value
                setSelectedDepartment(newDept)
                clearFiltersAndSelection()
                if (!newDept) setSelectedPO('')
                else {
                  let posForDept = purchaseOrders.filter(p => p.department_id === newDept)
                  if (selectedSite) posForDept = posForDept.filter(p => p.site_id === selectedSite)
                  if (!posForDept.some(p => p.id === selectedPO)) setSelectedPO('')
                }
              }}
              className={filterSelectClass}
            >
              <option value="">All Departments</option>
              {filteredDepartments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">PO</label>
            <select
              value={selectedPO}
              onChange={(e) => {
                const newPO = e.target.value
                setSelectedPO(newPO)
                clearFiltersAndSelection()
                if (newPO) {
                  const po = purchaseOrders.find(p => p.id === newPO)
                  if (po) {
                    if (po.site_id && po.site_id !== selectedSite) setSelectedSite(po.site_id)
                    if (po.department_id && po.department_id !== selectedDepartment) setSelectedDepartment(po.department_id)
                  }
                }
              }}
              className={filterSelectClass}
            >
              <option value="">All POs</option>
              {filteredPOs.map((p: any) => (
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
          <div className="flex flex-col gap-1 min-w-0 md:min-w-0">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 invisible md:visible">Clear</label>
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              <X className="h-4 w-4" />
              Clear All
            </button>
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
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                  {ts.sitesDisplay || 'N/A'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                  {ts.posDisplay || 'N/A'}
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

      {/* Export Filter Popup (for PDF) */}
      {showExportFilter && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                  {sites.filter(s => getExportData().some(ts => (ts._site_ids || []).includes(s.id))).map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportFilter.clientIds.includes(s.id)}
                        onChange={e => setExportFilter(prev => ({
                          ...prev,
                          clientIds: e.target.checked ? [...prev.clientIds, s.id] : prev.clientIds.filter(id => id !== s.id)
                        }))}
                        className="rounded"
                      />
                      <span>{s.name}</span>
                    </label>
                  ))}
                  {sites.filter(s => getExportData().some(ts => (ts._site_ids || []).includes(s.id))).length === 0 && (
                    <p className="text-sm text-gray-500">No clients in selected timesheets</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PO</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {purchaseOrders.filter(p => getExportData().some(ts => (ts._po_ids || []).includes(p.id))).map(p => (
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
                      <span>{p.po_number}</span>
                    </label>
                  ))}
                  {purchaseOrders.filter(p => getExportData().some(ts => (ts._po_ids || []).includes(p.id))).length === 0 && (
                    <p className="text-sm text-gray-500">No POs in selected timesheets</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Systems</label>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {systems.filter(s => getExportData().some(ts => 
                    (ts._system_ids || []).includes(s.id) || (s.id.startsWith('custom:') && (ts._system_names || []).includes(s.name))
                  )).map(s => (
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
                  {systems.filter(s => getExportData().some(ts => 
                    (ts._system_ids || []).includes(s.id) || (s.id.startsWith('custom:') && (ts._system_names || []).includes(s.name))
                  )).length === 0 && (
                    <p className="text-sm text-gray-500">No systems in selected timesheets</p>
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
                disabled={exporting}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export PDF'}
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
    </div>
  )
}

