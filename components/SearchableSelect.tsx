'use client'

import { useState, useRef, useEffect } from 'react'
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
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  required = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.id === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.code?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-2 text-left bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between text-gray-900 dark:text-gray-100"
        >
          <span className={selectedOption ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
            {selectedOption
              ? `${selectedOption.name}${selectedOption.code ? ` (${selectedOption.code})` : ''}`
              : placeholder}
          </span>
          <div className="flex items-center gap-2">
            {value && (
              <X
                className="h-4 w-4 text-gray-400 hover:text-gray-600"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
              />
            )}
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
            <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
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
                    className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 ${
                      value === option.id ? 'bg-blue-100 dark:bg-blue-800' : ''
                    } text-gray-900 dark:text-gray-100`}
                  >
                    <div className="font-medium">{option.name}</div>
                    {option.code && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">{option.code}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

