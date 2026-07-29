// Shared shapes for the "Generate Report" feature (Budget Status Report).
// The snapshot is frozen at generation time and stored in generated_reports.snapshot.

export interface ReportOverageRow {
  system: string
  deliverable: string
  activity: string
  budgetHours: number
  actualHours: number
  overHours: number
  budgetDollars: number
  actualDollars: number
  overDollars: number
}

/** One employee row in a monthly Billable Activities (hours) table. */
export interface ReportBillableActivitiesRow {
  userId: string
  userName: string
  /** weekEnding YYYY-MM-DD → hours */
  weekHours: Record<string, number>
  rowTotal: number
}

/** Frozen Billable Activities table for one calendar month (matches budget UI). */
export interface ReportBillableActivitiesMonth {
  monthKey: string
  monthLabel: string
  weekEndings: string[]
  rows: ReportBillableActivitiesRow[]
  columnTotals: Record<string, number>
  grandTotal: number
}

/** One employee row in a monthly Billable Cost ($) table. */
export interface ReportBillableCostRow {
  userId: string
  userName: string
  /** weekEnding YYYY-MM-DD → dollars */
  weekCosts: Record<string, number>
  rowTotal: number
}

/** Frozen Billable Cost table for one calendar month (matches budget UI). */
export interface ReportBillableCostMonth {
  monthKey: string
  monthLabel: string
  weekEndings: string[]
  rows: ReportBillableCostRow[]
  columnTotals: Record<string, number>
  grandTotal: number
}

export interface ReportPoSummary {
  poId: string
  poNumber: string
  projectName: string
  clientName: string
  budgetType: 'project' | 'basic'
  /** Blended $/hr used for a basic budget's hour math (null for project budgets). */
  blendedRate: number | null
  // Hours are null when the report excludes hours (or a basic PO had no rate).
  totalBudgetHours: number | null
  totalActualHours: number | null
  remainingHours: number | null
  totalBudgetDollars: number
  totalActualDollars: number
  remainingDollars: number
  // Project budgets only (null for basic).
  overageLineItems: number | null
  onTrackLineItems: number | null
  overages: ReportOverageRow[]
  /** Present when the wizard included Billable Activities for selected months. */
  billableActivitiesByMonth?: ReportBillableActivitiesMonth[]
  /** Present when the wizard included Billable Cost for selected months. */
  billableCostByMonth?: ReportBillableCostMonth[]
}

export interface DollarChartDatum {
  poNumber: string
  originalBudget: number
  budgetRemaining: number
}

export interface HoursChartDatum {
  poNumber: string
  originalHours: number
  remainingHours: number
}

export interface GeneratedReportSnapshot {
  generatedAt: string
  generatedByName: string
  includeHours: boolean
  /** Whether Billable Activities (hours) tables were requested. */
  includeBillableActivities?: boolean
  /** Whether Billable Cost ($) tables were requested. */
  includeBillableCost?: boolean
  /** Months included for billable tables (`YYYY-MM`), empty if neither table included. */
  billableMonths?: string[]
  pos: ReportPoSummary[]
  chartDollars: DollarChartDatum[]
  chartHours: HoursChartDatum[] | null
}

export interface GeneratedReportListItem {
  id: string
  title: string
  createdAt: string
  createdByName: string | null
  expiresAt: string
  poNumbers: string[]
  projectNames: string[]
  clientNames: string[]
  includeHours: boolean
}
