export type UserRole = 'employee' | 'supervisor' | 'manager' | 'admin' | 'super_admin'

export type EmployeeType = 'internal' | 'external'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  employee_type?: EmployeeType
  active?: boolean
  reports_to_id?: string
  supervisor_id?: string
  manager_id?: string
  final_approver_id?: string
  created_at: string
  updated_at: string
}

// Weekly timesheet (one per week per user)
export interface WeeklyTimesheet {
  id: string
  user_id: string
  week_ending: string // ISO date string (Sunday)
  week_starting: string // ISO date string (Monday)
  /** Incremented each time status becomes approved (confirmations tie to this). */
  approval_confirmation_sequence?: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  submitted_at?: string
  approved_by_id?: string
  approved_at?: string
  rejected_by_id?: string
  rejected_at?: string
  rejection_reason?: string
  employee_signed_at?: string
  created_at: string
  updated_at: string
}

// Billable time entry (multiple per timesheet)
export interface TimesheetEntry {
  id: string
  timesheet_id: string
  client_project_id?: string // References sites table
  po_id?: string // References purchase_orders table
  task_description: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
  total_hours: number // Calculated field
  created_at: string
  updated_at: string
}

// Unbillable time entry
export interface TimesheetUnbillable {
  id: string
  timesheet_id: string
  description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
  /** Free-text detail next to the type (Holiday / Internal / PTO) */
  notes?: string | null
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
  total_hours: number // Calculated field
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  name: string
  code?: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  description?: string
  manager_id?: string // PO assigned to manager
  created_at: string
  updated_at: string
}

export interface System {
  id: string
  name: string
  code?: string
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  name: string
  code?: string
  created_at: string
  updated_at: string
}

export interface Deliverable {
  id: string
  name: string
  code?: string
  created_at: string
  updated_at: string
}

export interface TimesheetSignature {
  id: string
  timesheet_id: string
  signer_id: string
  signer_role: 'supervisor' | 'manager' | 'final_approver'
  signer_name?: string // Snapshot of signer name at approval time (doesn't change if profile is updated)
  signed_at: string
  signature_data?: string // For storing signature image/data
}
