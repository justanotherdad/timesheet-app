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
    <table className="gr-summary-table w-full text-sm border border-gray-300 dark:border-gray-600">
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
      <div className="gr-overage-banner bg-red-700 text-white text-sm font-bold uppercase tracking-wide px-3 py-2 rounded-t">
        Overages — actual hours exceed budget
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="gr-overage-table w-full text-sm border border-gray-300 dark:border-gray-600">
          <thead className="gr-overage-head">
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
  const generatedLabel = `Generated ${new Date(snapshot.generatedAt).toLocaleString('en-US')} by ${snapshot.generatedByName}. Figures are frozen as of generation time.`

  /**
   * Browsers name the "Save as PDF" file after document.title, so swap in the
   * report name for the duration of the print. A temporary @page rule forces
   * landscape (the overages table has 9 columns and is clipped in portrait).
   */
  const handlePrint = () => {
    const previousTitle = document.title
    const safeTitle = (title || 'Report').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Report'
    document.title = safeTitle

    const style = document.createElement('style')
    style.setAttribute('data-generated-report-print', '')
    style.textContent = '@page { size: letter landscape; margin: 0.45in; }'
    document.head.appendChild(style)

    let restored = false
    const cleanup = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      style.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
    // Safety net in case afterprint never fires.
    window.setTimeout(cleanup, 60000)
  }

  return (
    <div className="generated-report report-print-container bg-white dark:bg-gray-800 rounded-lg shadow">
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
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700"
        >
          <Printer className="h-5 w-5" /> Print / Export to PDF
        </button>
      </div>

      <div className="p-4 space-y-8">
        {/* Print-only report header (CTG logo top-right), first page only. */}
        <div className="hidden print:block gr-print-header">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #111827',
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '16pt', fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: '9pt' }}>{generatedLabel}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ctg-logo.png" alt="CTG" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 print:hidden">{generatedLabel}</p>

        {/* One section per PO: summary + overages first, then that PO's charts. */}
        {snapshot.pos.map((po) => {
          const dollarData = [
            {
              label: `PO ${po.poNumber}`,
              values: [po.remainingDollars, po.totalBudgetDollars],
            },
          ]
          const showHoursChart =
            snapshot.includeHours && po.remainingHours != null && po.totalBudgetHours != null
          const hoursData = showHoursChart
            ? [
                {
                  label: `PO ${po.poNumber}`,
                  values: [po.remainingHours as number, po.totalBudgetHours as number],
                },
              ]
            : []

          return (
            <section key={po.poId} className="gr-po-section space-y-3">
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

              {/* Both charts for this PO stay together on one page. */}
              <div className="gr-charts grid grid-cols-1 lg:grid-cols-2 print:grid-cols-2 gap-6 pt-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 print:border-gray-400">
                  <GroupedBarChart
                    title={`PO ${po.poNumber} — Budget Overview ($)`}
                    data={dollarData}
                    seriesLabels={['Budget Remaining', 'Original Budget']}
                    seriesColors={['#4a90e2', '#f5b800']}
                    formatValue={(n) => n.toLocaleString('en-US')}
                  />
                </div>
                {showHoursChart && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 print:border-gray-400">
                    <GroupedBarChart
                      title={`PO ${po.poNumber} — Hours Overview`}
                      data={hoursData}
                      seriesLabels={['Remaining Hours', 'Original Hours']}
                      seriesColors={['#22a06b', '#f5b800']}
                      formatValue={(n) => n.toLocaleString('en-US')}
                    />
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
