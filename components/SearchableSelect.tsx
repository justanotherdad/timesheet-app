'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'

interface Option {
  id: string
  name: string
  code?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  label?: string
  required?: boolean
  /** Shorter control for use inside a table cell. The menu still opens over the page. */
  compact?: boolean
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  required = false,
  compact = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.id === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setIsOpen(false)
      setSearchTerm('')
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.max(rect.width, 240)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const menuHeight = 280
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight && rect.top > spaceBelow
        ? Math.max(8, rect.top - menuHeight - 4)
        : rect.bottom + 4
      setMenuStyle({ top, left, width })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [isOpen])

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.code?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const menu = isOpen && menuStyle ? (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: menuStyle.top, left: menuStyle.left, width: menuStyle.width, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto"
    >
      <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="py-1">
        {filteredOptions.length === 0 ? (
          <div className="px-4 py-2 text-gray-500 text-sm">No options found</div>
        ) : (
          filteredOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id)
                setIsOpen(false)
                setSearchTerm('')
              }}
              className={`w-full min-w-0 text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 ${
                value === option.id ? 'bg-blue-100 dark:bg-blue-800' : ''
              } text-gray-900 dark:text-gray-100 break-words`}
            >
              <span className="font-medium block break-words">{option.name}</span>
              {option.code && (
                <span className="text-sm text-gray-500 dark:text-gray-400 block break-words">{option.code}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  ) : null

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={
            compact
              ? 'w-full min-h-8 px-1.5 py-1 text-left bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-gray-900 dark:text-gray-100 text-xs'
              : 'w-full min-h-[2.5rem] px-4 py-2 text-left bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-gray-900 dark:text-gray-100 text-base'
          }
        >
          <span className={`min-w-0 truncate block text-left ${selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {selectedOption
              ? `${selectedOption.name}${selectedOption.code ? ` (${selectedOption.code})` : ''}`
              : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <X
                className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
              />
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
      </div>
    </div>
  )
}
