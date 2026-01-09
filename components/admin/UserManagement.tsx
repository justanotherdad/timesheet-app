'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, UserRole } from '@/types/database'
import { Plus, Edit, Trash2, Key } from 'lucide-react'
import { createUser } from '@/app/actions/create-user'
import { deleteUser } from '@/app/actions/delete-user'
import { updateUserAssignments } from '@/app/actions/update-user-assignments'
import { generatePasswordLink } from '@/app/actions/generate-password-link'

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

interface UserManagementProps {
  users: User[]
  currentUserRole: UserRole
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
}

export default function UserManagement({ users: initialUsers, currentUserRole, sites, departments, purchaseOrders }: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [invitationLink, setInvitationLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<string>('')
  
  // Multiple assignment states
  const [selectedSites, setSelectedSites] = useState<string[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [selectedPOs, setSelectedPOs] = useState<string[]>([])
  
  // User assignments (loaded from junction tables)
  const [userAssignments, setUserAssignments] = useState<Record<string, {
    sites: string[]
    departments: string[]
    purchaseOrders: string[]
  }>>({})
  
  const supabase = createClient()

  const canChangeRole = currentUserRole === 'super_admin'

  // Filter departments by selected sites
  const filteredDepartments = selectedSites.length > 0
    ? departments.filter(d => selectedSites.includes(d.site_id))
    : departments

  // Filter POs by selected sites and departments
  const filteredPOs = purchaseOrders.filter(po => {
    if (selectedSites.length > 0 && !selectedSites.includes(po.site_id)) return false
    if (selectedDepartments.length > 0 && po.department_id && !selectedDepartments.includes(po.department_id)) return false
    return true
  })

  // Load user assignments from junction tables
  const loadUserAssignments = async (userId: string) => {
    try {
      const [sitesResult, deptsResult, posResult] = await Promise.all([
        supabase.from('user_sites').select('site_id').eq('user_id', userId),
        supabase.from('user_departments').select('department_id').eq('user_id', userId),
        supabase.from('user_purchase_orders').select('purchase_order_id').eq('user_id', userId),
      ])

      return {
        sites: (sitesResult.data || []).map((r: any) => r.site_id),
        departments: (deptsResult.data || []).map((r: any) => r.department_id),
        purchaseOrders: (posResult.data || []).map((r: any) => r.purchase_order_id),
      }
    } catch (err) {
      console.error('Error loading user assignments:', err)
      return { sites: [], departments: [], purchaseOrders: [] }
    }
  }

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const name = formData.get('name') as string
    const role = formData.get('role') as UserRole

    try {
      // Use server action to create user (handles auth user + profile creation)
      const result = await createUser(formData)

      if (result.error) {
        throw new Error(result.error)
      }

      // If user was created, save multiple assignments
      if (result.userId && (selectedSites.length > 0 || selectedDepartments.length > 0 || selectedPOs.length > 0)) {
        const assignResult = await updateUserAssignments(
          result.userId,
          selectedSites,
          selectedDepartments,
          selectedPOs
        )
        if (assignResult.error) {
          console.error('Failed to save assignments:', assignResult.error)
        }
      }

      // Show success message and invitation link if available
      if (result.message) {
        setSuccess(result.message)
        const hasInvitationLink = !!(result as any).invitationLink
        if (hasInvitationLink) {
          setInvitationLink((result as any).invitationLink)
        }
        // Clear form
        if (e.currentTarget) {
          e.currentTarget.reset()
        }
        setSelectedSiteId('')
        setSelectedSites([])
        setSelectedDepartments([])
        setSelectedPOs([])
        setShowAddForm(false)
        
        // If there's an invitation link, don't reload - keep the link visible
        // User can manually refresh the page after copying/dismissing the link
        if (!hasInvitationLink) {
          // Only reload if there's no invitation link to show
          setTimeout(() => {
            window.location.reload()
          }, 2000)
        }
      } else {
        // Refresh immediately if no message
        setShowAddForm(false)
        window.location.reload()
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingUser) return

    setError(null)
    setSuccess(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const role = formData.get('role') as UserRole
    const reportsToId = formData.get('reports_to_id') as string || null
    const supervisorId = formData.get('supervisor_id') as string || null
    const managerId = formData.get('manager_id') as string || null
    const finalApproverId = formData.get('final_approver_id') as string || null

    try {
      // Update user profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          name,
          role: canChangeRole ? role : editingUser.role,
          reports_to_id: reportsToId || null,
          supervisor_id: supervisorId || null,
          manager_id: managerId || null,
          final_approver_id: finalApproverId || null,
        })
        .eq('id', editingUser.id)

      if (updateError) throw updateError

      // Update multiple assignments
      const assignResult = await updateUserAssignments(
        editingUser.id,
        selectedSites,
        selectedDepartments,
        selectedPOs
      )

      if (assignResult.error) {
        throw new Error(assignResult.error)
      }

      setEditingUser(null)
      setSelectedSiteId('')
      setSelectedSites([])
      setSelectedDepartments([])
      setSelectedPOs([])
      setSuccess('User updated successfully')
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      return
    }

    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const result = await deleteUser(userId)

      if (result.error) {
        throw new Error(result.error)
      }

      setSuccess(`User ${userName} has been deleted successfully.`)
      // Refresh the page after 1 second to show updated list
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'An error occurred while deleting the user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Users</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded mb-4">
          <p className="mb-2">{success}</p>
          {invitationLink && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-green-300 dark:border-green-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Invitation Link (Copy and send this to the user):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={invitationLink}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 bg-white dark:bg-gray-700 font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (invitationLink) {
                      try {
                        await navigator.clipboard.writeText(invitationLink)
                        const originalMessage = success
                        setSuccess('Link copied to clipboard! You can copy it again if needed.')
                        setTimeout(() => {
                          setSuccess(originalMessage)
                        }, 3000)
                      } catch (err) {
                        // Fallback: select the text
                        const input = document.querySelector('input[readonly]') as HTMLInputElement
                        if (input) {
                          input.select()
                          document.execCommand('copy')
                          setSuccess('Link selected - press Ctrl+C (or Cmd+C) to copy')
                        }
                      }
                    }
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700"
                >
                  Copy Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInvitationLink(null)
                    setSuccess(null)
                    // Reload to show the updated user list after dismissing the link
                    window.location.reload()
                  }}
                  className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Dismiss & Refresh
                </button>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                The user can click this link to set their password and log in.
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 font-semibold">
                ⚠️ Important: This link expires in about 1 hour. Send it to the user immediately and have them click it right away. If Teams/Slack previews the link, it may consume the token.
              </p>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAddUser} className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Add New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              name="name"
              placeholder="Name"
              required
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <select
              name="role"
              required
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
            >
              <option value="employee">Employee</option>
              <option value="supervisor">Supervisor</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              {canChangeRole && <option value="super_admin">Super Admin</option>}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reports To</label>
            <select
              name="reports_to_id"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
            >
              <option value="">None</option>
              {users
                .filter(u => ['manager', 'supervisor', 'admin', 'super_admin'].includes(u.role))
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supervisor</label>
            <select
              name="supervisor_id"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
            >
              <option value="">None</option>
              {users
                .filter(u => ['supervisor', 'manager', 'admin', 'super_admin'].includes(u.role))
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Manager</label>
            <select
              name="manager_id"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
            >
              <option value="">None</option>
              {users
                .filter(u => ['manager', 'admin', 'super_admin'].includes(u.role))
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Final Approver</label>
            <select
              name="final_approver_id"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
            >
              <option value="">None</option>
              {users
                .filter(u => ['manager', 'admin', 'super_admin'].includes(u.role))
                .map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
            </select>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sites (Select Multiple)</label>
              <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                {sites.map(site => (
                  <label key={site.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSites.includes(site.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSites([...selectedSites, site.id])
                        } else {
                          setSelectedSites(selectedSites.filter(id => id !== site.id))
                          // Remove departments from unselected sites
                          setSelectedDepartments(selectedDepartments.filter(deptId => {
                            const dept = departments.find(d => d.id === deptId)
                            return dept && selectedSites.includes(dept.site_id)
                          }))
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900 dark:text-gray-100">{site.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Departments (Select Multiple)</label>
              <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                {filteredDepartments.length > 0 ? (
                  filteredDepartments.map(dept => (
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
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {dept.name} ({sites.find(s => s.id === dept.site_id)?.name})
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Select sites first to see departments</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Purchase Orders (Select Multiple)</label>
              <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                {filteredPOs.length > 0 ? (
                  filteredPOs.map(po => (
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Select sites/departments first to see purchase orders</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add User'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false)
                setSelectedSiteId('')
                setSelectedSites([])
                setSelectedDepartments([])
                setSelectedPOs([])
              }}
              className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sites</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Departments</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Purchase Orders</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reports To</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user: any) => {
              // Get assignments from state (will be loaded on edit click or via useEffect)
              const assignments = userAssignments[user.id] || { sites: [], departments: [], purchaseOrders: [] }
              
              const userSites = assignments.sites.map((siteId: string) => sites.find(s => s.id === siteId)?.name).filter(Boolean)
              const userDepts = assignments.departments.map((deptId: string) => departments.find(d => d.id === deptId)?.name).filter(Boolean)
              const userPOs = assignments.purchaseOrders.map((poId: string) => purchaseOrders.find(p => p.id === poId)?.po_number).filter(Boolean)
              
              return (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">{user.role}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{userSites.length > 0 ? userSites.join(', ') : 'N/A'}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{userDepts.length > 0 ? userDepts.join(', ') : 'N/A'}</td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{userPOs.length > 0 ? userPOs.join(', ') : 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {users.find(u => u.id === user.reports_to_id)?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={async () => {
                      setEditingUser(user)
                      const assignments = await loadUserAssignments(user.id)
                      setSelectedSites(assignments.sites)
                      setSelectedDepartments(assignments.departments)
                      setSelectedPOs(assignments.purchaseOrders)
                      setUserAssignments(prev => ({ ...prev, [user.id]: assignments }))
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                    title="Edit User"
                  >
                    <Edit className="h-4 w-4 inline" />
                  </button>
                  <button
                    onClick={async () => {
                      setLoading(true)
                      setError(null)
                      try {
                        const result = await generatePasswordLink(user.email)
                        if (result.error) {
                          throw new Error(result.error)
                        }
                        if (result.link) {
                          setInvitationLink(result.link)
                          setSuccess(`Password reset link generated for ${user.name}. Copy the link below.`)
                        }
                      } catch (err: any) {
                        setError(err.message || 'Failed to generate password link')
                      } finally {
                        setLoading(false)
                      }
                    }}
                    disabled={loading}
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generate Password Reset Link"
                  >
                    <Key className="h-4 w-4 inline" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.name)}
                    disabled={loading}
                    className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete User"
                  >
                    <Trash2 className="h-4 w-4 inline" />
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit User</h3>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingUser.name}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select
                  name="role"
                  defaultValue={editingUser.role}
                  disabled={!canChangeRole}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-200 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  {canChangeRole && <option value="super_admin">Super Admin</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sites (Select Multiple)</label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {sites.map(site => (
                    <label key={site.id} className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSites.includes(site.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSites([...selectedSites, site.id])
                          } else {
                            setSelectedSites(selectedSites.filter(id => id !== site.id))
                            setSelectedDepartments(selectedDepartments.filter(deptId => {
                              const dept = departments.find(d => d.id === deptId)
                              return dept && selectedSites.includes(dept.site_id)
                            }))
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900 dark:text-gray-100">{site.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Departments (Select Multiple)</label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {filteredDepartments.length > 0 ? (
                    filteredDepartments.map(dept => (
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
                        <span className="text-sm text-gray-900 dark:text-gray-100">
                          {dept.name} ({sites.find(s => s.id === dept.site_id)?.name})
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Select sites first to see departments</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Purchase Orders (Select Multiple)</label>
                <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                  {filteredPOs.length > 0 ? (
                    filteredPOs.map(po => (
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Select sites/departments first to see purchase orders</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reports To</label>
                <select
                  name="reports_to_id"
                  defaultValue={editingUser.reports_to_id || ''}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {users
                    .filter(u => u.id !== editingUser.id && ['manager', 'supervisor', 'admin', 'super_admin'].includes(u.role))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supervisor</label>
                <select
                  name="supervisor_id"
                  defaultValue={editingUser.supervisor_id || ''}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {users
                    .filter(u => u.id !== editingUser.id && ['supervisor', 'manager', 'admin', 'super_admin'].includes(u.role))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manager</label>
                <select
                  name="manager_id"
                  defaultValue={editingUser.manager_id || ''}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {users
                    .filter(u => u.id !== editingUser.id && ['manager', 'admin', 'super_admin'].includes(u.role))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Final Approver</label>
                <select
                  name="final_approver_id"
                  defaultValue={editingUser.final_approver_id || ''}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {users
                    .filter(u => u.id !== editingUser.id && ['manager', 'admin', 'super_admin'].includes(u.role))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
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
                  onClick={() => {
                    setEditingUser(null)
                    setSelectedSiteId('')
                    setSelectedSites([])
                    setSelectedDepartments([])
                    setSelectedPOs([])
                  }}
                  className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
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

