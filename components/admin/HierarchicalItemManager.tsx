'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, Edit, Trash2, Upload } from 'lucide-react'

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
  const [allDepartments, setAllDepartments] = useState<Department[]>([]) // All departments for the selected site
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]) // Multiple departments
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [allPurchaseOrders, setAllPurchaseOrders] = useState<PurchaseOrder[]>([]) // All POs for the selected site
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]) // Multiple POs
  const [items, setItems] = useState<HierarchicalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<HierarchicalItem | null>(null)
  const supabase = createClient()

  // Get junction table names based on tableName
  const getJunctionTableNames = () => {
    if (tableName === 'systems') {
      return {
        departments: 'system_departments',
        purchaseOrders: 'system_purchase_orders',
        itemIdColumn: 'system_id'
      }
    } else if (tableName === 'activities') {
      return {
        departments: 'activity_departments',
        purchaseOrders: 'activity_purchase_orders',
        itemIdColumn: 'activity_id'
      }
    } else if (tableName === 'deliverables') {
      return {
        departments: 'deliverable_departments',
        purchaseOrders: 'deliverable_purchase_orders',
        itemIdColumn: 'deliverable_id'
      }
    }
    return { departments: '', purchaseOrders: '', itemIdColumn: '' }
  }

  const loadDepartments = async (siteId: string) => {
    if (!siteId) {
      setDepartments([])
      setAllDepartments([])
      setSelectedDepartments([])
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
      const depts = data || []
      setDepartments(depts)
      setAllDepartments(depts)
    } catch (err: any) {
      setError(err.message || 'Failed to load departments')
    } finally {
      setLoading(false)
    }
  }

  const loadPurchaseOrders = async (siteId: string, departmentIds?: string[]) => {
    if (!siteId) {
      setPurchaseOrders([])
      setAllPurchaseOrders([])
      setSelectedPOs([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('purchase_orders')
        .select('*')
        .eq('site_id', siteId)
      
      // Filter by selected departments if any
      if (departmentIds && departmentIds.length > 0) {
        query = query.in('department_id', departmentIds)
      }
      
      const { data, error: fetchError } = await query.order('po_number')
      
      if (fetchError) throw fetchError
      const pos = data || []
      setPurchaseOrders(pos)
      setAllPurchaseOrders(pos)
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }

  // Load assignments from junction tables
  const loadItemAssignments = async (itemId: string) => {
    const junctionTables = getJunctionTableNames()
    try {
      const [deptsResult, posResult] = await Promise.all([
        supabase.from(junctionTables.departments).select('department_id').eq(junctionTables.itemIdColumn, itemId),
        supabase.from(junctionTables.purchaseOrders).select('purchase_order_id').eq(junctionTables.itemIdColumn, itemId),
      ])
      
      return {
        departments: Array.isArray(deptsResult.data) ? deptsResult.data.map((r: any) => r.department_id) : [],
        purchaseOrders: Array.isArray(posResult.data) ? posResult.data.map((r: any) => r.purchase_order_id) : [],
      }
    } catch (err) {
      console.error('Error loading item assignments:', err)
      return { departments: [], purchaseOrders: [] }
    }
  }

  const loadItems = async (siteId: string) => {
    if (!siteId) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
        .eq('site_id', siteId)
        .order('name')
      
      if (fetchError) throw fetchError
      setItems(data || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const handleSiteChange = async (siteId: string) => {
    setSelectedSite(siteId)
    await loadDepartments(siteId)
    setSelectedDepartments([])
    setSelectedPOs([])
    setShowAddForm(false)
    setEditingItem(null)
    await loadPurchaseOrders(siteId)
    await loadItems(siteId)
  }

  // Filter purchase orders by selected departments
  const filteredPurchaseOrders = allPurchaseOrders.filter(po => {
    if (selectedDepartments.length === 0) return true
    if (!po.department_id) return false
    return selectedDepartments.includes(po.department_id)
  })

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
      // Insert the main item (without department_id/po_id - those go in junction tables)
      const insertData: any = {
        site_id: selectedSite,
        name,
      }

      const { data: newItem, error: insertError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select()
        .single()

      if (insertError) throw insertError

      // Insert into junction tables for departments and POs
      const junctionTables = getJunctionTableNames()
      
      if (selectedDepartments.length > 0) {
        const deptInserts = selectedDepartments.map(deptId => ({
          [junctionTables.itemIdColumn]: newItem.id,
          department_id: deptId
        }))
        const { error: deptError } = await supabase
          .from(junctionTables.departments)
          .insert(deptInserts)
        if (deptError) throw deptError
      }

      if (selectedPOs.length > 0) {
        const poInserts = selectedPOs.map(poId => ({
          [junctionTables.itemIdColumn]: newItem.id,
          purchase_order_id: poId
        }))
        const { error: poError } = await supabase
          .from(junctionTables.purchaseOrders)
          .insert(poInserts)
        if (poError) throw poError
      }

      await loadItems(selectedSite)
      if (e.currentTarget) {
        e.currentTarget.reset()
      }
      setSelectedDepartments([])
      setSelectedPOs([])
      setShowAddForm(false)
      setSuccess(`${itemName} added successfully`)
      setTimeout(() => setSuccess(null), 3000)
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
      // Update the main item
      const updateData: any = { name }
      
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

      // Update junction tables
      const junctionTables = getJunctionTableNames()
      
      // Delete existing department assignments
      await supabase
        .from(junctionTables.departments)
        .delete()
        .eq(junctionTables.itemIdColumn, editingItem.id)
      
      // Insert new department assignments
      if (selectedDepartments.length > 0) {
        const deptInserts = selectedDepartments.map(deptId => ({
          [junctionTables.itemIdColumn]: editingItem.id,
          department_id: deptId
        }))
        const { error: deptError } = await supabase
          .from(junctionTables.departments)
          .insert(deptInserts)
        if (deptError) throw deptError
      }

      // Delete existing PO assignments
      await supabase
        .from(junctionTables.purchaseOrders)
        .delete()
        .eq(junctionTables.itemIdColumn, editingItem.id)
      
      // Insert new PO assignments
      if (selectedPOs.length > 0) {
        const poInserts = selectedPOs.map(poId => ({
          [junctionTables.itemIdColumn]: editingItem.id,
          purchase_order_id: poId
        }))
        const { error: poError } = await supabase
          .from(junctionTables.purchaseOrders)
          .insert(poInserts)
        if (poError) throw poError
      }

      await loadItems(selectedSite)
      setEditingItem(null)
      setSelectedDepartments([])
      setSelectedPOs([])
      setSuccess(`${itemName} updated successfully`)
      setTimeout(() => setSuccess(null), 3000)
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

  // State to store item assignments for display
  const [itemAssignments, setItemAssignments] = useState<Record<string, { departments: string[]; purchaseOrders: string[] }>>({})

  // Load assignments for all items when items or site changes
  useEffect(() => {
    const loadAllAssignments = async () => {
      if (items.length === 0 || !selectedSite) {
        setItemAssignments({})
        return
      }
      
      const junctionTables = getJunctionTableNames()
      const assignmentsMap: Record<string, { departments: string[]; purchaseOrders: string[] }> = {}

      await Promise.all(
        items.map(async (item) => {
          try {
            const [deptsResult, posResult] = await Promise.all([
              supabase.from(junctionTables.departments).select('department_id').eq(junctionTables.itemIdColumn, item.id),
              supabase.from(junctionTables.purchaseOrders).select('purchase_order_id').eq(junctionTables.itemIdColumn, item.id),
            ])
            
            assignmentsMap[item.id] = {
              departments: Array.isArray(deptsResult.data) ? deptsResult.data.map((r: any) => r.department_id) : [],
              purchaseOrders: Array.isArray(posResult.data) ? posResult.data.map((r: any) => r.purchase_order_id) : [],
            }
          } catch (err) {
            console.error(`Error loading assignments for item ${item.id}:`, err)
            assignmentsMap[item.id] = { departments: [], purchaseOrders: [] }
          }
        })
      )

      setItemAssignments(assignmentsMap)
    }

    loadAllAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(i => i.id).join(','), selectedSite])

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedSite) {
      setError('Please select a site first')
      return
    }

    // Simple CSV parsing (can be enhanced for Excel)
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      setError('CSV file must have at least a header row and one data row')
      return
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const itemsToAdd = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const nameIdx = headers.findIndex(h => h.includes('name'))
        const descriptionIdx = tableName === 'systems' 
          ? headers.findIndex(h => h.includes('description') || h.includes('desc'))
          : -1
        
        const insertData: any = {
          site_id: selectedSite,
          name: values[nameIdx] || '',
        }
        
        if (tableName === 'systems' && descriptionIdx >= 0) {
          insertData.description = values[descriptionIdx] || null
        }

        return insertData
      }).filter(item => item.name)

      if (itemsToAdd.length === 0) {
        setError('No valid items found in CSV file')
        return
      }

      // Insert items first
      const { data: insertedItems, error: insertError } = await supabase
        .from(tableName)
        .insert(itemsToAdd)
        .select()

      if (insertError) throw insertError

      // Then insert into junction tables if departments/POs are selected
      const junctionTables = getJunctionTableNames()
      if (selectedDepartments.length > 0 || selectedPOs.length > 0) {
        const junctionInserts: any[] = []
        
        insertedItems?.forEach((item: any) => {
          selectedDepartments.forEach(deptId => {
            junctionInserts.push({
              [junctionTables.itemIdColumn]: item.id,
              department_id: deptId
            })
          })
          selectedPOs.forEach(poId => {
            junctionInserts.push({
              [junctionTables.itemIdColumn]: item.id,
              purchase_order_id: poId
            })
          })
        })

        if (junctionInserts.length > 0) {
          // Split into department and PO inserts
          const deptInserts = junctionInserts.filter(j => j.department_id)
          const poInserts = junctionInserts.filter(j => j.purchase_order_id)
          
          if (deptInserts.length > 0) {
            await supabase.from(junctionTables.departments).insert(deptInserts)
          }
          if (poInserts.length > 0) {
            await supabase.from(junctionTables.purchaseOrders).insert(poInserts)
          }
        }
      }

      await loadItems(selectedSite)
      setSuccess(`Successfully imported ${itemsToAdd.length} ${itemName.toLowerCase()}s`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      setError(err.message || 'Failed to import items')
    } finally {
      setLoading(false)
      e.target.value = ''
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

      {success && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded mb-4">
          {success}
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


      {selectedSite && (
        <>
          <div className="flex justify-between items-center mb-6">
            <div>
              <label className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 cursor-pointer inline-block">
                <Upload className="h-4 w-4" />
                Import CSV
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleExcelImport}
                  className="hidden"
                />
              </label>
            </div>
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
              <div>
                <input
                  type="text"
                  name="name"
                  placeholder="Name *"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                />
              </div>
              
              {/* Multiple Departments Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Departments (Select Multiple)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {allDepartments.length > 0 ? (
                    allDepartments.map(dept => (
                      <label key={dept.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDepartments.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDepartments([...selectedDepartments, dept.id])
                            } else {
                              setSelectedDepartments(selectedDepartments.filter(id => id !== dept.id))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{dept.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No departments available for this site</p>
                  )}
                </div>
              </div>

              {/* Multiple Purchase Orders Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Purchase Orders (Select Multiple)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {allPurchaseOrders.length > 0 ? (
                    allPurchaseOrders.map(po => (
                      <label key={po.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPOs.includes(po.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPOs([...selectedPOs, po.id])
                            } else {
                              setSelectedPOs(selectedPOs.filter(id => id !== po.id))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {po.po_number} {po.description ? `- ${po.description}` : ''}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No purchase orders available for this site</p>
                  )}
                </div>
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
                  onClick={() => {
                    setShowAddForm(false)
                    setSelectedDepartments([])
                    setSelectedPOs([])
                  }}
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
                  const assignments = itemAssignments[item.id] || { departments: [], purchaseOrders: [] }
                  const deptNames = assignments.departments.map(deptId => allDepartments.find(d => d.id === deptId)?.name).filter(Boolean)
                  const poNumbers = assignments.purchaseOrders.map(poId => allPurchaseOrders.find(p => p.id === poId)?.po_number).filter(Boolean)
                  
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {deptNames.length > 0 ? deptNames.join(', ') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {poNumbers.length > 0 ? poNumbers.join(', ') : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={async () => {
                            setEditingItem(item)
                            if (item.site_id !== selectedSite) {
                              await handleSiteChange(item.site_id)
                            }
                            // Load assignments from junction tables
                            const itemAssignments = await loadItemAssignments(item.id)
                            setSelectedDepartments(itemAssignments.departments)
                            setSelectedPOs(itemAssignments.purchaseOrders)
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
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setEditingItem(null)
              setSelectedDepartments([])
              setSelectedPOs([])
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
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
              
              {/* Multiple Departments Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Departments (Select Multiple)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {allDepartments.length > 0 ? (
                    allDepartments.map(dept => (
                      <label key={dept.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedDepartments.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDepartments([...selectedDepartments, dept.id])
                            } else {
                              setSelectedDepartments(selectedDepartments.filter(id => id !== dept.id))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{dept.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No departments available for this site</p>
                  )}
                </div>
              </div>

              {/* Multiple Purchase Orders Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Purchase Orders (Select Multiple)
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {allPurchaseOrders.length > 0 ? (
                    allPurchaseOrders.map(po => (
                      <label key={po.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPOs.includes(po.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPOs([...selectedPOs, po.id])
                            } else {
                              setSelectedPOs(selectedPOs.filter(id => id !== po.id))
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {po.po_number} {po.description ? `- ${po.description}` : ''}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No purchase orders available for this site</p>
                  )}
                </div>
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
                  onClick={() => {
                    setEditingItem(null)
                    setSelectedDepartments([])
                    setSelectedPOs([])
                  }}
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
