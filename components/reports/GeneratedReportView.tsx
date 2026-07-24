'use client'

import { Printer, ArrowLeft } from 'lucide-react'
import GroupedBarChart from './GroupedBarChart'
import type { GeneratedReportSnapshot, ReportPoSummary } from '@/lib/generated-report'

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const hours = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

function SummaryTable({ po, includeHours }: { po: ReportPoSummary; includeHours: boolean }) {
  const rows: { metric: string; value: string; note: string }[] = []
  if (includeHours) {
    rows.push(
      { metric: 'Total budget hours', value: hours(po.totalBudgetHours), note: po.budgetType === 'project' ? 'Labor matrix total' : 'Budget $ ÷ blended rate' },
      { metric: 'Total actual hours', value: hours(po.totalActualHours), note: po.budgetType === 'project' ? 'All approved entries' : 'Derived (budget − remaining)' },
      { metric: 'Remaining / variance hours', value: hours(po.remainingHours), note: 'Positive = under budget' }
    )
  }
  rows.push(
    { metric: 'Total budget dollars', value: money(po.totalBudgetDollars), note: po.budgetType === 'project' ? 'Estimated budget total' : 'PO amount (incl. COs)' },
    { metric: 'Total actual dollars', value: money(po.totalActualDollars), note: 'Actual spend total' },
    { metric: 'Remaining / variance dollars', value: money(po.remainingDollars), note: 'Positive = under budget' }
  )
  if (po.budgetType === 'project') {
    rows.push(
      { metric: 'Overage line items', value: String(po.overageLineItems ?? 0), note: 'Actual hours > budget hours' },
      { metric: 'On-track line items', value: String(po.onTrackLineItems ?? 0), note: 'Actual hours ≤ budget hours' }
    )
  }
  return (
    <table className="w-full text-sm border border-gray-300 dark:border-gray-600">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-700">
          <th className="text-left px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 print:text-black">Metric</th>
          <th className="text-left px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 print:text-black">Value</th>
          <th className="text-left px-3 py-2 font-semibold text-gray-900 dark:text-gray-100 print:text-black">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.metric} className="border-t border-gray-200 dark:border-gray-700">
            <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{r.metric}</td>
            <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100 print:text-black tabular-nums">{r.value}</td>
            <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 print:text-black">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function OveragesTable({ po }: { po: ReportPoSummary }) {
  if (po.budgetType !== 'project' || po.overages.length === 0) return null
  return (
    <div className="mt-4">
      <div className="bg-red-700 text-white text-sm font-bold uppercase tracking-wide px-3 py-2 rounded-t">
        Overages — actual hours exceed budget
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-300 dark:border-gray-600">
          <thead>
            <tr className="bg-red-800 text-white">
              <th className="text-left px-3 py-2">System</th>
              <th className="text-left px-3 py-2">Deliverable</th>
              <th className="text-left px-3 py-2">Activity</th>
              <th className="text-right px-3 py-2">Budget h</th>
              <th className="text-right px-3 py-2">Actual h</th>
              <th className="text-right px-3 py-2">Over h</th>
              <th className="text-right px-3 py-2">Budget $</th>
              <th className="text-right px-3 py-2">Actual $</th>
              <th className="text-right px-3 py-2">Over $</th>
            </tr>
          </thead>
          <tbody>
            {po.overages.map((o, i) => (
              <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{o.system}</td>
                <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{o.deliverable}</td>
                <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 print:text-black">{o.activity}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100 print:text-black">{hours(o.budgetHours)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100 print:text-black">{hours(o.actualHours)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 print:text-black">{hours(o.overHours)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100 print:text-black">{money(o.budgetDollars)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-900 dark:text-gray-100 print:text-black">{money(o.actualDollars)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 print:text-black">{money(o.overDollars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface GeneratedReportViewProps {
  title: string
  snapshot: GeneratedReportSnapshot
  onBack?: () => void
}

export default function GeneratedReportView({ title, snapshot, onBack }: GeneratedReportViewProps) {
  const dollarData = snapshot.chartDollars.map((c) => ({
    label: `PO ${c.poNumber}`,
    values: [c.budgetRemaining, c.originalBudget],
  }))
  const hoursData = (snapshot.chartHours || []).map((c) => ({
    label: `PO ${c.poNumber}`,
    values: [c.remainingHours, c.originalHours],
  }))

  return (
    <div className="report-print-container bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700"
        >
          <Printer className="h-5 w-5" /> Print / Export to PDF
        </button>
      </div>

      <div className="p-4 space-y-8">
        <div className="print:block hidden">
          <h1 className="text-xl font-bold text-black">{title}</h1>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-black">
          Generated {new Date(snapshot.generatedAt).toLocaleString('en-US')} by {snapshot.generatedByName}. Figures are frozen as of generation time.
        </p>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-8">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <GroupedBarChart
              title="All POs — Budget Overview ($)"
              data={dollarData}
              seriesLabels={['Budget Remaining', 'Original Budget']}
              seriesColors={['#4a90e2', '#f5b800']}
              formatValue={(n) => n.toLocaleString('en-US')}
            />
          </div>
          {snapshot.includeHours && hoursData.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <GroupedBarChart
                title="All POs — Hours Overview"
                data={hoursData}
                seriesLabels={['Remaining Hours', 'Original Hours']}
                seriesColors={['#22a06b', '#f5b800']}
                formatValue={(n) => n.toLocaleString('en-US')}
              />
            </div>
          )}
        </div>

        {/* Per-PO sections */}
        {snapshot.pos.map((po) => (
          <div key={po.poId} className="space-y-3 break-inside-avoid">
            <div className="border-b border-gray-200 dark:border-gray-700 pb-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 print:text-black">
                {po.poNumber}
                {po.projectName ? ` — ${po.projectName}` : ''}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 print:text-black">
                {po.clientName} · {po.budgetType === 'project' ? 'Project budget' : 'Basic budget'}
                {po.budgetType === 'basic' && po.blendedRate ? ` · blended rate ${money(po.blendedRate)}/hr` : ''}
              </p>
            </div>
            <SummaryTable po={po} includeHours={snapshot.includeHours} />
            <OveragesTable po={po} />
          </div>
        ))}
      </div>
    </div>
  )
}
