'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'

interface HeaderProps {
  title?: string
  showBack?: boolean
  backUrl?: string
  user?: {
    profile: {
      name: string
      role: string
    }
  }
}

export default function Header({ title, showBack = false, backUrl, user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const userRole = user?.profile.role || ''
  const isAdmin = ['admin', 'super_admin'].includes(userRole)
  const canApprove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm print:hidden">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* CTG Logo */}
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              {/* Image logo - now active */}
              <Image
                src="/ctg-logo.png"
                alt="CTG Logo"
                width={120}
                height={40}
                className="h-10 w-auto"
              />
              
              {/* Text-based logo - now commented out */}
              {/* <div className="flex items-center">
                <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  CT
                </span>
                <span className="text-2xl font-bold text-blue-700 dark:text-blue-400 border-2 border-blue-700 dark:border-blue-400 rounded-sm px-1">
                  G
                </span>
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400 font-semibold leading-tight">
                COMPLIANCE<br />
                TECHNOLOGY<br />
                GROUP, INC.
              </div> */}
            </Link>

            {/* Back Button */}
            {showBack && (
              <Link
                href={backUrl || '#'}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 text-sm"
              >
                ← Back
              </Link>
            )}

            {/* Title */}
            {title && (
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {title}
              </h1>
            )}
          </div>

          {/* User Info and Hamburger Menu */}
          {user && (
            <div className="flex items-center gap-4">
              <span className="hidden md:block text-sm text-gray-600 dark:text-gray-300">
                {user.profile.name} ({user.profile.role})
              </span>
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  aria-label="Menu"
                >
                  <Menu className="h-6 w-6" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                    <div className="py-1">
                      <Link
                        href="/dashboard"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/dashboard/timesheets"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setMenuOpen(false)}
                      >
                        My Timesheets
                      </Link>
                      {canApprove && (
                        <Link
                          href="/dashboard/approvals"
                          className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => setMenuOpen(false)}
                        >
                          Pending Approvals
                        </Link>
                      )}
                      {isAdmin && (
                        <Link
                          href="/dashboard/admin"
                          className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => setMenuOpen(false)}
                        >
                          Admin Panel
                        </Link>
                      )}
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <Link
                        href="/dashboard/change-password"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setMenuOpen(false)}
                      >
                        Change Password
                      </Link>
                      <form action="/auth/logout" method="post" className="block">
                        <button
                          type="submit"
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Sign Out
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
