'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Edit, Trash2 } from 'lucide-react'

interface Option {
  id: string
  name: string
  code?: string
  description?: string
  [key: string]: any
}

interface OptionsManagerProps {
  options: Option[]
  tableName: string
  title: string
  fields: Array<{
    name: string
    label: string
    type?: 'text' | 'number'
    required?: boolean
  }>
}

export default function OptionsManager({ options: initialOptions, tableName, title, fields }: OptionsManagerProps) {
  const [options, setOptions] = useState(initialOptions)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingOption, setEditingOption] = useState<Option | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data: any = {}
    fields.forEach(field => {
      const value = formData.get(field.name)
      if (value) {
        data[field.name] = field.type === 'number' ? parseFloat(value as string) : value
      }
    })

    try {
      const { data: newOption, error: insertError } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single()

      if (insertError) throw insertError

      setOptions([...options, newOption])
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
    if (!editingOption) return

    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data: any = {}
    fields.forEach(field => {
      const value = formData.get(field.name)
      if (value !== null) {
        data[field.name] = field.type === 'number' ? parseFloat(value as string) : value
      }
    })

    try {
      const { error: updateError } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', editingOption.id)

      if (updateError) throw updateError

      setOptions(options.map(opt => opt.id === editingOption.id ? { ...opt, ...data } : opt))
      setEditingOption(null)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return

    try {
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setOptions(options.filter(opt => opt.id !== id))
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add {title.slice(0, -1)}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New {title.slice(0, -1)}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {fields.map(field => (
              <input
                key={field.name}
                type={field.type || 'text'}
                name={field.name}
                placeholder={field.label}
                required={field.required}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            ))}
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
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300"
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
              {fields.map(field => (
                <th key={field.name} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {field.label}
                </th>
              ))}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {options.map((option) => (
              <tr key={option.id}>
                {fields.map(field => (
                  <td key={field.name} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {option[field.name] || 'N/A'}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => setEditingOption(option)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    <Edit className="h-4 w-4 inline" />
                  </button>
                  <button
                    onClick={() => handleDelete(option.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingOption && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit {title.slice(0, -1)}</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              {fields.map(field => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    name={field.name}
                    defaultValue={editingOption[field.name] || ''}
                    required={field.required}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white placeholder:text-gray-400"
                  />
                </div>
              ))}
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
                  onClick={() => setEditingOption(null)}
                  className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300"
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

