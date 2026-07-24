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
