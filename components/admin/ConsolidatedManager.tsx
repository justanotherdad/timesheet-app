'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown, FileText, X } from 'lucide-react'
import SiteDetailView from './SiteDetailView'
import OptionsManager from './OptionsManager'

interface Site {
  id: string
  name: string
  week_starting_day?: number
  address?: string
  address_street?: string
  address_city?: string
  address_state?: string
  address_zip?: string
  contact?: string
}

interface Department {
  id: string
  site_id: string
  name: string
}

interface PurchaseOrder {
  id: string
  site_id: string
  department_id?: string
  po_number: string
  description?: string
  original_po_amount?: number
  po_issue_date?: string
  po_balance?: number
  proposal_number?: string
  project_name?: string
}

interface ConsolidatedManagerProps {
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
  expenseTypes?: Array<{ id: string; name: string }>
  readOnly?: boolean
  isAdminOrAbove?: boolean
}

type TabType = 'sites' | 'departments' | 'purchase-orders' | 'expense-types' | 'company-info'

export default function ConsolidatedManager({
  sites: initialSites,
  departments: initialDepartments,
  purchaseOrders: initialPOs,
  expenseTypes: initialExpenseTypes = [],
  readOnly = false,
  isAdminOrAbove = false,
}: ConsolidatedManagerProps) {
  const router = useRouter()
  const [sites, setSites] = useState(initialSites)
  const [departments, setDepartments] = useState(initialDepartments)
  const [purchaseOrders, setPurchaseOrders] = useState(initialPOs)
  const [activeTab, setActiveTab] = useState<TabType>('sites')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  
  // Sorting state for each table
  const [sitesSortColumn, setSitesSortColumn] = useState<string>('name')
  const [sitesSortDirection, setSitesSortDirection] = useState<'asc' | 'desc'>('asc')
  const [deptsSortColumn, setDeptsSortColumn] = useState<string>('name')
  const [deptsSortDirection, setDeptsSortDirection] = useState<'asc' | 'desc'>('asc')
  const [posSortColumn, setPosSortColumn] = useState<string>('po_number')
  const [posSortDirection, setPosSortDirection] = useState<'asc' | 'desc'>('asc')
  const [siteInfoCard, setSiteInfoCard] = useState<Site | null>(null)
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyEmailSaving, setCompanyEmailSaving] = useState(false)
  const [companyEmailLoaded, setCompanyEmailLoaded] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    if (activeTab === 'company-info' && !companyEmailLoaded) {
      fetch('/api/company-settings')
        .then((res) => res.ok ? res.json() : {})
        .then((data) => {
          setCompanyEmail(data.company_email ?? '')
          setCompanyEmailLoaded(true)
        })
        .catch(() => setCompanyEmailLoaded(true))
    }
  }, [activeTab, companyEmailLoaded])

  const filteredDepartments = selectedSite 
    ? departments.filter(d => d.site_id === selectedSite)
    : []

  const filteredPOs = purchaseOrders.filter(po => {
    if (selectedSite && po.site_id !== selectedSite) return false
    if (selectedDepartment && po.department_id !== selectedDepartment) return false
    return true
  })

  // Sorting functions
  const handleSort = (table: 'sites' | 'departments' | 'pos', column: string) => {
    if (table === 'sites') {
      if (sitesSortColumn === column) {
        setSitesSortDirection(sitesSortDirection === 'asc' ? 'desc' : 'asc')
      } else {
        setSitesSortColumn(column)
        setSitesSortDirection('asc')
      }
    } else if (table === 'departments') {
      if (deptsSortColumn === column) {
        setDeptsSortDirection(deptsSortDirection === 'asc' ? 'desc' : 'asc')
      } else {
        setDeptsSortColumn(column)
        setDeptsSortDirection('asc')
      }
    } else if (table === 'pos') {
      if (posSortColumn === column) {
        setPosSortDirection(posSortDirection === 'asc' ? 'desc' : 'asc')
      } else {
        setPosSortColumn(column)
        setPosSortDirection('asc')
      }
    }
  }

  // Sort sites
  const sortedSites = [...sites].sort((a, b) => {
    const aVal = a.name.toLowerCase()
    const bVal = b.name.toLowerCase()
    
    if (aVal < bVal) return sitesSortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sitesSortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Sort departments
  const sortedDepartments = [...filteredDepartments].sort((a, b) => {
    const aVal = a.name.toLowerCase()
    const bVal = b.name.toLowerCase()
    if (aVal < bVal) return deptsSortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return deptsSortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Sort purchase orders
  const sortedPOs = [...filteredPOs].sort((a, b) => {
    let aVal: any, bVal: any
    if (posSortColumn === 'po_number') {
      aVal = a.po_number.toLowerCase()
      bVal = b.po_number.toLowerCase()
    } else if (posSortColumn === 'description') {
      aVal = (a.description || '').toLowerCase()
      bVal = (b.description || '').toLowerCase()
    } else if (posSortColumn === 'department') {
      const aDept = departments.find(d => d.id === a.department_id)?.name || ''
      const bDept = departments.find(d => d.id === b.department_id)?.name || ''
      aVal = aDept.toLowerCase()
      bVal = bDept.toLowerCase()
    } else {
      return 0
    }
    
    if (aVal < bVal) return posSortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return posSortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Helper to render sort icon
  const getSortIcon = (table: 'sites' | 'departments' | 'pos', column: string) => {
    let isActive = false
    let direction: 'asc' | 'desc' = 'asc'
    
    if (table === 'sites' && sitesSortColumn === column) {
      isActive = true
      direction = sitesSortDirection
    } else if (table === 'departments' && deptsSortColumn === column) {
      isActive = true
      direction = deptsSortDirection
    } else if (table === 'pos' && posSortColumn === column) {
      isActive = true
      direction = posSortDirection
    }
    
    if (!isActive) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    }
    return direction === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  const handleAddSite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    try {
      const { data, error: insertError } = await supabase
        .from('sites')
        .insert({ name, week_starting_day: 1 })
        .select()
        .single()

      if (insertError) throw insertError
      setSites([...sites, data])
      if (e.currentTarget) e.currentTarget.reset()
      setShowAddForm(false)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleAddDepartment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedSite) {
      setError('Please select a site first')
      return
    }
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    try {
      const { data, error: insertError } = await supabase
        .from('departments')
        .insert({ site_id: selectedSite, name })
        .select()
        .single()

      if (insertError) throw insertError
      setDepartments([...departments, data])
      if (e.currentTarget) e.currentTarget.reset()
      setShowAddForm(false)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPO = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedSite) {
      setError('Please select a site first')
      return
    }
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const poNumber = formData.get('po_number') as string
    const description = formData.get('description') as string || null
    const departmentId = formData.get('department_id') as string || null
    const clientContactName = formData.get('client_contact_name') as string || null
    const budgetType = (formData.get('budget_type') as string) || 'basic'
    const netTerms = formData.get('net_terms') as string || null
    const howToBill = formData.get('how_to_bill') as string || null
    const originalAmount = formData.get('original_po_amount') as string
    const poIssueDate = formData.get('po_issue_date') as string || null
    const attachmentFiles = formData.getAll('attachments') as File[]

    try {
      const { data, error: insertError } = await supabase
        .from('purchase_orders')
        .insert({
          site_id: selectedSite,
          department_id: departmentId || null,
          po_number: poNumber,
          description: description || undefined,
          project_name: description || undefined,
          client_contact_name: clientContactName || null,
          budget_type: budgetType,
          net_terms: netTerms || null,
          how_to_bill: howToBill || null,
          original_po_amount: originalAmount ? parseFloat(originalAmount) : null,
          po_issue_date: poIssueDate || null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      if (data?.id && attachmentFiles?.length) {
        const validFiles = attachmentFiles.filter((f) => f?.name)
        for (const file of validFiles) {
          const fd = new FormData()
          fd.append('file', file)
          try {
            await fetch(`/api/budget/${data.id}/attachments`, { method: 'POST', body: fd })
          } catch { /* skip failed uploads */ }
        }
      }

      setPurchaseOrders([...purchaseOrders, data])
      if (e.currentTarget) e.currentTarget.reset()
      setSelectedDepartment('')
      setShowAddForm(false)
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | undefined
      if (submitter?.name === 'saveAndView' && data?.id) {
        router.push(`/dashboard/budget?poId=${data.id}`)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (table: string, id: string) => {
    if (!confirm(`Are you sure you want to delete this item?`)) return

    try {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error

      if (table === 'sites') {
        setSites(sites.filter(s => s.id !== id))
      } else if (table === 'departments') {
        setDepartments(departments.filter(d => d.id !== id))
      } else if (table === 'purchase_orders') {
        setPurchaseOrders(purchaseOrders.filter(po => po.id !== id))
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Manage Sites, Departments & Purchase Orders</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            setActiveTab('sites')
            setSelectedSite('')
            setSelectedDepartment('')
            setShowAddForm(false)
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'sites'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Sites
        </button>
        <button
          onClick={() => {
            setActiveTab('departments')
            setShowAddForm(false)
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'departments'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Departments
        </button>
        <button
          onClick={() => {
            setActiveTab('purchase-orders')
            setShowAddForm(false)
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'purchase-orders'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Purchase Orders
        </button>
        <button
          onClick={() => {
            setActiveTab('expense-types')
            setShowAddForm(false)
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'expense-types'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Expense Types
        </button>
        <button
          onClick={() => {
            setActiveTab('company-info')
            setShowAddForm(false)
          }}
          className={`px-4 py-2 font-medium ${
            activeTab === 'company-info'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          Company Information
        </button>
      </div>

      {/* Sites Tab */}
      {activeTab === 'sites' && (
        <>
          {!readOnly && (
          <div className="flex justify-between items-center mb-4">
            <div></div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Site
            </button>
          </div>
          )}

          {!readOnly && showAddForm && (
            <form onSubmit={handleAddSite} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Site</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Name *</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Site Name"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Adding...' : 'Add'}
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('sites', 'name')}
                  >
                    Name {getSortIcon('sites', 'name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sortedSites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{site.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSiteInfoCard(site)}
                        className="text-gray-600 hover:text-blue-600 mr-4"
                        title="View Site Details"
                      >
                        <FileText className="h-4 w-4 inline" />
                      </button>
                      {!readOnly && (
                        <>
                          <button onClick={() => setEditingItem({ type: 'site', ...site })} className="text-blue-600 hover:text-blue-900 mr-4" title="Edit site">
                            <Edit className="h-4 w-4 inline" />
                          </button>
                          <button onClick={() => handleDelete('sites', site.id)} className="text-red-600 hover:text-red-900" title="Delete site">
                            <Trash2 className="h-4 w-4 inline" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Site <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSite}
              onChange={(e) => {
                setSelectedSite(e.target.value)
                setSelectedDepartment('')
                setShowAddForm(false)
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">-- Select Site --</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>

          {selectedSite && (
            <>
              {!readOnly && (
              <div className="flex justify-between items-center mb-4">
                <div></div>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Department
                </button>
              </div>
              )}

              {!readOnly && showAddForm && (
                <form onSubmit={handleAddDepartment} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Department</h3>
                  <input
                    type="text"
                    name="name"
                    placeholder="Department Name *"
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading ? 'Adding...' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('departments', 'name')}
                      >
                        Name {getSortIcon('departments', 'name')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedDepartments.map((dept) => (
                      <tr key={dept.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{dept.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {!readOnly && (
                            <>
                              <button onClick={() => setEditingItem({ type: 'department', ...dept })} className="text-blue-600 hover:text-blue-900 mr-4" title="Edit department">
                                <Edit className="h-4 w-4 inline" />
                              </button>
                              <button onClick={() => handleDelete('departments', dept.id)} className="text-red-600 hover:text-red-900" title="Delete department">
                                <Trash2 className="h-4 w-4 inline" />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Purchase Orders Tab */}
      {activeTab === 'purchase-orders' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filter by Site
              </label>
              <select
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value)
                  setSelectedDepartment('')
                  setShowAddForm(false)
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">-- All Sites --</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>
            {selectedSite && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filter by Department
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => {
                    setSelectedDepartment(e.target.value)
                    setShowAddForm(false)
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">-- All Departments --</option>
                  {filteredDepartments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedSite && (
            <>
              {!readOnly && (
              <div className="flex justify-between items-center mb-4">
                <div></div>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Purchase Order
                </button>
              </div>
              )}

              {!readOnly && showAddForm && (
                <form onSubmit={handleAddPO} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Purchase Order</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PO Number *</label>
                      <input
                        type="text"
                        name="po_number"
                        placeholder="PO Number"
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                      <input
                        type="text"
                        name="description"
                        placeholder="Description"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                      <select
                        name="department_id"
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-full h-10 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                      >
                        <option value="">-- Select Department --</option>
                        {filteredDepartments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact</label>
                      <input
                        type="text"
                        name="client_contact_name"
                        placeholder="Client contact"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                      <select name="budget_type" defaultValue="basic" className="w-full h-10 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
                        <option value="basic">Basic</option>
                        <option value="project">Project</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Net Terms</label>
                      <input
                        type="text"
                        name="net_terms"
                        placeholder="e.g. Net 30, Net 60"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">How to Bill</label>
                      <input
                        type="text"
                        name="how_to_bill"
                        placeholder="e.g. Ariba, Fieldglass, Email"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Original Amount ($) *</label>
                      <input
                        type="number"
                        name="original_po_amount"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Issued *</label>
                    <input
                      type="date"
                      name="po_issue_date"
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white md:max-w-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attachments (PO / Proposal)</label>
                    <input
                      type="file"
                      name="attachments"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" name="saveAndView" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading ? 'Saving...' : 'Save and View Details'}
                    </button>
                    <button type="submit" disabled={loading} className="bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-600 disabled:opacity-50">
                      {loading ? 'Adding...' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setShowAddForm(false)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('pos', 'po_number')}
                      >
                        PO Number {getSortIcon('pos', 'po_number')}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('pos', 'description')}
                      >
                        Description {getSortIcon('pos', 'description')}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('pos', 'department')}
                      >
                        Department {getSortIcon('pos', 'department')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedPOs.map((po) => {
                      const dept = departments.find(d => d.id === po.department_id)
                      return (
                        <tr key={po.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{po.po_number}</td>
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{po.description || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{dept?.name || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <Link
                              href={`/dashboard/budget?poId=${po.id}`}
                              className="text-gray-600 hover:text-blue-600 mr-4 inline-flex items-center gap-1"
                              title="View Budget Details"
                            >
                              <FileText className="h-4 w-4" />
                              View Details
                            </Link>
                            {!readOnly && (
                              <>
                                <button onClick={() => setEditingItem({ type: 'po', ...po })} className="text-blue-600 hover:text-blue-900 mr-4" title="Edit PO">
                                  <Edit className="h-4 w-4 inline" />
                                </button>
                                <button onClick={() => handleDelete('purchase_orders', po.id)} className="text-red-600 hover:text-red-900" title="Delete PO">
                                  <Trash2 className="h-4 w-4 inline" />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'expense-types' && (
        <div className="mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Predefined expense types appear in the Add Expense dropdown when adding expenses to a PO budget.
          </p>
          <OptionsManager
            options={initialExpenseTypes}
            tableName="po_expense_types"
            title="Expense Types"
            fields={[{ name: 'name', label: 'Name', type: 'text', required: true }]}
          />
        </div>
      )}

      {activeTab === 'company-info' && (
        <div className="mt-4 space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Company-wide settings. More fields will be added as we progress.
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Company Email Address</label>
              {isAdminOrAbove ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    onBlur={async () => {
                      setCompanyEmailSaving(true)
                      try {
                        const res = await fetch('/api/company-settings', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ company_email: companyEmail }),
                        })
                        if (res.ok) {
                          const json = await res.json()
                          setCompanyEmail(json.company_email ?? '')
                        }
                      } finally {
                        setCompanyEmailSaving(false)
                      }
                    }}
                    placeholder="company@example.com"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                  />
                  {companyEmailSaving && <span className="text-sm text-gray-500 self-center">Saving...</span>}
                </div>
              ) : (
                <p className="text-sm text-gray-900 dark:text-gray-100 py-2">{companyEmail || '—'}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Editable by admins only.</p>
            </div>
          </div>
        </div>
      )}

      {/* Site Detail View (Client card + PO cards) */}
      {siteInfoCard && (
        <SiteDetailView
          site={siteInfoCard}
          departments={departments}
          purchaseOrders={purchaseOrders}
          showBudgetLink={!readOnly}
          onSave={async () => {
            const [siteRes, posRes] = await Promise.all([
              supabase.from('sites').select('*').eq('id', siteInfoCard.id).single(),
              supabase.from('purchase_orders').select('*').in('site_id', [siteInfoCard.id]).order('po_number'),
            ])
            if (siteRes.data) setSites(sites.map((s) => (s.id === siteRes.data.id ? siteRes.data : s)))
            if (posRes.data?.length) setPurchaseOrders((prev) => prev.filter((p) => p.site_id !== siteInfoCard.id).concat(posRes.data))
          }}
          onClose={() => setSiteInfoCard(null)}
          onDepartmentAdded={(dept) => setDepartments((prev) => [...prev, dept])}
          readOnly={readOnly}
        />
      )}

      {/* Edit Modal for Sites, Departments, and POs */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setEditingItem(null)
        }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              {editingItem.type === 'site' && <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edit Site</h3>}
              {editingItem.type === 'department' && <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edit Department</h3>}
              {editingItem.type === 'po' && <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Edit Purchase Order</h3>}
              <button type="button" onClick={() => setEditingItem(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ml-auto" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {editingItem.type === 'site' && (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">For client details and POs, use the document icon.</p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  setLoading(true)
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string
                  try {
                    const { error: updateError } = await supabase
                      .from('sites')
                      .update({ name })
                      .eq('id', editingItem.id)
                    if (updateError) throw updateError
                    setSites(sites.map(s => s.id === editingItem.id ? { ...s, name } : s))
                    setEditingItem(null)
                  } catch (err: any) {
                    setError(err.message || 'An error occurred')
                  } finally {
                    setLoading(false)
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                    <input type="text" name="name" defaultValue={editingItem.name} required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingItem(null)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}

            {editingItem.type === 'department' && (
              <>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  setLoading(true)
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string
                  try {
                    const { error: updateError } = await supabase
                      .from('departments')
                      .update({ name })
                      .eq('id', editingItem.id)
                    if (updateError) throw updateError
                    setDepartments(departments.map(d => d.id === editingItem.id ? { ...d, name } : d))
                    setEditingItem(null)
                  } catch (err: any) {
                    setError(err.message || 'An error occurred')
                  } finally {
                    setLoading(false)
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                    <input type="text" name="name" defaultValue={editingItem.name} required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingItem(null)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}

            {editingItem.type === 'po' && (
              <>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  setLoading(true)
                  const formData = new FormData(e.currentTarget)
                  const poNumber = formData.get('po_number') as string
                  const description = formData.get('description') as string || null
                  const deptId = formData.get('department_id') as string || null
                  try {
                    const { error: updateError } = await supabase
                      .from('purchase_orders')
                      .update({ 
                        po_number: poNumber,
                        description,
                        department_id: deptId || null
                      })
                      .eq('id', editingItem.id)
                    if (updateError) throw updateError
                    setPurchaseOrders(purchaseOrders.map(po => po.id === editingItem.id ? { ...po, po_number: poNumber, description: description || undefined, department_id: deptId || undefined } : po))
                    setEditingItem(null)
                  } catch (err: any) {
                    setError(err.message || 'An error occurred')
                  } finally {
                    setLoading(false)
                  }
                }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PO Number *</label>
                    <input type="text" name="po_number" defaultValue={editingItem.po_number} required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <input type="text" name="description" defaultValue={editingItem.description || ''} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                    <select name="department_id" defaultValue={editingItem.department_id || ''} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
                      <option value="">-- None --</option>
                      {filteredDepartments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {loading ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingItem(null)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500">
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
