'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface Site {
  id: string
  name: string
  week_starting_day?: number
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
}

interface ConsolidatedManagerProps {
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
}

type TabType = 'sites' | 'departments' | 'purchase-orders'

export default function ConsolidatedManager({ 
  sites: initialSites, 
  departments: initialDepartments,
  purchaseOrders: initialPOs 
}: ConsolidatedManagerProps) {
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
  
  const supabase = createClient()

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
    let aVal: any, bVal: any
    if (sitesSortColumn === 'name') {
      aVal = a.name.toLowerCase()
      bVal = b.name.toLowerCase()
    } else if (sitesSortColumn === 'week_starting_day') {
      aVal = a.week_starting_day || 1
      bVal = b.week_starting_day || 1
    } else {
      return 0
    }
    
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
    const weekStartingDay = parseInt(formData.get('week_starting_day') as string) || 1

    try {
      const { data, error: insertError } = await supabase
        .from('sites')
        .insert({ name, week_starting_day: weekStartingDay })
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

    try {
      const { data, error: insertError } = await supabase
        .from('purchase_orders')
        .insert({
          site_id: selectedSite,
          department_id: departmentId || null,
          po_number: poNumber,
          description,
        })
        .select()
        .single()

      if (insertError) throw insertError
      setPurchaseOrders([...purchaseOrders, data])
      if (e.currentTarget) e.currentTarget.reset()
      setSelectedDepartment('')
      setShowAddForm(false)
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
      </div>

      {/* Sites Tab */}
      {activeTab === 'sites' && (
        <>
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

          {showAddForm && (
            <form onSubmit={handleAddSite} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Site</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Site Name *"
                  required
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                />
                <input
                  type="number"
                  name="week_starting_day"
                  placeholder="Week Starts On (0=Sun, 1=Mon, etc.) *"
                  defaultValue={1}
                  required
                  min="0"
                  max="6"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
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
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('sites', 'week_starting_day')}
                  >
                    Week Starts {getSortIcon('sites', 'week_starting_day')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sortedSites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{site.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][site.week_starting_day || 1]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button onClick={() => setEditingItem({ type: 'site', ...site })} className="text-blue-600 hover:text-blue-900 mr-4">
                        <Edit className="h-4 w-4 inline" />
                      </button>
                      <button onClick={() => handleDelete('sites', site.id)} className="text-red-600 hover:text-red-900">
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
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

              {showAddForm && (
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
                          <button onClick={() => setEditingItem({ type: 'department', ...dept })} className="text-blue-600 hover:text-blue-900 mr-4">
                            <Edit className="h-4 w-4 inline" />
                          </button>
                          <button onClick={() => handleDelete('departments', dept.id)} className="text-red-600 hover:text-red-900">
                            <Trash2 className="h-4 w-4 inline" />
                          </button>
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

              {showAddForm && (
                <form onSubmit={handleAddPO} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Purchase Order</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      name="po_number"
                      placeholder="PO Number *"
                      required
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                    />
                    <input
                      type="text"
                      name="description"
                      placeholder="Description"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Department (Optional)
                    </label>
                    <select
                      name="department_id"
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="">-- Select Department --</option>
                      {filteredDepartments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
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
                            <button onClick={() => setEditingItem({ type: 'po', ...po })} className="text-blue-600 hover:text-blue-900 mr-4">
                              <Edit className="h-4 w-4 inline" />
                            </button>
                            <button onClick={() => handleDelete('purchase_orders', po.id)} className="text-red-600 hover:text-red-900">
                              <Trash2 className="h-4 w-4 inline" />
                            </button>
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

      {/* Edit Modal for Sites, Departments, and POs */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setEditingItem(null)
          }
        }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onMouseDown={(e) => e.stopPropagation()}>
            {editingItem.type === 'site' && (
              <>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Site</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  setError(null)
                  setLoading(true)
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string
                  const weekStartingDay = parseInt(formData.get('week_starting_day') as string) || 1
                  try {
                    const { error: updateError } = await supabase
                      .from('sites')
                      .update({ name, week_starting_day: weekStartingDay })
                      .eq('id', editingItem.id)
                    if (updateError) throw updateError
                    setSites(sites.map(s => s.id === editingItem.id ? { ...s, name, week_starting_day: weekStartingDay } : s))
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Week Starts On *</label>
                    <select name="week_starting_day" defaultValue={editingItem.week_starting_day || 1} required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white">
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
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

            {editingItem.type === 'department' && (
              <>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Department</h3>
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
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Purchase Order</h3>
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
