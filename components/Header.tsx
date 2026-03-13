'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, BookOpen, Sun, Moon } from 'lucide-react'
import GuideModal from './GuideModal'

interface HeaderProps {
  title?: string
  titleHref?: string
  showBack?: boolean
  backUrl?: string
  user?: {
    profile: {
      name: string
      role: string
    }
  }
}

export default function Header({ title, titleHref, showBack = false, backUrl, user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    setDarkMode(isDark)
  }

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
  const canApprove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)
  const canManageOrg = ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)
  const canManageBudget = ['manager', 'admin', 'super_admin'].includes(userRole)
  const canBidSheets = ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm print:hidden">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {/* CTG Logo */}
            <Link
              href="/dashboard"
              prefetch={false}
              className="flex items-center shrink-0 hover:opacity-80 transition-opacity pointer-events-auto"
            >
              {/* Image logo - now active */}
              <Image
                src="/ctg-logo.png"
                alt="CTG Logo"
                width={120}
                height={40}
                className="h-8 sm:h-10 w-auto pointer-events-none select-none"
                draggable={false}
                unoptimized
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
                className="shrink-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 text-sm py-1"
              >
                ← Back
              </Link>
            )}

            {/* Title */}
            {title && (
              titleHref ? (
                <Link
                  href={titleHref}
                  className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {title}
                </Link>
              ) : (
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0">
                  {title}
                </h1>
              )
            )}
          </div>

          {/* User Info, Guide, and Hamburger Menu */}
          {user && (
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="hidden md:block text-sm text-gray-600 dark:text-gray-300">
                {user.profile.name} ({user.profile.role})
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={darkMode ? 'Light mode' : 'Dark mode'}
              >
                {darkMode ? <Sun className="h-5 w-5 sm:h-6 sm:w-6" /> : <Moon className="h-5 w-5 sm:h-6 sm:w-6" />}
              </button>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                aria-label="Open site guide"
                title="Site Guide"
              >
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
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
                      {canApprove && (
                        <Link href="/dashboard/approvals/approved" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Approved Timesheets
                        </Link>
                      )}
                      {canManageBudget && (
                        <Link href="/dashboard/budget" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Budget Detail
                        </Link>
                      )}
                      {canBidSheets && (
                        <Link href="/dashboard/bid-sheets" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Bid Sheets
                        </Link>
                      )}
                      <Link href="/dashboard" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                        Dashboard
                      </Link>
                      {canManageBudget && (
                        <Link href="/dashboard/admin/export" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Export Timesheets
                        </Link>
                      )}
                      {canManageOrg && (
                        <Link href="/dashboard/admin/organization" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Manage Organization
                        </Link>
                      )}
                      {canManageOrg && (
                        <Link href="/dashboard/admin/timesheet-options" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Manage Timesheet Options
                        </Link>
                      )}
                      {canManageOrg && (
                        <Link href="/dashboard/admin/users" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Manage Users
                        </Link>
                      )}
                      <Link href="/dashboard/timesheets" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                        My Timesheets
                      </Link>
                      {canApprove && (
                        <Link href="/dashboard/approvals" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          Pending Approvals
                        </Link>
                      )}
                      <button type="button" onClick={() => { setGuideOpen(true); setMenuOpen(false) }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Site Guide
                      </button>
                      {canManageBudget && (
                        <Link href="/dashboard/admin/data-view" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                          View Timesheet Data
                        </Link>
                      )}
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <Link href="/dashboard/change-password" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setMenuOpen(false)}>
                        Change Password
                      </Link>
                      <form action="/auth/logout" method="post" className="block">
                        <button type="submit" className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
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
      <GuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </header>
  )
}
