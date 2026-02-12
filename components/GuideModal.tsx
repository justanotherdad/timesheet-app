'use client'

import { useRef, useCallback } from 'react'
import { X, BookOpen } from 'lucide-react'

const SECTIONS: { id: string; title: string }[] = [
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'dashboard', title: 'Dashboard Overview' },
  { id: 'timesheets', title: 'Timesheets' },
  { id: 'approvals', title: 'Approvals' },
  { id: 'manage-users', title: 'Manage Users' },
  { id: 'organization', title: 'Organization, Systems, Activities, Deliverables' },
  { id: 'data-export', title: 'View Timesheet Data & Export' },
  { id: 'quick-reference', title: 'Quick Reference by Role' },
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
              <strong>Employee</strong>, <strong>Supervisor</strong>, <strong>Manager</strong>,{' '}
              <strong>Admin</strong>, and <strong>Super Admin</strong>.
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
        <h4 className="text-sm font-semibold mt-3 mb-1">Changing your password</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          From the Dashboard, use the <strong>header menu</strong> (your name or profile) to open <strong>Change Password</strong> if that option is available, or ask an admin how to change it.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Logging out</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Use the <strong>header menu</strong> and choose <strong>Log out</strong> (or the equivalent link).
        </p>
      </section>

      <section data-section="dashboard" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          2. Dashboard Overview
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          After login, you see the <strong>Timesheet Dashboard</strong>. The cards and links you see depend on your <strong>role</strong>.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">Everyone sees</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>New Timesheet</strong> – Start a new timesheet for the current week.</li>
          <li><strong>My Timesheets</strong> – List of your timesheets (and, for supervisors/managers, timesheets of people who have you as their Supervisor, Manager, or Final Approver).</li>
          <li><strong>Current Week</strong> – Quick view of this week’s timesheet (if one exists) with a link to view or create.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">Supervisors, Managers, Admins, and Super Admins also see</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Manage Users</strong> – Open the user management page (supervisors: view only; managers and above: add/edit as allowed).</li>
          <li><strong>Pending Approvals</strong> – Timesheets waiting for your approval (with count).</li>
          <li><strong>Manage Organization</strong> – Sites, departments, purchase orders (supervisors: view only).</li>
          <li><strong>Manage Systems</strong> – System options for timesheet rows (supervisors: view only).</li>
          <li><strong>Manage Activities</strong> – Activity options (supervisors: view only).</li>
          <li><strong>Manage Deliverables</strong> – Deliverable options (supervisors: view only).</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">Managers, Admins, and Super Admins also see</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>View Timesheet Data</strong> – View and filter all timesheet entries.</li>
          <li><strong>Export Timesheets</strong> – Export timesheets for any week.</li>
        </ul>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
          <strong>Employees</strong> see only <strong>New Timesheet</strong>, <strong>My Timesheets</strong>, and the <strong>Current Week</strong> section.
        </p>
      </section>

      <section data-section="timesheets" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          3. Timesheets
        </h3>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.1 Creating a new timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>From the Dashboard, click <strong>New Timesheet</strong> (or <strong>Create one</strong> under Current Week).</li>
          <li>You are on <strong>New Weekly Timesheet</strong> for the current week.</li>
          <li>Optionally use <strong>Copy Previous Week</strong> to bring in rows from last week (see below).</li>
          <li>Add <strong>billable</strong> rows: Site/Client, PO, Task description, System/Deliverable/Activity as needed, and hours per day (Mon–Sun). The <strong>Activity</strong>, <strong>Deliverable</strong>, and <strong>System</strong> dropdowns only show options assigned to your user profile (sites you are assigned to).</li>
          <li>Add or adjust <strong>unbillable</strong> rows (Holiday, Internal, PTO) if applicable.</li>
          <li>Click <strong>Save as Draft</strong> to save and continue later, or <strong>Submit</strong> when the week is complete.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.2 Copy Previous Week</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          On <strong>New Timesheet</strong> or <strong>Edit Timesheet</strong>, if you had a timesheet the <strong>previous week</strong> with entries, a green <strong>Copy Previous Week</strong> button appears next to the week selector.
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Click <strong>Copy Previous Week</strong>.</li>
          <li>Read the modal message (it copies all billable and unbillable entries from the previous week).</li>
          <li>Click <strong>Copy Data</strong>.</li>
          <li>Rows are added to the current timesheet; you can edit or delete any of them and then save or submit.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.3 Editing a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          You can edit your timesheet when it is <strong>Draft</strong> or <strong>Rejected</strong> (after you get a rejection note).
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Go to <strong>My Timesheets</strong>.</li>
          <li>Click the timesheet (or <strong>Edit</strong> if shown).</li>
          <li>You are on the edit page; change rows, hours, or unbillable as needed. The <strong>Edit Billable Entry</strong> popup is wider and can be resized by dragging the bottom-right corner.</li>
          <li><strong>Save as Draft</strong> or <strong>Submit</strong> when done.</li>
        </ol>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          <strong>Admins/Super Admins</strong> can edit any timesheet; others can only edit their own (when draft or rejected).
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.4 Submitting a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>On the new or edit timesheet page, fill in all required rows and hours.</li>
          <li>Click <strong>Submit</strong>.</li>
          <li>The timesheet moves to <strong>Submitted</strong> and goes to the approval chain: <strong>Employee → Supervisor → Manager → Final Approver</strong>. If Supervisor or Manager is set to “None” on your profile, the system uses the next person in the structure.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.5 Viewing a timesheet (detail)</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>Go to <strong>My Timesheets</strong> (or <strong>Pending Approvals</strong> for approvers).</li>
          <li>Click the timesheet or <strong>View</strong> / <strong>View Details</strong>.</li>
          <li>You see the full timesheet: status, week, all rows, unbillable, and (if submitted/approved) approval/signature info.</li>
          <li>From here you can use <strong>Edit</strong> (if allowed), <strong>Export PDF</strong>, or <strong>Recall</strong> (if submitted and your org allows it).</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.6 Deleting a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Draft</strong> timesheets: The owner can delete (e.g. <strong>Delete</strong> on the timesheet view or edit page). <strong>Admins/Super Admins</strong> can delete timesheets in other statuses if the system allows. Deletion is permanent; use with care.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.7 Recall (unsubmit) a timesheet</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          If your timesheet is <strong>Submitted</strong> and your organization allows it, you may see a <strong>Recall</strong> option to bring it back to <strong>Draft</strong> so you can edit and resubmit. Use this only when you need to change something before approval.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">3.8 Export PDF</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          From the timesheet <strong>detail</strong> page, use <strong>Export PDF</strong> (or <strong>Export</strong>) to download a PDF of that timesheet. Available to the timesheet owner and to Admins/Super Admins.
        </p>
      </section>

      <section data-section="approvals" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          4. Approvals (Supervisors, Managers, Admins)
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          If you are a <strong>Supervisor</strong>, <strong>Manager</strong>, <strong>Admin</strong>, or <strong>Super Admin</strong>, you may have timesheets waiting for your approval.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.1 Seeing pending approvals</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>On the <strong>Dashboard</strong>, the <strong>Pending Approvals</strong> card shows how many timesheets are pending.</li>
          <li>Click <strong>Pending Approvals</strong> (or the <strong>Review</strong> link on the dashboard) to open the list.</li>
          <li>You see: employee name, email, week ending, and submitted date.</li>
        </ul>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.2 Approving a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>On the <strong>Pending Approvals</strong> page, find the timesheet.</li>
          <li>Click <strong>Approve</strong> (green button).</li>
          <li>Your approval is recorded; the timesheet may then go to the next approver in the chain (e.g. Supervisor → Final Approver) or become <strong>Approved</strong> if you are the last approver.</li>
        </ol>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
          You can also open <strong>View Details</strong> first to review the timesheet, then approve from the list or from the detail page if that option is shown.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.3 Rejecting a timesheet</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>On the <strong>Pending Approvals</strong> page, click <strong>Reject</strong> (red button) for the timesheet.</li>
          <li>You are taken to the <strong>Reject timesheet</strong> page.</li>
          <li>Enter a <strong>required note</strong> for the employee (e.g. “Please correct Friday hours for Project X”).</li>
          <li>Submit the rejection.</li>
          <li>The timesheet status becomes <strong>Rejected</strong>. The employee sees your note when they open the timesheet and can edit and resubmit.</li>
        </ol>
        <h4 className="text-sm font-semibold mt-3 mb-1">4.4 Clearing a rejection note (Admin/Super Admin only)</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Admins</strong> and <strong>Super Admins</strong> can clear the rejection note on a rejected timesheet (e.g. so the employee can resubmit without seeing the old note). Use the option on the timesheet detail page if available.
        </p>
      </section>

      <section data-section="manage-users" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          5. Manage Users
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Who can open it:</strong> Supervisors, Managers, Admins, Super Admins. <strong>Who appears in the list:</strong> Depends on your role (see Quick Reference by Role).
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.1 Opening Manage Users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">From the Dashboard, click <strong>Manage Users</strong>.</p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.2 Viewing users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          You see a table (or on mobile, cards) with: Name, Email, Role, Sites, Departments, Purchase Orders, Supervisor, Final Approver, and a <strong>View</strong> button. Use <strong>Search</strong> (name/email) and <strong>Role</strong> filter to narrow the list. Click <strong>View</strong> (or the user name) to open that user’s details.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.3 Supervisor: view only</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Supervisors see only <strong>employees</strong> who report to them. You can open a user and see details but <strong>cannot</strong> add users, edit users, send password links, or delete users.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.4 Manager: add and edit users</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          You see <strong>employees and supervisors</strong> who report to you. <strong>Add user:</strong> Click <strong>Add User</strong>, fill in name, email, role (Employee, Supervisor, or Manager), <strong>Supervisor</strong> (one field), Manager, Final Approver, and site/department/PO assignments. <strong>Edit user:</strong> Open the user with <strong>View</strong>, then use <strong>Edit</strong>. There is a single <strong>Supervisor</strong> field. You can <strong>generate a password/invite link</strong> for users who report to you.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">5.5 Admin / Super Admin: full user management</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Admin:</strong> Sees all users except Super Admins. Can add and edit users (any role except Super Admin), delete users (except self), and generate password links for any user. <strong>Super Admin:</strong> Sees all users including Super Admins. Can add, edit, and delete any user (except self) and set any role, including Super Admin.
        </p>
      </section>

      <section data-section="organization" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          6. Organization, Systems, Activities, Deliverables
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          These areas set up the options that appear on timesheets (sites, departments, POs, systems, activities, deliverables). What you see and whether you can change anything depends on your role.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.1 Manage Organization (Sites, Departments, Purchase Orders)</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Organization</strong>. <strong>Supervisors:</strong> View only (sites you are assigned to). <strong>Managers:</strong> Add, edit, delete sites; manage departments and POs for those sites. <strong>Admins / Super Admins:</strong> See and manage all sites, departments, and purchase orders.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.2 Manage Systems</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Systems</strong>. Defines <strong>System</strong> options for timesheet rows. Supervisors: view only. Managers: full add/edit/delete/import for assigned sites. Admins/Super Admins: full access.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.3 Manage Activities</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Activities</strong>. Supervisors: view only. Managers and above: full access for their scope.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.4 Manage Deliverables</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
          <strong>Where:</strong> Dashboard → <strong>Manage Deliverables</strong>. Same role rules as above.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">6.5 Departments and Purchase Orders</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Departments and Purchase Orders may have their own admin pages under the dashboard. Access follows the same role rules as Organization.
        </p>
      </section>

      <section data-section="data-export" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          7. View Timesheet Data & Export
        </h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Available only to <strong>Managers</strong>, <strong>Admins</strong>, and <strong>Super Admins</strong>. Employees and Supervisors do not see these.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">7.1 View Timesheet Data</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          <strong>Where:</strong> Dashboard → <strong>View Timesheet Data</strong>. View and filter all timesheet entries (e.g. by week, user, site, PO). No role-based filtering; managers and admins see the full dataset they have access to.
        </p>
        <h4 className="text-sm font-semibold mt-3 mb-1">7.2 Export Timesheets</h4>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Where:</strong> Dashboard → <strong>Export Timesheets</strong>. Export timesheet data for a chosen week (or range). Format and options depend on what is implemented (e.g. Excel/CSV). Use for payroll, billing, or reporting.
        </p>
      </section>

      <section data-section="quick-reference" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          8. Quick Reference by Role
        </h3>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs border border-gray-300 dark:border-gray-600 border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left font-semibold">Feature</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left">Employee</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left">Supervisor</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left">Manager</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left">Admin</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left">Super Admin</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr><td className="border px-2 py-1">Dashboard</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">New Timesheet</td><td className="border px-2 py-1">✓ (own)</td><td className="border px-2 py-1">✓ (own)</td><td className="border px-2 py-1">✓ (own)</td><td className="border px-2 py-1">✓ (own)</td><td className="border px-2 py-1">✓ (own)</td></tr>
              <tr><td className="border px-2 py-1">My Timesheets</td><td className="border px-2 py-1">Own only</td><td className="border px-2 py-1">Own + reports</td><td className="border px-2 py-1">Own + reports</td><td className="border px-2 py-1">All</td><td className="border px-2 py-1">All</td></tr>
              <tr><td className="border px-2 py-1">Copy Previous Week</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Edit/Delete own (draft)</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Edit any timesheet</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Pending Approvals</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Approve / Reject</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓ (in chain)</td><td className="border px-2 py-1">✓ (in chain)</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Manage Users</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">View only</td><td className="border px-2 py-1">Add/Edit (reports)</td><td className="border px-2 py-1">Full (no Super Admin)</td><td className="border px-2 py-1">Full</td></tr>
              <tr><td className="border px-2 py-1">Delete user</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Password/invite link</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">Reports only</td><td className="border px-2 py-1">Any</td><td className="border px-2 py-1">Any</td></tr>
              <tr><td className="border px-2 py-1">Organization</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">View only</td><td className="border px-2 py-1">Edit (assigned)</td><td className="border px-2 py-1">Full</td><td className="border px-2 py-1">Full</td></tr>
              <tr><td className="border px-2 py-1">Systems / Activities / Deliverables</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">View only</td><td className="border px-2 py-1">Edit (assigned)</td><td className="border px-2 py-1">Full</td><td className="border px-2 py-1">Full</td></tr>
              <tr><td className="border px-2 py-1">View Timesheet Data</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
              <tr><td className="border px-2 py-1">Export Timesheets</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">—</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td><td className="border px-2 py-1">✓</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section data-section="need-help" className="scroll-mt-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
          Need Help?
        </h3>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Login or password:</strong> Contact your manager or an administrator.</li>
          <li><strong>Missing options or access:</strong> Your role or assignments (sites, reports) may need to be updated in <strong>Manage Users</strong> (admin/manager).</li>
          <li><strong>Approval chain:</strong> The structure is Employee → Supervisor → Manager → Final Approver. Each user’s profile has one <strong>Supervisor</strong> field plus <strong>Manager</strong> and <strong>Final Approver</strong>. If a field is “None,” the next person in the structure is used. Set these in <strong>Manage Users</strong>.</li>
          <li><strong>Empty Activity/Deliverable/System dropdowns:</strong> You only see options for sites you are assigned to. Ask an admin or manager to assign you to the right sites (and ensure those sites have systems, activities, and deliverables configured).</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6 italic">
          Last updated to match the current CTG Timesheet Management site (employees through admins).
        </p>
      </section>
    </div>
  )
}
