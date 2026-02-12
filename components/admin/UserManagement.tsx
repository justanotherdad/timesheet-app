'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, UserRole } from '@/types/database'
import { Plus, Edit, Trash2, Key, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Eye } from 'lucide-react'
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
  currentUserId?: string
  sites: Site[]
  departments: Department[]
  purchaseOrders: PurchaseOrder[]
}

export default function UserManagement({ users: initialUsers, currentUserRole, currentUserId, sites, departments, purchaseOrders }: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)

  // Sync users state when initialUsers prop changes (e.g., after page reload)
  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])
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

  // Sort: column key and direction
  type SortKey = 'name' | 'email' | 'role' | 'sites' | 'departments' | 'purchase_orders' | 'reports_to' | 'final_approver'
  const [sortColumn, setSortColumn] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Filter / search
  const [searchText, setSearchText] = useState('')
  const [filterRole, setFilterRole] = useState<string>('')
  
  const assignmentsLoadedRef = useRef(false)
  const supabase = createClient()

  // Who can change role: super_admin any; admin can change admin or lower; manager can change manager or lower; supervisor cannot
  const canChangeRole = (target: User) => {
    if (currentUserRole === 'super_admin') return true
    if (currentUserRole === 'admin' && target.role !== 'super_admin') return true
    if (currentUserRole === 'manager' && ['manager', 'supervisor', 'employee'].includes(target.role)) return true
    return false
  }
  // Roles the current user can assign when editing (for dropdown)
  const assignableRoles = (): UserRole[] => {
    if (currentUserRole === 'super_admin') return ['employee', 'supervisor', 'manager', 'admin', 'super_admin']
    if (currentUserRole === 'admin') return ['employee', 'supervisor', 'manager', 'admin']
    if (currentUserRole === 'manager') return ['employee', 'supervisor', 'manager']
    return ['employee']
  }
  const canEditUser = (target: User) => {
    if (['admin', 'super_admin'].includes(currentUserRole)) return true
    return (
      target.reports_to_id === currentUserId ||
      target.supervisor_id === currentUserId ||
      target.manager_id === currentUserId
    )
  }
  const assignmentsOnlyEdit = currentUserRole === 'supervisor'
  const viewOnlyUser = currentUserRole === 'supervisor'
  const canAddUser = ['manager', 'admin', 'super_admin'].includes(currentUserRole)
  const canDeleteUser = ['admin', 'super_admin'].includes(currentUserRole)

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

  // Filter and sort users for table
  const filteredAndSortedUsers = (() => {
    const search = searchText.trim().toLowerCase()
    const roleFilter = filterRole.trim()
    let list = users.filter((u: any) => {
      if (search) {
        const name = (u.name || '').toLowerCase()
        const email = (u.email || '').toLowerCase()
        if (!name.includes(search) && !email.includes(search)) return false
      }
      if (roleFilter && u.role !== roleFilter) return false
      return true
    })
    const dir = sortDirection === 'asc' ? 1 : -1
    list = [...list].sort((a: any, b: any) => {
      const assignmentsA = userAssignments[a.id] || { sites: [], departments: [], purchaseOrders: [] }
      const assignmentsB = userAssignments[b.id] || { sites: [], departments: [], purchaseOrders: [] }
      const sitesA = assignmentsA.sites.map((id: string) => sites.find(s => s.id === id)?.name).filter(Boolean).join(', ')
      const sitesB = assignmentsB.sites.map((id: string) => sites.find(s => s.id === id)?.name).filter(Boolean).join(', ')
      const deptsA = assignmentsA.departments.map((id: string) => departments.find(d => d.id === id)?.name).filter(Boolean).join(', ')
      const deptsB = assignmentsB.departments.map((id: string) => departments.find(d => d.id === id)?.name).filter(Boolean).join(', ')
      const posA = assignmentsA.purchaseOrders.map((id: string) => purchaseOrders.find(p => p.id === id)?.po_number).filter(Boolean).join(', ')
      const posB = assignmentsB.purchaseOrders.map((id: string) => purchaseOrders.find(p => p.id === id)?.po_number).filter(Boolean).join(', ')
      const reportsToA = users.find(u => u.id === a.reports_to_id)?.name || ''
      const reportsToB = users.find(u => u.id === b.reports_to_id)?.name || ''
      const finalApproverA = users.find(u => u.id === a.final_approver_id)?.name || ''
      const finalApproverB = users.find(u => u.id === b.final_approver_id)?.name || ''
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortColumn) {
        case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break
        case 'email': va = (a.email || '').toLowerCase(); vb = (b.email || '').toLowerCase(); break
        case 'role': va = (a.role || '').toLowerCase(); vb = (b.role || '').toLowerCase(); break
        case 'sites': va = sitesA.toLowerCase(); vb = sitesB.toLowerCase(); break
        case 'departments': va = deptsA.toLowerCase(); vb = deptsB.toLowerCase(); break
        case 'purchase_orders': va = posA.toLowerCase(); vb = posB.toLowerCase(); break
        case 'reports_to': va = reportsToA.toLowerCase(); vb = reportsToB.toLowerCase(); break
        case 'final_approver': va = finalApproverA.toLowerCase(); vb = finalApproverB.toLowerCase(); break
        default: return 0
      }
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
    return list
  })()

  const handleSort = (column: SortKey) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 ml-1" /> : <ArrowDown className="h-3.5 w-3.5 ml-1" />
  }

  // Load all user assignments on component mount and when users change
  useEffect(() => {
    const loadAllUserAssignments = async () => {
      if (users.length === 0) return

      const assignmentsMap: Record<string, {
        sites: string[]
        departments: string[]
        purchaseOrders: string[]
      }> = {}

      // Load assignments for all users in parallel
      await Promise.all(
        users.map(async (user) => {
          try {
            const [sitesResult, deptsResult, posResult] = await Promise.all([
              supabase.from('user_sites').select('site_id').eq('user_id', user.id),
              supabase.from('user_departments').select('department_id').eq('user_id', user.id),
              supabase.from('user_purchase_orders').select('purchase_order_id').eq('user_id', user.id),
            ])

            assignmentsMap[user.id] = {
              sites: Array.isArray(sitesResult.data) ? sitesResult.data.map((r: any) => r.site_id) : [],
              departments: Array.isArray(deptsResult.data) ? deptsResult.data.map((r: any) => r.department_id) : [],
              purchaseOrders: Array.isArray(posResult.data) ? posResult.data.map((r: any) => r.purchase_order_id) : [],
            }
          } catch (err) {
            console.error(`Error loading assignments for user ${user.id}:`, err)
            assignmentsMap[user.id] = { sites: [], departments: [], purchaseOrders: [] }
          }
        })
      )

      setUserAssignments(assignmentsMap)
      assignmentsLoadedRef.current = true
    }

    // Load assignments on mount or when users list changes (e.g., after reload)
    const currentAssignmentsCount = Object.keys(userAssignments).length
    if (!assignmentsLoadedRef.current || users.length !== currentAssignmentsCount) {
      loadAllUserAssignments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]) // Reload when users change

  // Load user assignments from junction tables
  const loadUserAssignments = async (userId: string) => {
    try {
      const [sitesResult, deptsResult, posResult] = await Promise.all([
        supabase.from('user_sites').select('site_id').eq('user_id', userId),
        supabase.from('user_departments').select('department_id').eq('user_id', userId),
        supabase.from('user_purchase_orders').select('purchase_order_id').eq('user_id', userId),
      ])

      return {
        sites: Array.isArray(sitesResult.data) ? sitesResult.data.map((r: any) => r.site_id) : [],
        departments: Array.isArray(deptsResult.data) ? deptsResult.data.map((r: any) => r.department_id) : [],
        purchaseOrders: Array.isArray(posResult.data) ? posResult.data.map((r: any) => r.purchase_order_id) : [],
      }
    } catch (err) {
      console.error('Error loading user assignments:', err)
      return { sites: [], departments: [], purchaseOrders: [] }
    }
  }

  const openUserDetails = async (user: any) => {
    setEditingUser(user)
    const assignments = await loadUserAssignments(user.id)
    setSelectedSites(assignments.sites)
    setSelectedDepartments(assignments.departments)
    setSelectedPOs(assignments.purchaseOrders)
    setUserAssignments(prev => ({ ...prev, [user.id]: assignments }))
  }

  // Load all user assignments on component mount
  useEffect(() => {
    const loadAllAssignments = async () => {
      const assignmentsMap: Record<string, {
        sites: string[]
        departments: string[]
        purchaseOrders: string[]
      }> = {}

      // Load assignments for all users in parallel
      const assignmentPromises = users.map(async (user) => {
        const assignments = await loadUserAssignments(user.id)
        assignmentsMap[user.id] = assignments
      })

      await Promise.all(assignmentPromises)
      setUserAssignments(assignmentsMap)
    }

    if (users.length > 0) {
      loadAllAssignments()
    }
  }, [users.length]) // Only run when users array length changes

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

    try {
      if (assignmentsOnlyEdit) {
        const assignResult = await updateUserAssignments(
          editingUser.id,
          selectedSites,
          selectedDepartments,
          selectedPOs
        )
        if (assignResult.error) throw new Error(assignResult.error)
      } else {
        const formData = new FormData(e.currentTarget)
        const name = formData.get('name') as string
        const role = formData.get('role') as UserRole
        const reportsToId = formData.get('reports_to_id') as string || null
        const supervisorId = formData.get('supervisor_id') as string || null
        const managerId = formData.get('manager_id') as string || null
        const finalApproverId = formData.get('final_approver_id') as string || null

        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            name,
            role: canChangeRole(editingUser) ? role : editingUser.role,
            reports_to_id: reportsToId || null,
            supervisor_id: supervisorId || null,
            manager_id: managerId || null,
            final_approver_id: finalApproverId || null,
          })
          .eq('id', editingUser.id)

        if (updateError) throw updateError

        const assignResult = await updateUserAssignments(
          editingUser.id,
          selectedSites,
          selectedDepartments,
          selectedPOs
        )
        if (assignResult.error) throw new Error(assignResult.error)

        // Update local state so table (e.g. Supervisor column) reflects changes without reload
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  name,
                  role: canChangeRole(editingUser) ? role : editingUser.role,
                  reports_to_id: reportsToId || undefined,
                  supervisor_id: supervisorId || undefined,
                  manager_id: managerId || undefined,
                  final_approver_id: finalApproverId || undefined,
                }
              : u
          )
        )
      }

      setEditingUser(null)
      setSelectedSiteId('')
      setSelectedSites([])
      setSelectedDepartments([])
      setSelectedPOs([])
      setSuccess('User updated successfully')
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

      setEditingUser(null)
      setSuccess(`User ${userName} has been deleted successfully.`)
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'An error occurred while deleting the user')
    } finally {
      setLoading(false)
    }
  }

  const handleGeneratePasswordLink = async (email: string, targetUserId?: string) => {
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      const result = await generatePasswordLink(email, targetUserId)
      if (result.error) {
        throw new Error(result.error)
      }
      if (result.link) {
        setInvitationLink(result.link)
        setSuccess('Password / invite link generated. Copy and send it to the user.')
        setEditingUser(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Users</h2>
        {canAddUser && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
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
            {assignmentsOnlyEdit ? (
              <input type="hidden" name="role" value="employee" />
            ) : (
              <select
                name="role"
                required
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
              >
                {assignableRoles().map((r) => (
                  <option key={r} value={r}>{r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            )}
            {assignmentsOnlyEdit && (
              <p className="text-sm text-gray-600 dark:text-gray-400 col-span-full">New user will be added as Employee reporting to you.</p>
            )}
          </div>
          {!assignmentsOnlyEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supervisor</label>
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
            </>
          )}
          {assignmentsOnlyEdit && currentUserId && (
            <input type="hidden" name="reports_to_id" value={currentUserId} />
          )}
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

      <div className="flex flex-col md:flex-row gap-4">
        {/* Left: Filter / Search */}
        <div className="md:w-56 shrink-0 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Filter & Search
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Name or email..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">All roles</option>
                  <option value="employee">Employee</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {filteredAndSortedUsers.length} of {users.length} users
              </p>
            </div>
          </div>
        </div>

        {/* Mobile: card list */}
        <div className="flex-1 min-w-0 md:hidden space-y-2">
          {filteredAndSortedUsers.map((user: any) => {
            const assignments = userAssignments[user.id] || { sites: [], departments: [], purchaseOrders: [] }
            const userSites = assignments.sites.map((siteId: string) => sites.find(s => s.id === siteId)?.name).filter(Boolean)
            return (
              <div
                key={user.id}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 capitalize">{user.role}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Final approver: {users.find(u => u.id === user.final_approver_id)?.name || 'N/A'}
                    </p>
                    {userSites.length > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={userSites.join(', ')}>
                        Sites: {userSites.join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openUserDetails(user)}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop: Table (scrollable on small if table shown) */}
        <div className="flex-1 min-w-0 overflow-x-auto -mx-2 md:mx-0 hidden md:block">
        <table className="min-w-[800px] md:min-w-full w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Name <SortIcon column="name" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('email')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Email <SortIcon column="email" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('role')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Role <SortIcon column="role" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('sites')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Sites <SortIcon column="sites" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('departments')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Departments <SortIcon column="departments" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('purchase_orders')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Purchase Orders <SortIcon column="purchase_orders" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('reports_to')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Supervisor <SortIcon column="reports_to" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                <button type="button" onClick={() => handleSort('final_approver')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Final Approver <SortIcon column="final_approver" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-20">
                View
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredAndSortedUsers.map((user: any) => {
              // Get assignments from state (will be loaded on edit click or via useEffect)
              const assignments = userAssignments[user.id] || { sites: [], departments: [], purchaseOrders: [] }
              
              const userSites = assignments.sites.map((siteId: string) => sites.find(s => s.id === siteId)?.name).filter(Boolean)
              const userDepts = assignments.departments.map((deptId: string) => departments.find(d => d.id === deptId)?.name).filter(Boolean)
              const userPOs = assignments.purchaseOrders.map((poId: string) => purchaseOrders.find(p => p.id === poId)?.po_number).filter(Boolean)
              
              const editable = canEditUser(user)
              return (
              <tr key={user.id}>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">{user.name}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{user.email}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">{user.role}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm text-gray-900 dark:text-gray-100">{userSites.length > 0 ? userSites.join(', ') : 'N/A'}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm text-gray-900 dark:text-gray-100">{userDepts.length > 0 ? userDepts.join(', ') : 'N/A'}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm text-gray-900 dark:text-gray-100">{userPOs.length > 0 ? userPOs.join(', ') : 'N/A'}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {users.find(u => u.id === user.reports_to_id)?.name || 'N/A'}
                </td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {users.find(u => u.id === user.final_approver_id)?.name || 'N/A'}
                </td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => openUserDetails(user)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </button>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {viewOnlyUser ? 'View User' : assignmentsOnlyEdit ? `Edit assignments: ${editingUser.name}` : 'Edit User'}
            </h3>
            {viewOnlyUser ? (
              <div className="space-y-4">
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Name:</span> <span className="text-gray-900 dark:text-gray-100">{editingUser.name}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Email:</span> <span className="text-gray-900 dark:text-gray-100">{editingUser.email}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Role:</span> <span className="text-gray-900 dark:text-gray-100 capitalize">{editingUser.role}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Supervisor:</span> <span className="text-gray-900 dark:text-gray-100">{users.find(u => u.id === editingUser.reports_to_id)?.name || 'N/A'}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Final Approver:</span> <span className="text-gray-900 dark:text-gray-100">{users.find(u => u.id === editingUser.final_approver_id)?.name || 'N/A'}</span></div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block mb-1">Sites:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {(userAssignments[editingUser.id]?.sites || []).map((siteId: string) => sites.find(s => s.id === siteId)?.name).filter(Boolean).join(', ') || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block mb-1">Departments:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {(userAssignments[editingUser.id]?.departments || []).map((deptId: string) => departments.find(d => d.id === deptId)?.name).filter(Boolean).join(', ') || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block mb-1">Purchase Orders:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {(userAssignments[editingUser.id]?.purchaseOrders || []).map((poId: string) => purchaseOrders.find(p => p.id === poId)?.po_number).filter(Boolean).join(', ') || 'N/A'}
                  </span>
                </div>
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleUpdateUser} className="space-y-4">
              {!assignmentsOnlyEdit && (
                <>
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
                  disabled={!canChangeRole(editingUser)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-200 text-gray-900 bg-white dark:bg-white"
                >
                  {(canChangeRole(editingUser) ? assignableRoles() : [editingUser.role]).map((r) => (
                    <option key={r} value={r}>{r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
                  </div>
                </>
              )}
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
              {!assignmentsOnlyEdit && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supervisor</label>
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
                </>
              )}
              <div className="flex flex-wrap gap-2 items-center">
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
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => editingUser && handleGeneratePasswordLink(editingUser.email, editingUser.id)}
                  className="inline-flex items-center gap-1 bg-amber-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  <Key className="h-4 w-4" />
                  Generate Password Link
                </button>
                {canDeleteUser && currentUserId && editingUser.id !== currentUserId && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => editingUser && handleDeleteUser(editingUser.id, editingUser.name)}
                    className="inline-flex items-center gap-1 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete User
                  </button>
                )}
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

