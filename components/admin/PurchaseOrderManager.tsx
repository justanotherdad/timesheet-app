'use client'

import { useState, useEffect } from 'react'
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

interface PurchaseOrderManagerProps {
  sites: Site[]
}

export default function PurchaseOrderManager({ sites: initialSites }: PurchaseOrderManagerProps) {
  const [sites] = useState(initialSites)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<string>('')
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null)
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

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId)
    loadDepartments(siteId)
    setSelectedDepartment('')
    setShowAddForm(false)
    setEditingPO(null)
    loadPurchaseOrders(siteId)
  }

  const handleDepartmentChange = (departmentId: string) => {
    setSelectedDepartment(departmentId)
    setShowAddForm(false)
    setEditingPO(null)
    loadPurchaseOrders(selectedSite, departmentId || undefined)
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
    if (!editingPO) return

    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const poNumber = formData.get('po_number') as string
    const description = formData.get('description') as string || null

    try {
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          department_id: selectedDepartment || null,
          po_number: poNumber,
          description,
        })
        .eq('id', editingPO.id)

      if (updateError) throw updateError

      setPurchaseOrders(purchaseOrders.map(po => po.id === editingPO.id ? { ...po, department_id: selectedDepartment || undefined, po_number: poNumber, description: description || undefined } : po))
      setEditingPO(null)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase order?')) return

    try {
      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setPurchaseOrders(purchaseOrders.filter(po => po.id !== id))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Purchase Orders</h2>

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
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
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
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
          >
            <option value="">-- All Departments --</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
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
              Add Purchase Order
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAdd} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Purchase Order</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="po_number"
                  placeholder="PO Number *"
                  required
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <input
                  type="text"
                  name="description"
                  placeholder="Description"
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">PO Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Department</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {purchaseOrders.map((po) => {
                  const dept = departments.find(d => d.id === po.department_id)
                  return (
                    <tr key={po.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{po.po_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{po.description || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{dept?.name || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setEditingPO(po)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <Edit className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(po.id)}
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

      {editingPO && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Purchase Order</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PO Number *</label>
                <input
                  type="text"
                  name="po_number"
                  defaultValue={editingPO.po_number}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  name="description"
                  defaultValue={editingPO.description || ''}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
                >
                  <option value="">-- None --</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
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
                  onClick={() => setEditingPO(null)}
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
