'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2 } from 'lucide-react'

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
  const supabase = createClient()

  const filteredDepartments = selectedSite 
    ? departments.filter(d => d.site_id === selectedSite)
    : []

  const filteredPOs = purchaseOrders.filter(po => {
    if (selectedSite && po.site_id !== selectedSite) return false
    if (selectedDepartment && po.department_id !== selectedDepartment) return false
    return true
  })

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

    try {
      const { data, error: insertError } = await supabase
        .from('purchase_orders')
        .insert({
          site_id: selectedSite,
          department_id: selectedDepartment || null,
          po_number: poNumber,
          description,
        })
        .select()
        .single()

      if (insertError) throw insertError
      setPurchaseOrders([...purchaseOrders, data])
      if (e.currentTarget) e.currentTarget.reset()
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Week Starts</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sites.map((site) => (
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredDepartments.map((dept) => (
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Department</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPOs.map((po) => {
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
    </div>
  )
}
