import type { CurrentUser } from '@/lib/auth'
import type { HeaderNavFlags, DashboardGrantFlags } from '@/lib/nav-flags'
import type { NavTile, NavTileOption } from '@/components/DashboardNavTiles'

export function buildEmployeeDashboardTiles(
  user: CurrentUser,
  nav: HeaderNavFlags,
  grants: DashboardGrantFlags
): NavTile[] {
  const role = user.profile.role
  const isSupervisorOrAbove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(role)
  const isManagerOrAbove = ['manager', 'admin', 'super_admin'].includes(role)
  const isAdmin = ['admin', 'super_admin'].includes(role)

  const tiles: NavTile[] = []

  const timesheetOptions: NavTileOption[] = [
    {
      id: 'new',
      href: '/dashboard/timesheets/new',
      title: 'New Timesheet',
      description: 'Enter hours for this week',
      icon: 'fileText',
      color: 'blue',
    },
    {
      id: 'mine',
      href: '/dashboard/timesheets',
      title: 'My Timesheets',
      description: 'View history and status',
      icon: 'calendar',
      color: 'green',
    },
  ]
  if (isSupervisorOrAbove) {
    timesheetOptions.push({
      id: 'view-data',
      href: '/dashboard/admin/data-view',
      title: 'View Timesheet Data',
      description: 'View and filter all timesheet entries',
      icon: 'fileText',
      color: 'teal',
    })
  }
  if (isManagerOrAbove) {
    timesheetOptions.push({
      id: 'export',
      href: '/dashboard/admin/export',
      title: 'Export Timesheets',
      description: 'Export timesheets for any week',
      icon: 'fileText',
      color: 'cyan',
    })
  }
  tiles.push({
    id: 'timesheets',
    title: 'Timesheets',
    description: 'Create, view, and export timesheets',
    icon: 'fileText',
    color: 'blue',
    options: timesheetOptions,
  })

  tiles.push({
    id: 'calendars',
    title: 'Calendars',
    description: 'Holiday, pay, and expense calendars',
    icon: 'calendar',
    color: 'purple',
    href: '/dashboard/holiday-calendar',
    openInNewTab: true,
  })

  if (nav.pto.showRequest) {
    tiles.push({
      id: 'request-pto',
      title: 'Request PTO',
      description: 'Submit and track time-off requests',
      icon: 'calendarOff',
      color: 'teal',
      href: '/dashboard/pto',
    })
  }

  if (isSupervisorOrAbove) {
    tiles.push({
      id: 'manage',
      title: 'Manage',
      description: 'Organization, timesheet options, and users',
      icon: 'users',
      color: 'blue',
      options: [
        {
          id: 'organization',
          href: '/dashboard/admin/organization',
          title: 'Organization',
          description: 'Sites, Departments, Purchase Orders, Expense Types, Company Information',
          icon: 'building',
          color: 'green',
        },
        {
          id: 'timesheet-options',
          href: '/dashboard/admin/timesheet-options',
          title: 'Timesheet Options',
          description: 'Systems, Activities, Deliverables, Delegation',
          icon: 'activity',
          color: 'orange',
        },
        {
          id: 'users',
          href: '/dashboard/admin/users',
          title: 'Users',
          description:
            'View or manage profiles, roles, and approval chain (timesheet POs: set on each PO budget)',
          icon: 'users',
          color: 'blue',
        },
      ],
    })
  }

  const budgetOptions: NavTileOption[] = []
  if (grants.showBudgetDetailTile) {
    budgetOptions.push({
      id: 'budget-detail',
      href: '/dashboard/budget',
      title: 'Budget Detail',
      description: 'View PO budgets, Invoices, and Billable Hours',
      icon: 'barChart',
      color: 'teal',
    })
  }
  if (grants.showBidSheetsTile) {
    budgetOptions.push({
      id: 'bid-sheets',
      href: '/dashboard/bid-sheets',
      title: 'Bid Sheets',
      description: 'Create and Manage Bid Sheets, Convert to Project Budgets',
      icon: 'clipboardList',
      color: 'violet',
    })
  }
  if (budgetOptions.length === 1) {
    const only = budgetOptions[0]
    tiles.push({
      id: only.id,
      title: only.title,
      description: only.description,
      icon: only.icon,
      color: only.color,
      href: only.href,
    })
  } else if (budgetOptions.length > 1) {
    tiles.push({
      id: 'budgets',
      title: 'Budgets',
      description: 'PO details and bid sheets',
      icon: 'barChart',
      color: 'teal',
      options: budgetOptions,
    })
  }

  if (isSupervisorOrAbove) {
    tiles.push({
      id: 'reports',
      title: 'Reports',
      description: 'Run reports for invoices, PO status, and more',
      icon: 'fileBarChart',
      color: 'orange',
      href: '/dashboard/reports',
    })
  }

  if (nav.timesheetConfirm.show) {
    tiles.push({
      id: 'timesheet-confirmations',
      title: 'Timesheet Confirmations',
      description:
        nav.timesheetConfirm.pending > 0
          ? `${nav.timesheetConfirm.pending} awaiting confirmation`
          : 'Confirm receipt of approved timesheets',
      icon: 'clipboardCheck',
      color: 'indigo',
      href: '/dashboard/timesheet-confirmations',
      badge: nav.timesheetConfirm.pending,
    })
  }

  if (nav.pto.showReview) {
    tiles.push({
      id: 'pto-requests',
      title: 'PTO Requests',
      description:
        nav.pto.pending > 0
          ? `${nav.pto.pending} awaiting review`
          : 'Review employee time-off requests',
      icon: 'calendarOff',
      color: 'teal',
      href: '/dashboard/pto/review',
      badge: nav.pto.pending,
    })
  }

  if (isAdmin) {
    tiles.push({
      id: 'payroll',
      title: 'Payroll',
      description: 'Export & view payroll hours by week',
      icon: 'dollarSign',
      color: 'emerald',
      href: '/dashboard/admin/payroll',
      desktopOnly: true,
    })
  }

  return tiles
}
