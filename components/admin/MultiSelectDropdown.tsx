'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export type MultiSelectOption = { id: string; label: string }

interface MultiSelectDropdownProps {
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  allLabel?: string
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = 'All',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const checked = new Set(selected)
  const isAll = selected.length === 0
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  const shownChecked = shown.filter((o) => checked.has(o.id)).length
  const allShownChecked = shown.length > 0 && shownChecked === shown.length
  const someShownChecked = shownChecked > 0 && !allShownChecked

  const summary = isAll
    ? allLabel
    : selected.length === 1
      ? options.find((o) => o.id === selected[0])?.label || '1 selected'
      : `${selected.length} selected`

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.max(r.width, 220)
    const below = r.bottom + 4
    const spaceBelow = window.innerHeight - below
    const maxH = 280
    const top =
      spaceBelow < 180 && r.top > spaceBelow ? Math.max(8, r.top - maxH - 4) : below
    let left = r.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8)
    }
    setPos({ top, left, width })
  }

  useEffect(() => {
    if (!open) return
    place()
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => place()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someShownChecked
    }
  }, [someShownChecked, open, shownChecked])

  const toggle = (id: string) => {
    if (checked.has(id)) onChange(selected.filter((x) => x !== id))
    else onChange([...selected, id])
  }

  const chooseAll = () => {
    const shownIds = shown.map((o) => o.id)
    if (allShownChecked) {
      const remove = new Set(shownIds)
      onChange(selected.filter((id) => !remove.has(id)))
      return
    }
    const next = new Set(selected)
    for (const id of shownIds) next.add(id)
    onChange(options.map((o) => o.id).filter((id) => next.has(id)))
  }

  const clearAll = () => onChange([])

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <button
        ref={btnRef}
        type="button"
        onClick={() =>
          setOpen((v) => {
            const next = !v
            if (next) setQuery('')
            return next
          })
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-left flex items-center justify-between gap-2 ${
          !isAll
            ? 'border-orange-400 dark:border-orange-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        <span className="truncate text-sm">{summary}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: 280 }}
            className="z-[80] flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg"
          >
            <div className="border-b border-gray-100 dark:border-gray-700 p-1.5">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allShownChecked}
                  onChange={chooseAll}
                  className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-gray-700 dark:text-gray-200 font-medium">Select All</span>
              </label>
              {shown.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500">No matches</p>
              ) : (
                shown.map((o) => {
                  const isChecked = checked.has(o.id)
                  return (
                    <label
                      key={o.id}
                      title={o.label}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                        isChecked ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(o.id)}
                        className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-gray-900 dark:text-gray-100 truncate">{o.label}</span>
                    </label>
                  )
                })
              )}
              {!isAll && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
