'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Plus, Edit, Trash2, Upload, X, CheckSquare, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

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
  const [selectedItems, setSelectedItems] = useState<string[]>([]) // For bulk operations
  const [showBulkActions, setShowBulkActions] = useState(false) // Bulk actions modal
  // Separate state for assign vs remove operations
  const [bulkAssignDepartments, setBulkAssignDepartments] = useState<string[]>([])
  const [bulkRemoveDepartments, setBulkRemoveDepartments] = useState<string[]>([])
  const [bulkAssignPOs, setBulkAssignPOs] = useState<string[]>([])
  const [bulkRemovePOs, setBulkRemovePOs] = useState<string[]>([])
  const [sortColumn, setSortColumn] = useState<string>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const supabase = createClient()

  // State to store item assignments for display
  const [itemAssignments, setItemAssignments] = useState<Record<string, { departments: string[]; purchaseOrders: string[] }>>({})

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
    setSelectedItems([]) // Clear bulk selection when site changes
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
      setSelectedItems(selectedItems.filter(itemId => itemId !== id))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedItems.length} ${itemName.toLowerCase()}${selectedItems.length > 1 ? 's' : ''}?`)) return

    setLoading(true)
    setError(null)
    try {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .in('id', selectedItems)

      if (deleteError) throw deleteError

      // Clear assignments cache and reload
      setItemAssignments({})
      await loadItems(selectedSite)
      setSelectedItems([])
      setShowBulkActions(false)
      setSuccess(`Successfully deleted ${selectedItems.length} ${itemName.toLowerCase()}${selectedItems.length > 1 ? 's' : ''}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkApplyChanges = async () => {
    if (selectedItems.length === 0) return
    
    // Check if there are any changes to apply
    const hasDeptChanges = bulkAssignDepartments.length > 0 || bulkRemoveDepartments.length > 0
    const hasPOChanges = bulkAssignPOs.length > 0 || bulkRemovePOs.length > 0
    
    if (!hasDeptChanges && !hasPOChanges) {
      setError('Please select at least one department or purchase order to assign or remove')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const junctionTables = getJunctionTableNames()

      // Handle department assignments
      if (bulkAssignDepartments.length > 0) {
        // Remove existing assignments first to avoid duplicates
        for (const itemId of selectedItems) {
          const { error } = await supabase
            .from(junctionTables.departments)
            .delete()
            .eq(junctionTables.itemIdColumn, itemId)
            .in('department_id', bulkAssignDepartments)
          if (error) throw error
        }

        const deptInserts: any[] = []
        selectedItems.forEach(itemId => {
          bulkAssignDepartments.forEach(deptId => {
            deptInserts.push({
              [junctionTables.itemIdColumn]: itemId,
              department_id: deptId
            })
          })
        })

        if (deptInserts.length > 0) {
          const { error } = await supabase
            .from(junctionTables.departments)
            .insert(deptInserts)
          if (error) throw error
        }
      }

      // Handle department removals
      if (bulkRemoveDepartments.length > 0) {
        for (const itemId of selectedItems) {
          const { error } = await supabase
            .from(junctionTables.departments)
            .delete()
            .eq(junctionTables.itemIdColumn, itemId)
            .in('department_id', bulkRemoveDepartments)
          if (error) throw error
        }
      }

      // Handle PO assignments
      if (bulkAssignPOs.length > 0) {
        // Remove existing assignments first to avoid duplicates
        for (const itemId of selectedItems) {
          const { error } = await supabase
            .from(junctionTables.purchaseOrders)
            .delete()
            .eq(junctionTables.itemIdColumn, itemId)
            .in('purchase_order_id', bulkAssignPOs)
          if (error) throw error
        }

        const poInserts: any[] = []
        selectedItems.forEach(itemId => {
          bulkAssignPOs.forEach(poId => {
            poInserts.push({
              [junctionTables.itemIdColumn]: itemId,
              purchase_order_id: poId
            })
          })
        })

        if (poInserts.length > 0) {
          const { error } = await supabase
            .from(junctionTables.purchaseOrders)
            .insert(poInserts)
          if (error) throw error
        }
      }

      // Handle PO removals
      if (bulkRemovePOs.length > 0) {
        for (const itemId of selectedItems) {
          const { error } = await supabase
            .from(junctionTables.purchaseOrders)
            .delete()
            .eq(junctionTables.itemIdColumn, itemId)
            .in('purchase_order_id', bulkRemovePOs)
          if (error) throw error
        }
      }

      // Build success message
      const messages: string[] = []
      if (bulkAssignDepartments.length > 0) {
        messages.push(`assigned ${bulkAssignDepartments.length} department${bulkAssignDepartments.length > 1 ? 's' : ''}`)
      }
      if (bulkRemoveDepartments.length > 0) {
        messages.push(`removed ${bulkRemoveDepartments.length} department${bulkRemoveDepartments.length > 1 ? 's' : ''}`)
      }
      if (bulkAssignPOs.length > 0) {
        messages.push(`assigned ${bulkAssignPOs.length} purchase order${bulkAssignPOs.length > 1 ? 's' : ''}`)
      }
      if (bulkRemovePOs.length > 0) {
        messages.push(`removed ${bulkRemovePOs.length} purchase order${bulkRemovePOs.length > 1 ? 's' : ''}`)
      }

      // Clear assignments cache and reload
      setItemAssignments({})
      await loadItems(selectedSite)
      setSelectedItems([])
      setBulkAssignDepartments([])
      setBulkRemoveDepartments([])
      setBulkAssignPOs([])
      setBulkRemovePOs([])
      setShowBulkActions(false)
      setSuccess(`Successfully ${messages.join(', ')} for ${selectedItems.length} ${itemName.toLowerCase()}${selectedItems.length > 1 ? 's' : ''}`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(items.map(item => item.id))
    } else {
      setSelectedItems([])
    }
  }

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, itemId])
    } else {
      setSelectedItems(selectedItems.filter(id => id !== itemId))
    }
  }

  // Sorting functions
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Helper to render sort icon
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-50" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />
  }

  // Sort items based on current sort column and direction
  const sortedItems = [...items].sort((a, b) => {
    let aVal: any
    let bVal: any

    if (sortColumn === 'name') {
      aVal = a.name.toLowerCase()
      bVal = b.name.toLowerCase()
    } else if (sortColumn === 'department') {
      const aAssignments = itemAssignments[a.id] || { departments: [], purchaseOrders: [] }
      const bAssignments = itemAssignments[b.id] || { departments: [], purchaseOrders: [] }
      const aDeptNames = aAssignments.departments.map(deptId => allDepartments.find(d => d.id === deptId)?.name).filter((name): name is string => Boolean(name))
      const bDeptNames = bAssignments.departments.map(deptId => allDepartments.find(d => d.id === deptId)?.name).filter((name): name is string => Boolean(name))
      const aFirstDept = aDeptNames[0]
      const bFirstDept = bDeptNames[0]
      aVal = aFirstDept ? aFirstDept.toLowerCase() : 'zzz' // 'zzz' to sort N/A to bottom
      bVal = bFirstDept ? bFirstDept.toLowerCase() : 'zzz'
    } else if (sortColumn === 'po') {
      const aAssignments = itemAssignments[a.id] || { departments: [], purchaseOrders: [] }
      const bAssignments = itemAssignments[b.id] || { departments: [], purchaseOrders: [] }
      const aPONumbers = aAssignments.purchaseOrders.map(poId => allPurchaseOrders.find(p => p.id === poId)?.po_number).filter((po): po is string => Boolean(po))
      const bPONumbers = bAssignments.purchaseOrders.map(poId => allPurchaseOrders.find(p => p.id === poId)?.po_number).filter((po): po is string => Boolean(po))
      const aFirstPO = aPONumbers[0]
      const bFirstPO = bPONumbers[0]
      aVal = aFirstPO ? aFirstPO.toLowerCase() : 'zzz' // 'zzz' to sort N/A to bottom
      bVal = bFirstPO ? bFirstPO.toLowerCase() : 'zzz'
    } else {
      return 0
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

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
          {/* CSV Import Section with Department/PO Selection */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Import CSV</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Select departments and/or purchase orders below to assign them to all imported items. This is optional - you can import without assignments and edit items later.
            </p>
            
            {/* Multiple Departments Selection for Import */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Departments (Select Multiple - Optional)
              </label>
              <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800">
                {allDepartments.length > 0 ? (
                  allDepartments.map(dept => (
                    <label key={dept.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
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

            {/* Multiple Purchase Orders Selection for Import */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Purchase Orders (Select Multiple - Optional)
              </label>
              <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800">
                {allPurchaseOrders.length > 0 ? (
                  allPurchaseOrders.map(po => (
                    <label key={po.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
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

            {/* Import Button */}
            <div>
              <label className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 cursor-pointer inline-block">
                <Upload className="h-4 w-4" />
                Import CSV File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleExcelImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end items-center mb-6">
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

          {/* Bulk Actions Bar */}
          {selectedItems.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {selectedItems.length} {itemName.toLowerCase()}{selectedItems.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowBulkActions(true)
                    setBulkAssignDepartments([])
                    setBulkRemoveDepartments([])
                    setBulkAssignPOs([])
                    setBulkRemovePOs([])
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <CheckSquare className="h-4 w-4" />
                  Bulk Actions
                </button>
                <button
                  onClick={() => setSelectedItems([])}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedItems.length === items.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('name')}
                  >
                    Name {getSortIcon('name')}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('department')}
                  >
                    Department {getSortIcon('department')}
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('po')}
                  >
                    PO {getSortIcon('po')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {sortedItems.map((item) => {
                  const assignments = itemAssignments[item.id] || { departments: [], purchaseOrders: [] }
                  const deptNames = assignments.departments.map(deptId => allDepartments.find(d => d.id === deptId)?.name).filter(Boolean)
                  const poNumbers = assignments.purchaseOrders.map(poId => allPurchaseOrders.find(p => p.id === poId)?.po_number).filter(Boolean)
                  
                  return (
                    <tr key={item.id} className={selectedItems.includes(item.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(item.id)}
                          onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
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

      {/* Bulk Actions Modal */}
      {showBulkActions && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowBulkActions(false)
              setBulkAssignDepartments([])
              setBulkRemoveDepartments([])
              setBulkAssignPOs([])
              setBulkRemovePOs([])
            }
          }}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Bulk Actions ({selectedItems.length} {itemName.toLowerCase()}{selectedItems.length > 1 ? 's' : ''})
              </h3>
              <button
                onClick={() => {
                  setShowBulkActions(false)
                  setBulkAssignDepartments([])
                  setBulkRemoveDepartments([])
                  setBulkAssignPOs([])
                  setBulkRemovePOs([])
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Departments Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Departments</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select departments to assign (add) or remove from selected items</p>
                
                {/* Assign Departments */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Assign (Add) Departments:</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                    {allDepartments.length > 0 ? (
                      allDepartments.map(dept => (
                        <label key={dept.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkAssignDepartments.includes(dept.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkAssignDepartments([...bulkAssignDepartments, dept.id])
                                // Remove from remove list if it's there
                                setBulkRemoveDepartments(bulkRemoveDepartments.filter(id => id !== dept.id))
                              } else {
                                setBulkAssignDepartments(bulkAssignDepartments.filter(id => id !== dept.id))
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">{dept.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No departments available</p>
                    )}
                  </div>
                </div>

                {/* Remove Departments */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Remove Departments:</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                    {allDepartments.length > 0 ? (
                      allDepartments.map(dept => (
                        <label key={dept.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkRemoveDepartments.includes(dept.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkRemoveDepartments([...bulkRemoveDepartments, dept.id])
                                // Remove from assign list if it's there
                                setBulkAssignDepartments(bulkAssignDepartments.filter(id => id !== dept.id))
                              } else {
                                setBulkRemoveDepartments(bulkRemoveDepartments.filter(id => id !== dept.id))
                              }
                            }}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">{dept.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No departments available</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Purchase Orders Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Purchase Orders</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select purchase orders to assign (add) or remove from selected items</p>
                
                {/* Assign Purchase Orders */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Assign (Add) Purchase Orders:</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                    {allPurchaseOrders.length > 0 ? (
                      allPurchaseOrders.map(po => (
                        <label key={po.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkAssignPOs.includes(po.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkAssignPOs([...bulkAssignPOs, po.id])
                                // Remove from remove list if it's there
                                setBulkRemovePOs(bulkRemovePOs.filter(id => id !== po.id))
                              } else {
                                setBulkAssignPOs(bulkAssignPOs.filter(id => id !== po.id))
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
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No purchase orders available</p>
                    )}
                  </div>
                </div>

                {/* Remove Purchase Orders */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Remove Purchase Orders:</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                    {allPurchaseOrders.length > 0 ? (
                      allPurchaseOrders.map(po => (
                        <label key={po.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkRemovePOs.includes(po.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkRemovePOs([...bulkRemovePOs, po.id])
                                // Remove from assign list if it's there
                                setBulkAssignPOs(bulkAssignPOs.filter(id => id !== po.id))
                              } else {
                                setBulkRemovePOs(bulkRemovePOs.filter(id => id !== po.id))
                              }
                            }}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {po.po_number} {po.description ? `- ${po.description}` : ''}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No purchase orders available</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Apply Changes Button */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  onClick={handleBulkApplyChanges}
                  disabled={loading || (bulkAssignDepartments.length === 0 && bulkRemoveDepartments.length === 0 && bulkAssignPOs.length === 0 && bulkRemovePOs.length === 0)}
                  className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Applying Changes...' : 'Apply All Changes'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                  This will apply all selected assignments and removals at once
                </p>
              </div>

              {/* Delete Selected Items */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">Danger Zone</h4>
                <button
                  onClick={handleBulkDelete}
                  disabled={loading}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete {selectedItems.length} Selected {itemName}{selectedItems.length > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
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
