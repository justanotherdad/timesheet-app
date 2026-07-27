'use client'

import { useRef, useCallback } from 'react'
import { X, BookOpen } from 'lucide-react'

const SECTIONS: { id: string; title: string }[] = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'dashboard', title: 'Dashboard Overview' },
  { id: 'timesheets', title: 'Timesheets' },
  { id: 'approvals', title: 'Approvals' },
  { id: 'manage-users', title: 'Manage Users' },
  { id: 'organization', title: 'Organization & Timesheet Options' },
  { id: 'budget-detail', title: 'Budget Detail' },
  { id: 'bid-sheets', title: 'Bid Sheets' },
  { id: 'reports', title: 'Reports' },
  { id: 'data-export', title: 'View Timesheet Data & Export' },
  { id: 'holiday-calendar', title: 'Holiday & Pay Calendar' },
  { id: 'confirmations', title: 'Timesheet Confirmations' },
  { id: 'need-help', title: 'Need Help?' },
]

interface GuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GuideModal({ isOpen, onClose }: GuideModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  const scrollToSection = useCallback((id: string) => {
    if (!contentRef.current) return
    const el = contentRef.current.querySelector(`[data-section="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              CTG Timesheet Site Guide
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Close guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* TOC - sidebar on desktop, compact on mobile */}
          <nav
            className="shrink-0 w-56 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto hidden sm:block"
            aria-label="Guide sections"
          >
            <div className="sticky top-0 py-3 px-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Contents
              </p>
              <ul className="space-y-0.5">
                {SECTIONS.map(({ id, title }) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(id)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Content */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto p-4 sm:p-6 text-gray-800 dark:text-gray-200"
          >
            {/* Intro */}
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              This guide explains how to use the CTG Timesheet Management site for all roles:{' '}
              <strong>Employee</strong>, <strong>Supervisor</strong>, <strong>Manager</strong>, and{' '}
              <strong>Admin</strong>. What you see on screen depends on your role and on the
              specific access you have been granted.
            </p>

            {/* Mobile TOC */}
            <div className="sm:hidden mb-6 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Jump to section
              </p>
              <div className="flex flex-wrap gap-2">
                {SECTIONS.map(({ id, title }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => scrollToSection(id)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-700 dark:text-gray-300"
                  >
                    {title.length > 25 ? title.slice(0, 24) + '…' : title}
                  </button>
                ))}
              </div>
            </div>

            <GuideContent />
          </div>
        </div>
      </div>
    </div>
  )
}

function GuideContent() {
  return (
    <div className="space-y-8 prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-4">
      <section data-section="getting-started" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          1. Getting Started
        </h3>
        <h4 className="text-sm font-semibold mt-3 mb-1">Logging in</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Go to the site URL (e.g. <strong>ctgtimesheet.com</strong>).</li>
          <li>Enter your <strong>email</strong> and <strong>password</strong>.</li>
          <li>Click <strong>Sign In</strong>.</li>
          <li>You are taken to the <strong>Dashboard</strong>.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">First-time login (invitation link)</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          If an admin or manager sent you an <strong>invitation link</strong> (e.g. to set your password):
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Click the link they sent (by email, Teams, etc.).</li>
          <li>If you are taken to an <strong>Invite</strong> or <strong>Set up password</strong> page, create a password and confirm it.</li>
          <li>After setting your password, you will be signed in and can use the site as usual.</li>
        </ol>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          If you forget your password, use <strong>Forgot password</strong> on the login page to have
          a reset link emailed to you.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Changing your password</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Open the <strong>menu</strong> (☰) at the top right of any page and choose{' '}
          <strong>Change Password</strong>.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Signing out</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Open the <strong>menu</strong> (☰) and choose <strong>Sign Out</strong>.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Automatic logoff</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          If you are inactive (no mouse, keyboard, scroll, or touch) for <strong>one hour</strong>,
          the site signs you out and sends you to the login page; any activity resets that timer.
          Separately, every session ends <strong>eight hours</strong> after you log in, even if you
          have been active the whole time. Save your work as a draft if you are going to step away.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Light and dark mode</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Use the <strong>sun / moon</strong> button in the header to switch between light and dark
          appearance. Your choice is remembered on that browser.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Opening this guide</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Click the <strong>book</strong> icon in the header, or open the <strong>menu</strong> (☰)
          and choose <strong>Site Guide</strong>. It is available from every page.
        </p>
      </section>

      <section data-section="dashboard" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          2. Dashboard Overview
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          After login you see the <strong>Timesheet Dashboard</strong>: a set of tiles at the top and
          one to three panels below. Which tiles and panels appear depends on your{' '}
          <strong>role</strong> and on any access you have been granted.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Everyone sees</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>New Timesheet</strong> – Start a timesheet for the current week.</li>
          <li><strong>My Timesheets</strong> – Your own timesheets, with history and status. Admins see all timesheets here with filters. Supervisors and managers open other people’s timesheets from <strong>Pending Approvals</strong> or <strong>Approved Timesheets</strong> instead.</li>
          <li><strong>Holiday &amp; Pay Calendar</strong> – The company holiday and pay schedule. Opens in a new browser tab.</li>
          <li><strong>Most Recent Timesheets</strong> – A panel listing your five most recent timesheets in any status (draft, submitted, approved, rejected), colour-coded, each with a <strong>View</strong> link.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">Supervisors, Managers, and Admins also see</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Manage Users</strong> – Profiles, roles, and the approval chain (supervisors: view only).</li>
          <li><strong>Manage Organization</strong> – Sites, Departments, Purchase Orders, Expense Types, Company Information (supervisors: view only).</li>
          <li><strong>Manage Timesheet Options</strong> – Systems, Activities, Deliverables, Delegation (supervisors: view only).</li>
          <li><strong>Bid Sheets</strong> – Build and manage bid sheets and convert them to project budgets (supervisors: view only).</li>
          <li><strong>View Timesheet Data</strong> – View, filter, and export timesheet entries.</li>
          <li><strong>Pending Approvals</strong> panel – Timesheets waiting on you, with a <strong>Review</strong> link.</li>
          <li><strong>Approved Timesheets</strong> panel – Timesheets you have approved, including ones still waiting on a later approver.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">Managers and Admins also see</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Budget Detail</strong> – PO budgets, invoices, expenses, billable hours and cost, and bill rates.</li>
          <li><strong>Reports</strong> – Outstanding Invoices, PO Status, and generated budget status reports.</li>
          <li><strong>Export Timesheets</strong> – Export timesheets for any week.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">Tiles that depend on a specific grant</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Budget Detail</strong> also appears for a supervisor or employee who has been granted <strong>budget access</strong> on at least one PO — they see only those POs.</li>
          <li><strong>Bid Sheets</strong> also appears for an employee who has been granted access to at least one bid sheet — they see only those sheets.</li>
          <li><strong>Timesheet Confirmations</strong> appears only if you have been named as a confirmation assignee under Company Information. A badge shows how many timesheets are awaiting your confirmation. See section 12.</li>
          <li><strong>Pending Approvals</strong> also appears for an employee who is currently an active <strong>approval delegate</strong> for someone else. See section 6.3.</li>
        </ul>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
          <strong>On phones:</strong> the <strong>View Timesheet Data</strong> and{' '}
          <strong>Export Timesheets</strong> tiles are hidden on small screens because those pages
          need a wide layout. You can still reach them from the <strong>menu</strong> (☰), and every
          other tile is also available there.
        </p>
      </section>

      <section data-section="timesheets" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          3. Timesheets
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          A timesheet covers one week (Monday through Sunday) and has two parts: a{' '}
          <strong>Billable Time</strong> section, where hours are charged to a purchase order, and a{' '}
          <strong>Non-Billable Time</strong> section for Holiday, Internal, and PTO hours.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.1 Creating a new timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>From the Dashboard, click <strong>New Timesheet</strong>.</li>
          <li>You are on <strong>New Weekly Timesheet</strong> for the current week. Change the week if you are entering time for an earlier week.</li>
          <li>Optionally use <strong>Copy Previous Week</strong> to bring in last week’s rows (see 3.2).</li>
          <li>Add <strong>billable</strong> rows: Site/Client, PO, Task description, System / Deliverable / Activity as needed, and hours per day. <strong>Which POs appear</strong> comes from <strong>Bill Rates by Person</strong> on each PO’s budget — not from Manage Users. The System, Deliverable, and Activity dropdowns then follow the sites and links tied to those POs.</li>
          <li>Add <strong>Non-Billable</strong> rows (Holiday, Internal, PTO) if applicable, using <strong>Add Row</strong> and picking the type. The Description field offers standard choices, or you can type your own.</li>
          <li>Click <strong>Save as Draft</strong> to finish later, or <strong>Submit</strong> when the week is complete.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.2 Copy Previous Week</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          On <strong>New Timesheet</strong> or <strong>Edit Timesheet</strong>, if you had a timesheet
          the <strong>previous week</strong> with entries, a green <strong>Copy Previous Week</strong>{' '}
          button appears next to the week selector.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Click <strong>Copy Previous Week</strong>.</li>
          <li>Read the message in the pop-up: it copies all billable and Non-Billable entries from the previous week.</li>
          <li>Click <strong>Copy Data</strong>.</li>
          <li>The rows are added to the current timesheet. Edit or delete any of them, then save or submit.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.3 Editing a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          You can edit your own timesheet while it is <strong>Draft</strong> or{' '}
          <strong>Rejected</strong>.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Go to <strong>My Timesheets</strong>.</li>
          <li>Open the timesheet, then click <strong>Edit</strong>.</li>
          <li>Change rows, hours, or Non-Billable time as needed. The <strong>Edit Billable Entry</strong> pop-up can be resized by dragging its bottom-right corner.</li>
          <li><strong>Save as Draft</strong> or <strong>Submit</strong> when done.</li>
        </ol>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          <strong>Admins</strong> can edit any timesheet; everyone else can only edit their own, and
          only while it is draft or rejected.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.4 Submitting a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Fill in all required rows and hours.</li>
          <li>Click <strong>Submit</strong>.</li>
          <li>The timesheet becomes <strong>Submitted</strong> and enters the approval chain: <strong>Employee → Supervisor → Manager → Final Approver</strong>. Where a field on your profile is set to “None,” the next person in the chain is used.</li>
          <li>If you are your own final approver with nobody above you, the timesheet is approved automatically.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.5 Viewing a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Go to <strong>My Timesheets</strong> (or <strong>Pending Approvals</strong> if you are an approver).</li>
          <li>Click the timesheet, or <strong>View</strong> / <strong>Review</strong>.</li>
          <li>You see the whole week: status, billable rows with a Billable Total, the Non-Billable Time section with a Non-Billable Total, the grand total, and — once submitted or approved — approval and signature information. On long timesheets, a <strong>Jump to Non-Billable Time</strong> link appears under the billable table.</li>
          <li>From here you can use <strong>Edit</strong>, <strong>Export PDF</strong>, or <strong>Recall</strong> where those apply.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.6 Deleting a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          You can delete your own <strong>Draft</strong> timesheets from the timesheet view or edit
          page. <strong>Admins</strong> can delete timesheets in other statuses. Deletion is
          permanent, so use it with care.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.7 Recall (unsubmit) a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          While a timesheet is <strong>Submitted</strong> and not yet fully approved, a{' '}
          <strong>Recall</strong> option returns it to <strong>Draft</strong> so you can correct
          something and resubmit. Use it before your approver acts on the sheet.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.8 Export PDF</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          From the timesheet detail page, use <strong>Export PDF</strong> to get a printable copy of
          that week, including signatures. A filter lets you limit the export by client, PO, or
          system, and to leave out non-billable hours. Available to the timesheet’s owner, to
          approvers who opened it from <strong>Pending Approvals</strong> or{' '}
          <strong>Approved Timesheets</strong>, and to Admins for any timesheet.
        </p>
      </section>

      <section data-section="approvals" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          4. Approvals
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          <strong>Supervisors</strong>, <strong>Managers</strong>, and <strong>Admins</strong> approve
          timesheets for the people in their approval chain. An <strong>Employee</strong> also gets
          an approval list while they are acting as someone’s delegate (see 6.3).
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.1 Seeing pending approvals</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>The <strong>Pending Approvals</strong> panel on the Dashboard lists timesheets waiting on you.</li>
          <li>Click the panel heading to open the full <strong>Pending Approvals</strong> page.</li>
          <li>You see employee name, week ending, and submitted date. A timesheet appears only when it is <strong>your turn</strong> in the chain.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.2 Approving a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Open <strong>Pending Approvals</strong> and select the timesheet.</li>
          <li>Review the week. The side panel shows <strong>Billable</strong> and <strong>Non-Billable</strong> hour totals.</li>
          <li>Click <strong>Approve</strong>.</li>
          <li>Your approval is recorded. The timesheet moves to the next approver, or becomes <strong>Approved</strong> if you are the last one.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.3 Rejecting a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Click <strong>Reject</strong> for the timesheet.</li>
          <li>On the <strong>Reject timesheet</strong> page, enter a <strong>required note</strong> explaining what needs to change (e.g. “Please correct Friday hours for Project X”).</li>
          <li>Submit the rejection.</li>
          <li>The status becomes <strong>Rejected</strong>. The employee sees your note, can edit, and can resubmit.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.4 Seeing approved timesheets</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Use the <strong>Approved Timesheets</strong> panel or page. It covers people in your
          approval chain — not the whole company — and also lists sheets you have already signed that
          are still waiting on a later approver, marked{' '}
          <strong>Approved by you · awaiting final approval</strong>.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.5 Clearing a rejection note (Admins)</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Admins</strong> can clear the rejection note on a rejected timesheet, for example
          so the employee can resubmit without the old note attached. The option is on the timesheet
          detail page.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.6 Going on leave</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          If you will be away, set up a <strong>delegation</strong> so approvals do not stall while
          you are out. See section 6.3.
        </p>
      </section>

      <section data-section="manage-users" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          5. Manage Users
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Who can open it:</strong> Supervisors, Managers, and Admins. Who appears in the
          list, and what you can change, depends on your role.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.1 Opening Manage Users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          From the Dashboard, click <strong>Manage Users</strong>, or use the <strong>menu</strong>{' '}
          (☰).
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.2 Viewing users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          You see a table (cards on mobile) with Name, Status, Role,{' '}
          <strong>Timesheet POs (bill rates)</strong>, Supervisor, Final Approver, and{' '}
          <strong>View</strong>. Use the <strong>Search</strong>, <strong>Role</strong>, and{' '}
          <strong>Timesheet PO</strong> filters to narrow the list. Click <strong>View</strong> or the
          user’s name to open their details.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Timesheet POs</strong> is read-only here. It reflects the POs where the person has
          an active bill rate, and it is where you look to confirm someone is set up to enter time.
          If you can open the PO’s budget, each entry is a link to it.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.3 Supervisor: view only</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Supervisors see only the <strong>employees</strong> who report to them. You can open a user
          and read their details, but you cannot add or edit users, set passwords, or delete anyone.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.4 Manager: add and edit users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          You see the <strong>employees and supervisors</strong> who report to you.{' '}
          <strong>To add a user:</strong> click <strong>Add User</strong> and fill in name, email,
          role (Employee, Supervisor, or Manager), Supervisor, Manager, and Final Approver.{' '}
          <strong>To edit a user:</strong> open them with <strong>View</strong>, then click{' '}
          <strong>Edit</strong>. You can also use <strong>Set Password</strong> for people who report
          to you. Timesheet PO access is not set here — it comes from{' '}
          <strong>Bill Rates by Person</strong> on each PO’s budget.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.5 Admin: full user management</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Admins see all users, can add and edit users, set any role up to Manager or Admin, set
          passwords for anyone, and deactivate or delete users other than themselves. Optional
          fields include <strong>Title</strong> (shown on the project budget “By individual” report)
          and <strong>Employee ID</strong> (an HR identifier used in exports).
        </p>
      </section>

      <section data-section="organization" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          6. Organization &amp; Timesheet Options
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          These two screens define what appears on timesheets. <strong>Manage Organization</strong>{' '}
          covers Sites, Departments, Purchase Orders, Expense Types, and Company Information.{' '}
          <strong>Manage Timesheet Options</strong> covers Systems, Activities, Deliverables, and
          Delegation. Both are scoped to the sites you can access — see 6.4.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.1 Manage Organization</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Organization</strong>. Tabs cover{' '}
          <strong>Sites</strong>, <strong>Departments</strong>, <strong>Purchase Orders</strong>,{' '}
          <strong>Expense Types</strong>, and <strong>Company Information</strong>.{' '}
          <strong>Supervisors:</strong> view only, and only for their sites.{' '}
          <strong>Managers:</strong> add, edit, and delete sites, departments, and POs for their
          sites. <strong>Admins:</strong> all sites, plus Expense Types and Company Information.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.2 Manage Timesheet Options</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Timesheet Options</strong>. One screen
          with tabs for <strong>Systems</strong>, <strong>Activities</strong>,{' '}
          <strong>Deliverables</strong>, and <strong>Delegation</strong>. The first three define the
          options people can choose on a timesheet row.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Pick a tab.</li>
          <li>Choose a site in <strong>Select Site</strong>. Nothing else appears until you do.</li>
          <li>Add, edit, delete, or import items for that site, and link them to departments and POs so they show up on the right timesheet rows.</li>
        </ol>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          <strong>Supervisors:</strong> view only. <strong>Managers:</strong> full add, edit, delete,
          and import for their sites. <strong>Admins:</strong> all sites.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.3 Delegation</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          Delegation hands your approvals to someone else for a set date range, so timesheets keep
          moving while you are on leave. It is the <strong>Delegation</strong> tab of Manage
          Timesheet Options.
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Supervisors and Managers</strong> manage their own delegations: choose a delegate and a start and end date.</li>
          <li>While the delegation is active, the timesheets that would have waited on you appear in your delegate’s <strong>Pending Approvals</strong> instead — including for a delegate who is otherwise an employee.</li>
          <li>You can have the delegation noted on the approval record.</li>
          <li><strong>Admins</strong> see and manage delegations for everyone, with both delegator and delegate listed.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.4 How your site access is determined</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Admins</strong> can always see and manage every site. For{' '}
          <strong>Supervisors</strong> and <strong>Managers</strong>, the{' '}
          <strong>Select Site</strong> lists on these screens come from:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>the sites behind the POs where you have an active bill rate under <strong>Bill Rates by Person</strong>, plus</li>
          <li>any site an admin has assigned to you directly, and</li>
          <li>for Managers, the same for the people who report to you.</li>
        </ul>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          If <strong>Select Site</strong> is empty, you have no site access yet. Ask an admin to add
          you to a PO for that site under{' '}
          <strong>Budget Detail → Bill Rates by Person</strong>. Note that a bill rate is what grants
          site access; it does{' '}
          <strong>not</strong> by itself let you open that PO’s budget, which needs a separate grant
          (see 7.1).
        </p>
      </section>

      <section data-section="budget-detail" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          7. Budget Detail
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          <strong>Budget Detail</strong> is the financial view of a single purchase order: client and
          PO information, the budget summary and balance, invoices, expenses, change orders, bill
          rates, and billable hours and cost.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">7.1 Who can access Budget Detail</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Admins:</strong> every PO, full view and full edit. Admins are also the only people
          who can grant or revoke budget access.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Managers, Supervisors, and Employees:</strong> only the POs where an admin has{' '}
          <strong>granted budget access</strong>. Once granted you get the full view for that PO.
          This is a separate grant from a bill rate: being listed under{' '}
          <strong>Bill Rates by Person</strong> lets you charge time to a PO, but does not open its
          budget.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Budget Balance</strong> uses approved hours from <strong>everyone</strong> on the
          PO, so grantees see the same figures as admins.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">7.2 Opening Budget Detail</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>From the <strong>Dashboard</strong>, click <strong>Budget Detail</strong>, then pick a site and PO.</li>
          <li>From <strong>Manage Organization</strong>, click <strong>View Budget Detail</strong> on a PO card.</li>
          <li>From <strong>Manage Users</strong>, click one of a person’s <strong>Timesheet POs</strong> entries.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">7.3 What you can do there</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Bill Rates by Person</strong> – Set who works on this PO and at what rate, with effective dates. This is what puts the PO on someone’s timesheet.</li>
          <li><strong>Invoices and Expenses</strong> – Record invoices and expenses against the PO and track what is outstanding.</li>
          <li><strong>Billable hours</strong> – Review hours and cost, broken down by system and by individual, and drill into the timesheets behind a figure.</li>
          <li><strong>Change Orders</strong> – Record changes to the PO value.</li>
          <li><strong>Attachments and notes</strong> – Keep supporting documents and images with the budget.</li>
          <li><strong>Budget Access</strong> (admins) – Grant or revoke access for a user: select the PO, open <strong>Budget Access</strong>, then <strong>Grant Access</strong> and choose the name.</li>
        </ul>
      </section>

      <section data-section="bid-sheets" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          8. Bid Sheets
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          A <strong>bid sheet</strong> is how you estimate a job before it becomes work: lay out the
          systems, deliverables, and activities, estimate labor, and total it up. A finished sheet can
          be converted into a project budget on a PO.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">8.1 Who can access Bid Sheets</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Admins:</strong> all bid sheets. <strong>Managers:</strong> sheets for their sites,
          plus any sheet shared with them. <strong>Supervisors:</strong> the same list, view only.{' '}
          <strong>Employees:</strong> only sheets explicitly shared with them.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">8.2 Working on a bid sheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>From the Dashboard, click <strong>Bid Sheets</strong> to see the list, filtered by site.</li>
          <li>Create a sheet, or open an existing one.</li>
          <li>Define its <strong>systems</strong>, <strong>deliverables</strong>, and <strong>activities</strong>, then enter line items and estimated hours. You can <strong>import</strong> rows rather than typing them.</li>
          <li>Add <strong>labor</strong> for named people and <strong>indirect labor</strong> for effort that is not tied to a single line.</li>
          <li>Share the sheet with specific users if others need to see or work on it.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">8.3 Converting to a project budget</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          When the bid is won, <strong>convert</strong> the sheet into a project budget on a purchase
          order. The systems, deliverables, and activities carry over and become the matrix that
          timesheet rows for that PO are checked against, so people can only book time to
          combinations that exist on the budget.
        </p>
      </section>

      <section data-section="reports" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          9. Reports
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          <strong>Where:</strong> Dashboard → <strong>Reports</strong>. Available to{' '}
          <strong>Managers</strong> and <strong>Admins</strong>. Pick a report from the tiles at the
          top; each one opens below and can be printed.
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Outstanding Invoices</strong> – Invoices with no payment received, organized by client.</li>
          <li><strong>PO Status</strong> – Full PO status by client, with totals and filters.</li>
          <li><strong>Generate Report</strong> – A budget status report for the POs you choose. Generated reports are saved for one year, so you can reopen the version you sent out rather than re-running it.</li>
        </ul>
      </section>

      <section data-section="data-export" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          10. View Timesheet Data &amp; Export
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Two different tools: one for looking at entries on screen, one for producing files to send
          on. Both are laid out for a wide screen, so their dashboard tiles are hidden on phones.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">10.1 View Timesheet Data</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Where:</strong> Dashboard → <strong>View Timesheet Data</strong>. Open to{' '}
          <strong>Supervisors</strong>, <strong>Managers</strong>, and <strong>Admins</strong>. Every
          timesheet row appears as one line — billable entries and Non-Billable hours together — and
          you can filter by week, person, site, PO, and department, sort any column, and download the
          result as a CSV. Supervisors and Managers see their own sites and people; Admins see
          everything.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">10.2 Export Timesheets</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Where:</strong> Dashboard → <strong>Export Timesheets</strong>. Available to{' '}
          <strong>Managers</strong> and <strong>Admins</strong>. Choose a week and export the
          timesheets in it, either as a set of printable timesheet pages (one per person, matching
          the single-timesheet PDF) or as a spreadsheet summary. Filters let you limit the export by
          client, PO, or system, and to leave out non-billable hours.
        </p>
      </section>

      <section data-section="holiday-calendar" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          11. Holiday &amp; Pay Calendar
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Where:</strong> Dashboard → <strong>Holiday &amp; Pay Calendar</strong>, which opens
          in a new browser tab so you can keep it beside your timesheet. Everyone can view it. It
          shows the company holidays and the pay schedule for a year, and you can switch years.
          <strong> Admins</strong> can edit the calendar; everyone else sees it read-only. Use it to
          confirm which days should be entered as Holiday in the{' '}
          <strong>Non-Billable Time</strong> section.
        </p>
      </section>

      <section data-section="confirmations" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          12. Timesheet Confirmations
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          This screen is a checklist for the people responsible for collecting approved timesheets,
          for example ahead of client billing. It appears only if an admin has named you as a
          confirmation assignee under <strong>Company Information</strong>, so most people never see
          it.
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Where:</strong> the <strong>Timesheet Confirmations</strong> tile on the Dashboard, or the <strong>menu</strong> (☰). A badge shows how many are waiting.</li>
          <li>Approved timesheets stay in your list until you <strong>confirm receipt</strong> of each one.</li>
          <li>View or export a timesheet first, then confirm it.</li>
          <li>Each assignee has their own list, so your confirming does not clear anyone else’s.</li>
        </ul>
      </section>

      <section data-section="need-help" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          Need Help?
        </h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Login or password:</strong> Use <strong>Forgot password</strong> on the login page, or contact your manager or an administrator.</li>
          <li><strong>Empty PO dropdown on a timesheet:</strong> You need an active bill rate. Ask an admin to add you under <strong>Budget Detail</strong> → the PO → <strong>Bill Rates by Person</strong>.</li>
          <li><strong>Empty System / Activity / Deliverable dropdowns:</strong> These follow the sites and departments of your POs, and the links set in <strong>Manage Timesheet Options</strong>. If a PO uses a project budget, only combinations on that budget can be chosen.</li>
          <li><strong>Empty Select Site on Manage Organization or Manage Timesheet Options:</strong> You have no site access yet. See section 6.4.</li>
          <li><strong>Can’t open a PO’s budget:</strong> Budget access is a separate grant that only an admin can give. Ask an admin to go to <strong>Budget Detail</strong> → the PO → <strong>Budget Access</strong> → <strong>Grant Access</strong> and select your name.</li>
          <li><strong>Timesheet went to the wrong approver:</strong> The chain is Employee → Supervisor → Manager → Final Approver, taken from your profile in <strong>Manage Users</strong>. Where a field is “None,” the next person up is used. Check also whether a <strong>delegation</strong> is active (section 6.3).</li>
          <li><strong>Approvals piling up while someone is away:</strong> Set up a delegation for the dates they are out (section 6.3).</li>
          <li><strong>A tile is missing on your phone:</strong> <strong>View Timesheet Data</strong> and <strong>Export Timesheets</strong> are hidden on small screens. Use the <strong>menu</strong> (☰), or a desktop browser.</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6 italic">
          Last updated to match the current CTG Timesheet Management site: bill-rate–driven timesheet
          POs and site access, grant-based budget access, approval delegation, Bid Sheets, Reports,
          Holiday &amp; Pay Calendar, and Timesheet Confirmations.
        </p>
      </section>
    </div>
  )
}
