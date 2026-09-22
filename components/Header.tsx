'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, BookOpen, Sun, Moon, ClipboardCheck, CalendarOff, ChevronRight } from 'lucide-react'
import GuideModal from './GuideModal'
import { useHeaderNav } from './HeaderNavProvider'

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

function MenuLink({
  href,
  onClick,
  children,
  className = 'block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}

function MenuGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <span>{label}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="bg-gray-50 dark:bg-gray-900/40">{children}</div>}
    </div>
  )
}

export default function Header({ title, titleHref, showBack = false, backUrl, user }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const nav = useHeaderNav()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const isDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', isDark)
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light')
    } catch {
      // localStorage unavailable
    }
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

  const closeMenu = () => setMenuOpen(false)

  const userRole = user?.profile.role || ''
  const isClient = userRole === 'client'
  const canApprove = ['supervisor', 'manager', 'admin', 'super_admin', 'client'].includes(userRole)
  const canAccessPendingApprovals = [
    'employee',
    'supervisor',
    'manager',
    'admin',
    'super_admin',
    'client',
  ].includes(userRole)
  const canManageOrg = !isClient && ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)
  const canManageBudget = !isClient && ['manager', 'admin', 'super_admin'].includes(userRole)
  const canBidSheets = !isClient && ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)
  const canManagePayroll = !isClient && ['admin', 'super_admin'].includes(userRole)

  const timesheetItems: Array<{ href: string; label: string }> = []
  if (!isClient) {
    timesheetItems.push({ href: '/dashboard/timesheets/new', label: 'New Timesheet' })
    timesheetItems.push({ href: '/dashboard/timesheets', label: 'My Timesheets' })
  }
  if (!isClient && canManageBudget) {
    timesheetItems.push({ href: '/dashboard/admin/data-view', label: 'View Timesheet Data' })
    timesheetItems.push({ href: '/dashboard/admin/export', label: 'Export Timesheets' })
  }

  const manageItems: Array<{ href: string; label: string }> = []
  if (!isClient && canManageOrg) {
    manageItems.push({ href: '/dashboard/admin/organization', label: 'Organization' })
    manageItems.push({ href: '/dashboard/admin/timesheet-options', label: 'Timesheet Options' })
    manageItems.push({ href: '/dashboard/admin/users', label: 'Users' })
  }

  const budgetItems: Array<{ href: string; label: string }> = []
  if (canManageBudget || nav.clientBudget) {
    budgetItems.push({ href: '/dashboard/budget', label: 'Budget Detail' })
  }
  if (canBidSheets) {
    budgetItems.push({ href: '/dashboard/bid-sheets', label: 'Bid Sheets' })
  }

  const subLinkClass =
    'block px-8 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm print:hidden">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Link
              href="/dashboard"
              prefetch={false}
              className="flex items-center shrink-0 hover:opacity-80 transition-opacity pointer-events-auto"
            >
              <Image
                src="/ctg-logo.png"
                alt="CTG Logo"
                width={120}
                height={40}
                className="h-8 sm:h-10 w-auto pointer-events-none select-none"
                draggable={false}
                unoptimized
              />
            </Link>

            {showBack && (
              <Link
                href={backUrl || '#'}
                className="shrink-0 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 text-sm py-1"
              >
                ← Back
              </Link>
            )}

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
              {!isClient && (
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  aria-label="Open site guide"
                  title="Site Guide"
                >
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                  aria-label="Menu"
                >
                  <Menu className="h-6 w-6" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-[80vh] overflow-y-auto">
                    <div className="py-1">
                      {canApprove && (
                        <MenuLink href="/dashboard/approvals/approved" onClick={closeMenu}>
                          Approved Timesheets
                        </MenuLink>
                      )}
                      {budgetItems.length > 1 ? (
                        <MenuGroup label="Budgets">
                          {budgetItems.map((item) => (
                            <MenuLink key={item.href} href={item.href} onClick={closeMenu} className={subLinkClass}>
                              {item.label}
                            </MenuLink>
                          ))}
                        </MenuGroup>
                      ) : (
                        budgetItems.map((item) => (
                          <MenuLink key={item.href} href={item.href} onClick={closeMenu}>
                            {item.label}
                          </MenuLink>
                        ))
                      )}
                      <MenuLink href="/dashboard" onClick={closeMenu}>
                        Dashboard
                      </MenuLink>
                      {!isClient && canManageBudget && (
                        <MenuLink href="/dashboard/reports" onClick={closeMenu}>
                          Reports
                        </MenuLink>
                      )}
                      {timesheetItems.length > 1 ? (
                        <MenuGroup label="Timesheets">
                          {timesheetItems.map((item) => (
                            <MenuLink key={item.href} href={item.href} onClick={closeMenu} className={subLinkClass}>
                              {item.label}
                            </MenuLink>
                          ))}
                        </MenuGroup>
                      ) : (
                        timesheetItems.map((item) => (
                          <MenuLink key={item.href} href={item.href} onClick={closeMenu}>
                            {item.label}
                          </MenuLink>
                        ))
                      )}
                      {manageItems.length > 1 ? (
                        <MenuGroup label="Manage">
                          {manageItems.map((item) => (
                            <MenuLink key={item.href} href={item.href} onClick={closeMenu} className={subLinkClass}>
                              {item.label}
                            </MenuLink>
                          ))}
                        </MenuGroup>
                      ) : (
                        manageItems.map((item) => (
                          <MenuLink key={item.href} href={item.href} onClick={closeMenu}>
                            {item.label}
                          </MenuLink>
                        ))
                      )}
                      {!isClient && nav.timesheetConfirm.show && (
                        <Link
                          href="/dashboard/timesheet-confirmations"
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={closeMenu}
                        >
                          <span className="flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4 shrink-0" />
                            Timesheet Confirmations
                          </span>
                          {nav.timesheetConfirm.pending > 0 && (
                            <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold">
                              {nav.timesheetConfirm.pending > 99 ? '99+' : nav.timesheetConfirm.pending}
                            </span>
                          )}
                        </Link>
                      )}
                      {canAccessPendingApprovals && (
                        <MenuLink href="/dashboard/approvals" onClick={closeMenu}>
                          Pending Approvals
                        </MenuLink>
                      )}
                      {canManagePayroll && (
                        <MenuLink href="/dashboard/admin/payroll" onClick={closeMenu}>
                          Payroll
                        </MenuLink>
                      )}
                      {nav.pto.showReview && (
                        <Link
                          href="/dashboard/pto/review"
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={closeMenu}
                        >
                          <span className="flex items-center gap-2">
                            <CalendarOff className="h-4 w-4 shrink-0" />
                            PTO Requests
                          </span>
                          {nav.pto.pending > 0 && (
                            <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold">
                              {nav.pto.pending > 99 ? '99+' : nav.pto.pending}
                            </span>
                          )}
                        </Link>
                      )}
                      {nav.pto.showRequest && (
                        <MenuLink href="/dashboard/pto" onClick={closeMenu}>
                          Request PTO
                        </MenuLink>
                      )}
                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => {
                            setGuideOpen(true)
                            closeMenu()
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Site Guide
                        </button>
                      )}
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <MenuLink href="/dashboard/change-password" onClick={closeMenu}>
                        Change Password
                      </MenuLink>
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
      <GuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </header>
  )
}
