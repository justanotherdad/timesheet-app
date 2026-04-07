'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { formatDate, getCalendarDateStringInAppTimezone } from '@/lib/utils'

interface DelegationSelf {
  id: string
  delegate_id: string
  delegateName: string
  start_date: string
  end_date: string
  created_at: string
  include_delegation_note_in_approval?: boolean
}

interface DelegationAdmin extends DelegationSelf {
  delegator_id: string
  delegatorName: string
}

interface User {
  id: string
  name: string
}

const emptyForm = () => ({
  delegator_id: '',
  delegate_id: '',
  start_date: '',
  end_date: '',
  include_delegation_note_in_approval: false,
})

export interface DelegationManagerProps {
  mode?: 'self' | 'admin'
  readOnly?: boolean
}

export default function DelegationManager({ mode = 'self', readOnly = false }: DelegationManagerProps) {
  const isAdmin = mode === 'admin'
  const [delegations, setDelegations] = useState<(DelegationSelf | DelegationAdmin)[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = isAdmin ? 'admin=1&users=1' : 'users=1'
      const res = await fetch(`/api/delegations?${qs}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      if (Array.isArray(data)) {
        setDelegations(data)
      } else {
        setDelegations(data.delegations || [])
        setUsers(data.users || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  const toggleAddForm = () => {
    if (showForm) {
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
    } else {
      setEditingId(null)
      setForm(emptyForm())
      setShowForm(true)
    }
  }

  const startEdit = (d: DelegationSelf | DelegationAdmin) => {
    setEditingId(d.id)
    setForm({
      delegator_id: isAdmin ? (d as DelegationAdmin).delegator_id : '',
      delegate_id: d.delegate_id,
      start_date: d.start_date.slice(0, 10),
      end_date: d.end_date.slice(0, 10),
      include_delegation_note_in_approval: Boolean(d.include_delegation_note_in_approval),
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isAdmin) {
      if (!form.delegator_id || !form.delegate_id || !form.start_date || !form.end_date) {
        setError('Please select delegator, delegate, and enter start and end dates.')
        return
      }
    } else {
      if (!form.delegate_id || !form.start_date || !form.end_date) {
        setError('Please select a delegate and enter start and end dates.')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const body: Record<string, unknown> = {
          delegate_id: form.delegate_id,
          start_date: form.start_date,
          end_date: form.end_date,
          include_delegation_note_in_approval: form.include_delegation_note_in_approval,
        }
        if (isAdmin) {
          body.delegator_id = form.delegator_id
        }
        const res = await fetch(`/api/delegations/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to update')
      } else {
        const body: Record<string, unknown> = {
          delegate_id: form.delegate_id,
          start_date: form.start_date,
          end_date: form.end_date,
          include_delegation_note_in_approval: form.include_delegation_note_in_approval,
        }
        if (isAdmin) {
          body.delegator_id = form.delegator_id
        }
        const res = await fetch('/api/delegations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create')
      }
      setForm(emptyForm())
      setEditingId(null)
      setShowForm(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this delegation?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/delegations/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      if (editingId === id) {
        setEditingId(null)
        setShowForm(false)
        setForm(emptyForm())
      }
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const today = getCalendarDateStringInAppTimezone()

  const statusBadge = (d: DelegationSelf) => {
    if (d.end_date < today) return <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">Expired</span>
    if (d.start_date > today) return <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">Upcoming</span>
    return <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200">Active</span>
  }

  const filteredUsers = users.filter((u) => u.id)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {isAdmin ? (
          <>
            Manage <strong>timesheet approval</strong> delegations for any user. Each row shows who is delegating (delegator) and who may approve on their behalf (delegate). The delegate may be any user, including someone with only the employee role.
          </>
        ) : (
          <>
            Delegate your timesheet approval responsibility to another person for a specified period. During that time, they can approve (and reject) timesheets on your behalf. The delegate can be any user (including employees who are not otherwise in an approver role). After the end date, the delegation automatically expires. Active dates use US Eastern time for “today” (not UTC), and are independent of a timesheet’s week ending.
          </>
        )}
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          {isAdmin ? 'All timesheet delegations' : 'Your delegations'}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={toggleAddForm}
            className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Close' : 'Add delegation'}
          </button>
        )}
      </div>

      {!readOnly && showForm && (
        <form onSubmit={handleSubmit} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-4">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {editingId ? 'Edit delegation' : 'New delegation'}
          </p>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delegator</label>
              <select
                value={form.delegator_id}
                onChange={(e) => setForm((f) => ({ ...f, delegator_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              >
                <option value="">Select who is delegating</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delegate to</label>
            <select
              value={form.delegate_id}
              onChange={(e) => setForm((f) => ({ ...f, delegate_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            >
              <option value="">Select person</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.include_delegation_note_in_approval}
              onChange={(e) => setForm((f) => ({ ...f, include_delegation_note_in_approval: e.target.checked }))}
              className="mt-1 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Add delegation note to approval: when the delegate approves, the timesheet approval line shows the delegate’s name and that they approved on behalf of the original approver.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                setForm(emptyForm())
              }}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : delegations.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isAdmin ? 'No delegations recorded.' : 'No delegations. Add one above to delegate your approval activity.'}
        </p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                {isAdmin && (
                  <th className="text-left py-2 px-3 font-medium whitespace-nowrap">Delegator</th>
                )}
                <th className="text-left py-2 px-3 font-medium whitespace-nowrap">Delegate</th>
                <th className="text-left py-2 px-3 font-medium">Start</th>
                <th className="text-left py-2 px-3 font-medium">End</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium whitespace-nowrap">Approval note</th>
                {!readOnly && <th className="text-right py-2 px-2 font-medium w-24">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {delegations.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  {isAdmin && (
                    <td className="py-2 px-3 whitespace-nowrap">{(d as DelegationAdmin).delegatorName}</td>
                  )}
                  <td className="py-2 px-3 whitespace-nowrap">{d.delegateName}</td>
                  <td className="py-2 px-3">{formatDate(d.start_date)}</td>
                  <td className="py-2 px-3">{formatDate(d.end_date)}</td>
                  <td className="py-2 px-3">{statusBadge(d)}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                    {d.include_delegation_note_in_approval ? 'Yes' : 'No'}
                  </td>
                  {!readOnly && (
                    <td className="py-2 px-2 text-right">
                      <div className="inline-flex items-center gap-0.5 justify-end">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          disabled={saving}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                          title="Edit delegation"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id)}
                          disabled={saving}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Delete delegation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
