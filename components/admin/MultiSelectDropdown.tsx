'use client'

import { useEffect, useRef, useState } from 'react'
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
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id))
    else onChange([...selected, id])
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label || `${selected.length} selected`
        : `${selected.length} selected`

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-left flex items-center justify-between gap-2"
      >
        <span className="truncate text-sm">{summary}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
          >
            {allLabel}
          </button>
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No options</p>
          ) : (
            options.map((o) => {
              const checked = selected.includes(o.id)
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
                    checked ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    className="h-4 w-4 rounded border-gray-400 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-gray-900 dark:text-gray-100 truncate">{o.label}</span>
                </label>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
