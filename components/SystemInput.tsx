'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface Option {
  id: string
  name: string
  code?: string
}

interface SystemInputProps {
  options: Option[]
  value: string | null
  customValue?: string // Current custom value if any
  onChange: (value: string | null, customValue?: string) => void
  placeholder?: string
  label?: string
}

export default function SystemInput({
  options,
  value,
  customValue: propCustomValue,
  onChange,
  placeholder = 'Select or type...',
  label,
}: SystemInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isCustom, setIsCustom] = useState(!!propCustomValue)
  const [customValue, setCustomValue] = useState(propCustomValue || '')
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

  // Sync with prop customValue
  useEffect(() => {
    if (propCustomValue && propCustomValue.trim()) {
      setIsCustom(true)
      setCustomValue(propCustomValue)
    } else if (value) {
      setIsCustom(false)
      setCustomValue('')
    } else {
      setIsCustom(false)
      setCustomValue('')
    }
  }, [propCustomValue, value])

  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    option.code?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setCustomValue(newValue)
    // Pass null as the ID and the custom value as the second parameter
    onChange(null, newValue)
  }

  const handleSelectOption = (optionId: string) => {
    onChange(optionId)
    setIsCustom(false)
    setCustomValue('')
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = () => {
    onChange(null)
    setIsCustom(false)
    setCustomValue('')
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {isCustom ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customValue}
                onChange={handleCustomInputChange}
                placeholder="Type custom system name..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                type="button"
                onClick={handleClear}
                className="text-gray-400 hover:text-gray-600"
                title="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCustom(false)
                setCustomValue('')
                onChange(null)
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
              title="Switch to dropdown list"
            >
              ← Switch to dropdown list
            </button>
          </div>
        ) : (
          <>
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
                      handleClear()
                    }}
                  />
                )}
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {!isOpen && (
              <button
                type="button"
                onClick={() => {
                  setIsCustom(true)
                  setCustomValue('')
                  onChange(null, '')
                }}
                className="mt-1 w-full text-sm text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded text-center"
                title="Type custom value instead"
              >
                Or type custom value
              </button>
            )}

            {isOpen && (
              <div className="absolute z-[9999] w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto min-w-max">
                <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search or type new..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white dark:bg-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchTerm.trim()) {
                        const matchingOption = filteredOptions.find(o => o.name.toLowerCase() === searchTerm.toLowerCase())
                        if (matchingOption) {
                          // Select the matching option
                          handleSelectOption(matchingOption.id)
                        } else {
                          // Use as custom value
                          e.preventDefault()
                          setIsCustom(true)
                          setCustomValue(searchTerm)
                          onChange(null, searchTerm)
                          setIsOpen(false)
                          setSearchTerm('')
                        }
                      }
                    }}
                  />
                </div>
                <div className="py-1">
                  {filteredOptions.length === 0 && !searchTerm ? (
                    <div className="px-4 py-2 text-gray-500 text-sm">No options found</div>
                  ) : (
                    <>
                      {filteredOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleSelectOption(option.id)}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 ${
                            value === option.id ? 'bg-blue-100 dark:bg-blue-800' : ''
                          } text-gray-900 dark:text-gray-100`}
                        >
                          <div className="font-medium whitespace-normal break-words">{option.name}</div>
                          {option.code && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-normal break-words">{option.code}</div>
                          )}
                        </button>
                      ))}
                      {searchTerm.trim() && !filteredOptions.find(o => o.name.toLowerCase() === searchTerm.toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustom(true)
                            setCustomValue(searchTerm)
                            onChange(null, searchTerm)
                            setIsOpen(false)
                            setSearchTerm('')
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-green-50 dark:hover:bg-green-900 text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700"
                        >
                          <div className="font-medium">💡 Use "{searchTerm}" (custom - not saved to systems table)</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Press Enter or click to use custom value</div>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
