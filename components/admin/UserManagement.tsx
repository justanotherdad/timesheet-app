'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { User, UserRole } from '@/types/database'
import { Plus, Edit, Trash2, Key, X, ArrowUpDown, ArrowUp, ArrowDown, Search, Eye, PowerOff } from 'lucide-react'
import { createUser } from '@/app/actions/create-user'
import { deleteUser } from '@/app/actions/delete-user'
import type { BillRatePoSummaryRow } from '@/lib/timesheet-bill-rate-access'
import { updateUserProfile } from '@/app/actions/update-user-assignments'
import { generatePasswordLink } from '@/app/actions/generate-password-link'
import { setUserPassword } from '@/app/actions/set-user-password'

interface UserManagementProps {
  users: User[]
  lookupUsers?: User[]
  /** Timesheet PO eligibility from PO budget Bill Rates by Person (read-only). */
  billRateTimesheetSummaryByUserId: Record<string, BillRatePoSummaryRow[]>
  currentUserRole: UserRole
  currentUserId?: string
}

function formatBillRateSummaryLine(rows: BillRatePoSummaryRow[]): string {
  if (rows.length === 0) return '—'
  return rows.map((r) => `${r.site_name} — ${r.po_number}: ${r.project_description}`).join('; ')
}

export default function UserManagement({
  users: initialUsers,
  lookupUsers,
  billRateTimesheetSummaryByUserId,
  currentUserRole,
  currentUserId,
}: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers)
  const nameLookup = lookupUsers ?? users

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
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [setPasswordUser, setSetPasswordUser] = useState<User | null>(null)
  const [setPasswordLoading, setSetPasswordLoading] = useState(false)
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null)
  // Sort: column key and direction
  type SortKey = 'name' | 'email' | 'role' | 'timesheet_pos' | 'reports_to' | 'final_approver'
  const [sortColumn, setSortColumn] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Filter / search
  const [searchText, setSearchText] = useState('')
  const [filterRole, setFilterRole] = useState<string>('')
  const [filterBillRatePoId, setFilterBillRatePoId] = useState<string>('')
  const [filterSupervisor, setFilterSupervisor] = useState<string>('')
  const [filterFinalApprover, setFilterFinalApprover] = useState<string>('')
  const [filterEmployeeType, setFilterEmployeeType] = useState<string>('')
  const [filterActive, setFilterActive] = useState<string>('active') // 'all' | 'active' | 'archived'
  
  const router = useRouter()

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
      target.supervisor_id === currentUserId ||
      target.manager_id === currentUserId ||
      target.reports_to_id === currentUserId ||
      target.final_approver_id === currentUserId
    )
  }
  const assignmentsOnlyEdit = currentUserRole === 'supervisor'
  const viewOnlyUser = currentUserRole === 'supervisor'
  const canAddUser = ['manager', 'admin', 'super_admin'].includes(currentUserRole)
  const canDeleteUser = ['admin', 'super_admin'].includes(currentUserRole)

  const billRatePoFilterOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const rows of Object.values(billRateTimesheetSummaryByUserId)) {
      for (const r of rows) {
        if (!map.has(r.po_id)) map.set(r.po_id, `${r.po_number} (${r.site_name})`)
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
  }, [billRateTimesheetSummaryByUserId])

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
      if (filterEmployeeType && ((u.employee_type || 'internal') !== filterEmployeeType)) return false
      if (filterActive === 'active' && (u as any).active === false) return false
      if (filterActive === 'archived' && (u as any).active !== false) return false
      if (filterSupervisor && u.supervisor_id !== filterSupervisor) return false
      if (filterFinalApprover && u.final_approver_id !== filterFinalApprover) return false
      if (filterBillRatePoId) {
        const rows = billRateTimesheetSummaryByUserId[u.id] || []
        if (!rows.some((r) => r.po_id === filterBillRatePoId)) return false
      }
      return true
    })
    const dir = sortDirection === 'asc' ? 1 : -1
    list = [...list].sort((a: any, b: any) => {
      const posA = formatBillRateSummaryLine(billRateTimesheetSummaryByUserId[a.id] || [])
      const posB = formatBillRateSummaryLine(billRateTimesheetSummaryByUserId[b.id] || [])
      const reportsToA = nameLookup.find(u => u.id === a.supervisor_id)?.name || ''
      const reportsToB = nameLookup.find(u => u.id === b.supervisor_id)?.name || ''
      const finalApproverA = nameLookup.find(u => u.id === a.final_approver_id)?.name || ''
      const finalApproverB = nameLookup.find(u => u.id === b.final_approver_id)?.name || ''
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortColumn) {
        case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break
        case 'email': va = (a.email || '').toLowerCase(); vb = (b.email || '').toLowerCase(); break
        case 'role': va = (a.role || '').toLowerCase(); vb = (b.role || '').toLowerCase(); break
        case 'timesheet_pos': va = posA.toLowerCase(); vb = posB.toLowerCase(); break
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

  const openUserDetails = (user: any) => {
    setError(null)
    setEditingUser(user)
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
      const formData = new FormData(e.currentTarget)
      const name = formData.get('name') as string
      const email = formData.get('email') as string
      const role = formData.get('role') as UserRole
      const supervisorId = (formData.get('supervisor_id') as string) || null
      const managerId = (formData.get('manager_id') as string) || null
      const finalApproverId = (formData.get('final_approver_id') as string) || null
      const employeeType = (formData.get('employee_type') as 'internal' | 'external') || 'internal'
      // Title is optional and only present when the full edit form (not the
      // assignments-only mode) is shown; coerce missing inputs to undefined
      // so the server action skips the column.
      const titleRaw = formData.get('title')
      const title =
        typeof titleRaw === 'string'
          ? (titleRaw.trim() === '' ? null : titleRaw.trim())
          : undefined

      const profileResult = await updateUserProfile(editingUser.id, {
        name,
        email: email?.trim() || undefined,
        role: canChangeRole(editingUser) ? role : editingUser.role,
        employee_type: employeeType,
        supervisor_id: supervisorId || null,
        manager_id: managerId || null,
        final_approver_id: finalApproverId || null,
        ...(title !== undefined && { title }),
      })
      if (profileResult.error) throw new Error(profileResult.error)

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                name,
                email: email?.trim() || u.email,
                role: canChangeRole(editingUser) ? role : editingUser.role,
                employee_type: employeeType,
                supervisor_id: supervisorId || undefined,
                manager_id: managerId || undefined,
                final_approver_id: finalApproverId || undefined,
                ...(title !== undefined && { title }),
              }
            : u
        )
      )

      setEditingUser(null)
      setSuccess('User updated successfully')
      router.refresh()
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

  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!setPasswordUser) return
    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get('new_password') as string
    const confirmPassword = formData.get('confirm_password') as string
    const requireChange = formData.get('require_change') === 'on'
    setSetPasswordError(null)
    if (!newPassword || newPassword.length < 6) {
      setSetPasswordError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setSetPasswordError('Passwords do not match')
      return
    }
    setSetPasswordLoading(true)
    try {
      const result = await setUserPassword(setPasswordUser.id, newPassword, requireChange)
      if (result.error) throw new Error(result.error)
      setSuccess(requireChange ? 'Password set. User must change it on first login.' : 'Password updated successfully.')
      setShowSetPasswordModal(false)
      setSetPasswordUser(null)
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    } catch (err: any) {
      setSetPasswordError(err.message || 'Failed to set password')
    } finally {
      setSetPasswordLoading(false)
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 w-full flex flex-col min-h-0 flex-1 overflow-hidden">
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
                ⚠️ Important: This link expires in 1 day. Send it to the user and have them click it. If Teams/Slack previews the link, it may consume the token.
              </p>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 max-h-[calc(100vh-14rem)] overflow-y-auto">
        <form onSubmit={handleAddUser} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-4">
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
            {!assignmentsOnlyEdit && (
              <div className="space-y-1">
                <input
                  type="password"
                  name="password"
                  placeholder="Password (min 6 chars)"
                  minLength={6}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">User must change on first login. Leave blank to send invite link instead.</p>
              </div>
            )}
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Employee Type</label>
                <select
                  name="employee_type"
                  defaultValue="internal"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Used for future functions; not shown on timesheets.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supervisor</label>
                <select
                  name="supervisor_id"
                  defaultValue=""
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {nameLookup
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
                  defaultValue=""
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {nameLookup
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
                  defaultValue=""
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">None</option>
                  {nameLookup
                    .filter(u => ['manager', 'admin', 'super_admin'].includes(u.role))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                </select>
              </div>
            </>
          )}
          {assignmentsOnlyEdit && currentUserId && (
            <input type="hidden" name="supervisor_id" value={currentUserId} />
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
            Timesheet PO access is set per user on each PO&apos;s budget (Bill Rates by Person), not on this screen.
          </p>
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
              onClick={() => setShowAddForm(false)}
              className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
        {/* Left: Filter / Search */}
        <div className="md:w-56 shrink-0 space-y-4 md:overflow-y-auto md:max-h-full">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600 md:max-h-[calc(100vh-14rem)] overflow-y-auto">
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
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Employee Type</label>
                <select
                  value={filterEmployeeType}
                  onChange={(e) => setFilterEmployeeType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">All</option>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select
                  value={filterActive}
                  onChange={(e) => setFilterActive(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Timesheet PO (bill rate)</label>
                <select
                  value={filterBillRatePoId}
                  onChange={(e) => setFilterBillRatePoId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">All</option>
                  {billRatePoFilterOptions.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Supervisor</label>
                <select
                  value={filterSupervisor}
                  onChange={(e) => setFilterSupervisor(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">All</option>
                  {nameLookup.filter(u => ['supervisor', 'manager', 'admin', 'super_admin'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Final Approver</label>
                <select
                  value={filterFinalApprover}
                  onChange={(e) => setFilterFinalApprover(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  <option value="">All</option>
                  {nameLookup.filter(u => ['manager', 'admin', 'super_admin'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
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
            const brSummary = formatBillRateSummaryLine(billRateTimesheetSummaryByUserId[user.id] || [])
            return (
              <div
                key={user.id}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 capitalize">{user.role}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Final approver: {nameLookup.find(u => u.id === user.final_approver_id)?.name || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2" title={brSummary}>
                      Timesheet POs: {brSummary}
                    </p>
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

        {/* Desktop: Table — horizontal scroll fixed at bottom of viewport, vertical scroll within */}
        <div className="flex-1 min-w-0 min-h-0 overflow-auto -mx-2 md:mx-0 hidden md:block">
        <table className="min-w-[800px] md:min-w-full w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]">
                <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Name <SortIcon column="name" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button type="button" onClick={() => handleSort('role')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Role <SortIcon column="role" />
                </button>
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase max-w-md">
                <button type="button" onClick={() => handleSort('timesheet_pos')} className="inline-flex items-center hover:text-gray-700 dark:hover:text-gray-200">
                  Timesheet POs (bill rates) <SortIcon column="timesheet_pos" />
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
              const brLine = formatBillRateSummaryLine(billRateTimesheetSummaryByUserId[user.id] || [])
              return (
              <tr key={user.id}>
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium border-r border-gray-200 dark:border-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.3)]">{user.name}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${(user as any).active === false ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
                    {(user as any).active === false ? 'Archived' : 'Active'}
                  </span>
                </td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">{user.role}</td>
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm text-gray-900 dark:text-gray-100 max-w-md align-top" title={brLine}>
                  <span className="line-clamp-3">{brLine}</span>
                </td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {nameLookup.find(u => u.id === user.supervisor_id)?.name || 'N/A'}
                </td>
                <td className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {nameLookup.find(u => u.id === user.final_approver_id)?.name || 'N/A'}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {viewOnlyUser ? 'View User' : `Edit User: ${editingUser.name}`}
              </h3>
              <button type="button" onClick={() => setEditingUser(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            {viewOnlyUser ? (
              <div className="space-y-4">
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Name:</span> <span className="text-gray-900 dark:text-gray-100">{editingUser.name}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Email:</span> <span className="text-gray-900 dark:text-gray-100">{editingUser.email}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Status:</span> <span className={`px-2 py-0.5 rounded text-xs font-medium ${(editingUser as any).active === false ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>{(editingUser as any).active === false ? 'Archived' : 'Active'}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Role:</span> <span className="text-gray-900 dark:text-gray-100 capitalize">{editingUser.role}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Employee Type:</span> <span className="text-gray-900 dark:text-gray-100 capitalize">{(editingUser as any).employee_type || 'internal'}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Supervisor:</span> <span className="text-gray-900 dark:text-gray-100">{nameLookup.find(u => u.id === editingUser.supervisor_id)?.name || 'N/A'}</span></div>
                <div><span className="text-sm font-medium text-gray-500 dark:text-gray-400">Final Approver:</span> <span className="text-gray-900 dark:text-gray-100">{nameLookup.find(u => u.id === editingUser.final_approver_id)?.name || 'N/A'}</span></div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block mb-1">Timesheet POs (from bill rates):</span>
                  <ul className="text-sm text-gray-900 dark:text-gray-100 list-disc list-inside space-y-1">
                    {(billRateTimesheetSummaryByUserId[editingUser.id] || []).map((r) => (
                      <li key={r.po_id}>
                        {r.site_name} — {r.po_number}: {r.project_description}
                      </li>
                    ))}
                  </ul>
                  {(billRateTimesheetSummaryByUserId[editingUser.id] || []).length === 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">No bill rates yet. Add this user on a PO budget.</span>
                  )}
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={editingUser.email}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      defaultValue={(editingUser as { title?: string | null }).title ?? ''}
                      maxLength={120}
                      placeholder="e.g. Senior Project Manager"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Shown on the project budget &quot;By individual&quot; report. Leave blank to omit.
                    </p>
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
              <div className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700/40">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timesheet POs (from bill rates)</p>
                <ul className="text-sm text-gray-900 dark:text-gray-100 list-disc list-inside space-y-1 max-h-48 overflow-y-auto">
                  {(billRateTimesheetSummaryByUserId[editingUser.id] || []).map((r) => (
                    <li key={r.po_id}>
                      {r.site_name} — {r.po_number}: {r.project_description}
                    </li>
                  ))}
                </ul>
                {(billRateTimesheetSummaryByUserId[editingUser.id] || []).length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No bill rates yet. Add this user on a PO budget.</p>
                )}
              </div>
              {!assignmentsOnlyEdit && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee Type</label>
                    <select
                      name="employee_type"
                      defaultValue={(editingUser as any).employee_type || 'internal'}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                    >
                      <option value="internal">Internal</option>
                      <option value="external">External</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Used for future functions; not shown on timesheets.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supervisor</label>
                    <select
                      name="supervisor_id"
                      defaultValue={editingUser.supervisor_id || ''}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                    >
                      <option value="">None</option>
                      {nameLookup
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
                      {nameLookup
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
                      {nameLookup
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
                  onClick={() => setEditingUser(null)}
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
                {!assignmentsOnlyEdit && canEditUser(editingUser) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSetPasswordUser(editingUser)
                    setShowSetPasswordModal(true)
                    setSetPasswordError(null)
                  }}
                  className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Key className="h-4 w-4" />
                  Set Password
                </button>
                )}
                {canEditUser(editingUser) && !assignmentsOnlyEdit && currentUserId && editingUser.id !== currentUserId && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                      if (!editingUser) return
                      const isArchived = (editingUser as any).active === false
                      if (isArchived && !confirm(`Reactivate ${editingUser.name}? They will regain access to the website.`)) return
                      if (!isArchived && !confirm(`Deactivate ${editingUser.name}? They will lose access to the website. Admins can still view and reactivate them.`)) return
                      setLoading(true)
                      setError(null)
                      // isArchived = true means currently inactive → reactivate (set active: true)
                      // isArchived = false means currently active  → deactivate (set active: false)
                      const result = await updateUserProfile(editingUser.id, { active: isArchived })
                      if (result?.error) {
                        setError(result.error)
                      } else {
                        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, active: isArchived } : u))
                        setEditingUser({ ...editingUser, active: isArchived } as any)
                        setSuccess(isArchived ? 'User reactivated' : 'User deactivated')
                        setTimeout(() => setSuccess(null), 3000)
                      }
                      setLoading(false)
                    }}
                    className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg font-semibold disabled:opacity-50 ${(editingUser as any).active === false ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800/50'}`}
                  >
                    <PowerOff className="h-4 w-4" />
                    {(editingUser as any).active === false ? 'Reactivate' : 'Deactivate'}
                  </button>
                )}
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

      {showSetPasswordModal && setPasswordUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={() => { setShowSetPasswordModal(false); setSetPasswordUser(null); setSetPasswordError(null) }}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Set Password for {setPasswordUser.name}
            </h3>
            {setPasswordError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
                {setPasswordError}
              </div>
            )}
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Password</label>
                <input
                  type="password"
                  name="new_password"
                  minLength={6}
                  required
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirm Password</label>
                <input
                  type="password"
                  name="confirm_password"
                  minLength={6}
                  required
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                  autoComplete="new-password"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="require_change" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Require user to change password on first login</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={setPasswordLoading}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {setPasswordLoading ? 'Setting...' : 'Set Password'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSetPasswordModal(false); setSetPasswordUser(null); setSetPasswordError(null) }}
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

