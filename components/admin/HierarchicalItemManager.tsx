'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2 } from 'lucide-react'

interface Site {
  id: string
  name: string
  code?: string
}

interface Department {
  id: string
  site_id: string
  name: string
  code?: string
}

interface PurchaseOrder {
  id: string
  site_id: string
  department_id?: string
  po_number: string
  description?: string
}

interface HierarchicalItem {
  id: string
  site_id: string
  department_id?: string
  po_id?: string
  name: string
  code?: string
  description?: string
}

interface HierarchicalItemManagerProps {
  sites: Site[]
  tableName: 'systems' | 'activities' | 'deliverables'
  title: string
  itemName: string // e.g., "System", "Activity", "Deliverable"
}

export default function HierarchicalItemManager({ 
  sites: initialSites, 
  tableName, 
  title,
  itemName 
}: HierarchicalItemManagerProps) {
  const [sites] = useState(initialSites)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [selectedPO, setSelectedPO] = useState<string>('')
  const [items, setItems] = useState<HierarchicalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<HierarchicalItem | null>(null)
  const supabase = createClient()

  const loadDepartments = async (siteId: string) => {
    if (!siteId) {
      setDepartments([])
      setSelectedDepartment('')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('departments')
        .select('*')
        .eq('site_id', siteId)
        .order('name')
      
      if (fetchError) throw fetchError
      setDepartments(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load departments')
    } finally {
      setLoading(false)
    }
  }

  const loadPurchaseOrders = async (siteId: string, departmentId?: string) => {
    if (!siteId) {
      setPurchaseOrders([])
      setSelectedPO('')
      return
    }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .eq('site_id', siteId)
      
      if (departmentId) {
        query = query.eq('department_id', departmentId)
      }
      
      const { data, error: fetchError } = await query.order('po_number')
      
      if (fetchError) throw fetchError
      setPurchaseOrders(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }

  const loadItems = async (siteId: string, departmentId?: string, poId?: string) => {
    if (!siteId) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from(tableName)
        .select('*')
        .eq('site_id', siteId)
      
      if (departmentId) {
        query = query.eq('department_id', departmentId)
      }
      
      if (poId) {
        query = query.eq('po_id', poId)
      }
      
      const { data, error: fetchError } = await query.order('name')
      
      if (fetchError) throw fetchError
      setItems(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId)
    loadDepartments(siteId)
    setSelectedDepartment('')
    setSelectedPO('')
    setShowAddForm(false)
    setEditingItem(null)
    loadPurchaseOrders(siteId)
    loadItems(siteId)
  }

  const handleDepartmentChange = (departmentId: string) => {
    setSelectedDepartment(departmentId)
    setSelectedPO('')
    setShowAddForm(false)
    setEditingItem(null)
    loadPurchaseOrders(selectedSite, departmentId || undefined)
    loadItems(selectedSite, departmentId || undefined)
  }

  const handlePOChange = (poId: string) => {
    setSelectedPO(poId)
    setShowAddForm(false)
    setEditingItem(null)
    loadItems(selectedSite, selectedDepartment || undefined, poId || undefined)
  }

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
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
      const insertData: any = {
        site_id: selectedSite,
        department_id: selectedDepartment || null,
        po_id: selectedPO || null,
        name,
      }

      const { data, error: insertError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single()

      if (insertError) throw insertError

      setItems([...items, data])
      if (e.currentTarget) {
        e.currentTarget.reset()
      }
      setShowAddForm(false)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingItem) return

    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const code = formData.get('code') as string || null

    try {
      const updateData: any = {
        department_id: selectedDepartment || null,
        po_id: selectedPO || null,
        name,
      }
      
      if (code) {
        updateData.code = code
      } else {
        updateData.code = null
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', editingItem.id)

      if (updateError) throw updateError

      setItems(items.map(item => item.id === editingItem.id ? { ...item, department_id: selectedDepartment || undefined, po_id: selectedPO || undefined, name, code: code || undefined } : item))
      setEditingItem(null)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this ${itemName.toLowerCase()}?`)) return

    try {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setItems(items.filter(item => item.id !== id))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }


  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">{title}</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Site Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Site <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedSite}
          onChange={(e) => handleSiteChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
        >
          <option value="">-- Select Site --</option>
          {sites.map(site => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </select>
      </div>

      {/* Department Selection */}
      {selectedSite && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Department (Optional)
          </label>
          <select
            value={selectedDepartment}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="">-- All Departments --</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Purchase Order Selection */}
      {selectedSite && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Purchase Order (Optional)
          </label>
          <select
            value={selectedPO}
            onChange={(e) => handlePOChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="">-- All Purchase Orders --</option>
            {purchaseOrders.map(po => (
              <option key={po.id} value={po.id}>{po.po_number} {po.description ? `- ${po.description}` : ''}</option>
            ))}
          </select>
        </div>
      )}

      {selectedSite && (
        <>
          <div className="flex justify-between items-center mb-6">
            <div></div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add {itemName}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAdd} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New {itemName}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Name *"
                  required
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500"
                >
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {items.map((item) => {
                  const dept = departments.find(d => d.id === item.department_id)
                  const po = purchaseOrders.find(p => p.id === item.po_id)
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{dept?.name || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{po?.po_number || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={async () => {
                            setEditingItem(item)
                            // Set the site first, then load related data
                            if (item.site_id !== selectedSite) {
                              await handleSiteChange(item.site_id)
                            }
                            setSelectedDepartment(item.department_id || '')
                            setSelectedPO(item.po_id || '')
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <Edit className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-red-600 hover:text-red-900"
                        >
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

      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit {itemName}</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingItem.name}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">-- None --</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purchase Order</label>
                <select
                  value={selectedPO}
                  onChange={(e) => setSelectedPO(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                >
                  <option value="">-- None --</option>
                  {purchaseOrders.map(po => (
                    <option key={po.id} value={po.id}>{po.po_number} {po.description ? `- ${po.description}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
