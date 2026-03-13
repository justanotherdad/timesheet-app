'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Copy, Upload, FileSpreadsheet, X, Pencil, Trash2 } from 'lucide-react'

interface BidSheet {
  id: string
  name: string
  description?: string
  status: string
  site_id: string
  sites?: { id: string; name: string }
  created_at: string
}

interface BidSheetsClientProps {
  initialSheets: BidSheet[]
  sites: Array<{ id: string; name: string }>
  user: { id: string; profile: { role: string } }
  readOnly?: boolean
}

export default function BidSheetsClient({
  initialSheets,
  sites,
  user,
  readOnly = false,
}: BidSheetsClientProps) {
  const [sheets, setSheets] = useState(initialSheets)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createMode, setCreateMode] = useState<'new' | 'clone' | 'import'>('new')
  const [createName, setCreateName] = useState('')
  const [createSiteId, setCreateSiteId] = useState(sites[0]?.id || '')
  const [createDescription, setCreateDescription] = useState('')
  const [cloneFromId, setCloneFromId] = useState('')
  const [importCsv, setImportCsv] = useState('')
  const [importSiteId, setImportSiteId] = useState(sites[0]?.id || '')
  const [importName, setImportName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCreate = !readOnly && ['manager', 'admin', 'super_admin'].includes(user.profile.role)

  const handleCreate = async () => {
    setError(null)
    setLoading(true)
    try {
      const body: any = {
        site_id: createMode === 'import' ? importSiteId : createSiteId,
        name: createMode === 'import' ? importName : createName,
        description: createDescription || null,
      }
      if (createMode === 'clone' && cloneFromId) body.clone_from_id = cloneFromId

      const res = await fetch('/api/bid-sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create')

      const newId = data.id
      if (createMode === 'import' && importCsv.trim()) {
        const impRes = await fetch(`/api/bid-sheets/${newId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: importCsv }),
        })
        const impData = await impRes.json()
        if (!impRes.ok) throw new Error(impData.error || 'Import failed')
      }

      setSheets((prev) => [{ ...data, sites: sites.find((s) => s.id === data.site_id) ? { id: data.site_id, name: sites.find((s) => s.id === data.site_id)!.name } : undefined }, ...prev])
      setShowCreateModal(false)
      setCreateName('')
      setCreateDescription('')
      setCloneFromId('')
      setImportCsv('')
      setImportName('')
      window.location.href = `/dashboard/bid-sheets/${newId}`
    } catch (e: any) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string, status?: string) => {
    const msg = status === 'converted'
      ? `Delete bid sheet "${name}"? The bid sheet data will be removed, but the project and its budget will remain. This cannot be undone.`
      : `Delete bid sheet "${name}"? This cannot be undone.`
    if (!confirm(msg)) return
    setError(null)
    try {
      const res = await fetch(`/api/bid-sheets/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      setSheets((prev) => prev.filter((s) => s.id !== id))
    } catch (e: any) {
      setError(e.message || 'Failed to delete')
    }
  }

  const openCreate = (mode: 'new' | 'clone' | 'import') => {
    setCreateMode(mode)
    setCreateName('')
    setCreateSiteId(sites[0]?.id || '')
    setCreateDescription('')
    setCloneFromId('')
    setImportCsv('')
    setImportSiteId(sites[0]?.id || '')
    setImportName('')
    setError(null)
    setShowCreateModal(true)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Bid Sheets</h2>
        {canCreate && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openCreate('new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              <Plus className="h-4 w-4" /> Create Bid Sheet
            </button>
            <div className="relative group">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium"
              >
                <Plus className="h-4 w-4" /> More
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  type="button"
                  onClick={() => { openCreate('clone'); (document.activeElement as HTMLElement)?.blur() }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" /> Clone from existing
                </button>
                <button
                  type="button"
                  onClick={() => { openCreate('import'); (document.activeElement as HTMLElement)?.blur() }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" /> Import CSV
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && !showCreateModal && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-4">No bid sheets yet.</p>
          {canCreate && (
            <button
              type="button"
              onClick={() => openCreate('new')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              Create your first bid sheet
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Site</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Created</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sheets.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/bid-sheets/${s.id}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.sites?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      s.status === 'converted' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/bid-sheets/${s.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Open →
                      </Link>
                      <Link
                        href={`/dashboard/bid-sheets/${s.id}`}
                        className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id, s.name, s.status)}
                          className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold">
                {createMode === 'clone' ? 'Clone Bid Sheet' : createMode === 'import' ? 'Import CSV' : 'Create Bid Sheet'}
              </h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>}

              {createMode === 'clone' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Clone from</label>
                    <select
                      value={cloneFromId}
                      onChange={(e) => setCloneFromId(e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      <option value="">-- Select bid sheet --</option>
                      {sheets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.sites?.name}){s.status === 'converted' ? ' — converted' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">New Name *</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Cloned Bid Sheet Name"
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Site *</label>
                    <select
                      value={createSiteId}
                      onChange={(e) => setCreateSiteId(e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {createMode === 'import' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">CSV (System, System Number, Deliverable, Activity, Budgeted Hours)</label>
                    <textarea
                      value={importCsv}
                      onChange={(e) => setImportCsv(e.target.value)}
                      rows={6}
                      placeholder="System_Name,System_Number,Deliverable_Name,Activity_Name,Budgeted_Hours&#10;System A,S001,Deliverable 1,Activity 1,40"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Bid Sheet Name</label>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="New Bid Sheet"
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Site</label>
                    <select
                      value={importSiteId}
                      onChange={(e) => setImportSiteId(e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {createMode === 'new' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Name *</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Bid Sheet Name"
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Site *</label>
                    <select
                      value={createSiteId}
                      onChange={(e) => setCreateSiteId(e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <input
                      type="text"
                      value={createDescription}
                      onChange={(e) => setCreateDescription(e.target.value)}
                      placeholder="Optional"
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading || (createMode !== 'import' && !createName.trim()) || (createMode === 'import' && !importName.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {loading ? 'Creating...' : createMode === 'clone' ? 'Clone' : createMode === 'import' ? 'Create & Import' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
