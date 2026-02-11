'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2, Upload, Download } from 'lucide-react'

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

interface SiteDepartmentManagerProps {
  sites: Site[]
}

export default function SiteDepartmentManager({ sites: initialSites }: SiteDepartmentManagerProps) {
  const [sites] = useState(initialSites)
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const supabase = createClient()

  const loadDepartments = async (siteId: string) => {
    if (!siteId) {
      setDepartments([])
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

  const handleSiteChange = (siteId: string) => {
    setSelectedSite(siteId)
    loadDepartments(siteId)
    setShowAddForm(false)
    setEditingDept(null)
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
      const { data, error: insertError } = await supabase
        .from('departments')
        .insert({
          site_id: selectedSite,
          name,
        })
        .select()
        .single()

      if (insertError) throw insertError

      setDepartments([...departments, data])
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
    if (!editingDept) return

    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string

    try {
      const { error: updateError } = await supabase
        .from('departments')
        .update({ name })
        .eq('id', editingDept.id)

      if (updateError) throw updateError

      setDepartments(departments.map(d => d.id === editingDept.id ? { ...d, name } : d))
      setEditingDept(null)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return

    try {
      const { error: deleteError } = await supabase
        .from('departments')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setDepartments(departments.filter(d => d.id !== id))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedSite) {
      setError('Please select a site first')
      return
    }

    // Simple CSV parsing (can be enhanced for Excel)
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\r$/, ''))
    
    setLoading(true)
    setError(null)

    try {
      let nameIdx = headers.findIndex((h: string) => h.includes('name') || h.includes('department'))
      if (nameIdx === -1) nameIdx = 0

      const deptsToAdd = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/\r$/, ''))
        return {
          site_id: selectedSite,
          name: values[nameIdx] || '',
        }
      }).filter(d => d.name)

      const { error: insertError } = await supabase
        .from('departments')
        .insert(deptsToAdd)

      if (insertError) throw insertError

      await loadDepartments(selectedSite)
      alert(`Successfully imported ${deptsToAdd.length} departments`)
    } catch (err: any) {
      setError(err.message || 'Failed to import departments')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const handleExcelExport = () => {
    if (departments.length === 0) {
      setError('No departments to export')
      return
    }

    const csv = [
      ['Name'].join(','),
      ...departments.map(d => [d.name].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `departments_${sites.find(s => s.id === selectedSite)?.name || 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Departments</h2>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            CSV format: .csv file, first row = header with a column named &quot;Name&quot; or &quot;Department&quot;. One department per row.
          </p>
          <div className="flex gap-2">
          <label className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2 cursor-pointer">
            <Upload className="h-4 w-4" />
            Import CSV
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleExcelImport}
              className="hidden"
            />
            </label>
          {departments.length > 0 && (
            <button
              onClick={handleExcelExport}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Site Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Site
        </label>
        <select
          value={selectedSite}
          onChange={(e) => handleSiteChange(e.target.value)}
          className="w-full md:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
        >
          <option value="">-- Select a site --</option>
          {sites.map(site => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {selectedSite && (
        <>
          {showAddForm && (
            <form onSubmit={handleAdd} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New Department</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  name="name"
                  placeholder="Department Name"
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
                  {loading ? 'Adding...' : 'Add Department'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!showAddForm && !editingDept && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Department
            </button>
          )}

          {loading && departments.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Loading departments...</p>
          ) : departments.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">No departments found. Add one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {departments.map((dept) => (
                    <tr key={dept.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{dept.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setEditingDept(dept)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                        >
                          <Edit className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDelete(dept.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingDept && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Department</h3>
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editingDept.name}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
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
                      onClick={() => setEditingDept(null)}
                      className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
