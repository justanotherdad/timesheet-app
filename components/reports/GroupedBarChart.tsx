'use client'

interface GroupedBarChartProps {
  title: string
  data: { label: string; values: number[] }[]
  seriesLabels: string[]
  seriesColors: string[]
  formatValue?: (n: number) => string
}

/**
 * Dependency-free grouped bar chart (SVG). Renders cleanly on screen and in
 * print/PDF. Two (or more) bars per group with value labels above each bar,
 * a simple y-axis with gridlines, and a legend.
 *
 * The SVG scales to its container width (viewBox + width:100%) so it never
 * runs off a printed page, and the legend swatches are drawn as SVG rects —
 * CSS background colors are dropped by browsers when printing.
 */
export default function GroupedBarChart({
  title,
  data,
  seriesLabels,
  seriesColors,
  formatValue = (n) => n.toLocaleString('en-US'),
}: GroupedBarChartProps) {
  const seriesCount = seriesLabels.length
  const groupCount = Math.max(1, data.length)
  const maxVal = Math.max(1, ...data.flatMap((d) => d.values))

  // "Nice" axis max (round up to a clean step).
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(maxVal)))
    const scaled = maxVal / pow
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
    return step * pow
  })()

  // Angled labels only help when groups get tight; a single-PO chart reads
  // better with a plain horizontal label.
  const rotateLabels = groupCount > 3

  const plotH = 260
  const padTop = 24
  const padBottom = rotateLabels ? 90 : 46
  const padLeft = 64
  // Keep a sensible minimum plot width so a 1-group chart isn't a sliver.
  const minGroupWidth = Math.max(110, 34 * seriesCount + 28)
  const plotW = Math.max(300, groupCount * minGroupWidth)
  const groupWidth = plotW / groupCount
  const width = padLeft + plotW + 16
  const height = padTop + plotH + padBottom
  const gridLines = 5

  const barGap = 10
  const innerPad = 14
  const rawBarW = (groupWidth - innerPad * 2 - barGap * (seriesCount - 1)) / seriesCount
  const barW = Math.max(8, Math.min(58, rawBarW))
  // Center the bar cluster inside its group slot.
  const groupContentW = barW * seriesCount + barGap * (seriesCount - 1)
  const groupOffset = (groupWidth - groupContentW) / 2

  const yFor = (v: number) => padTop + plotH - (v / niceMax) * plotH

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 print:text-black">{title}</h4>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={title}
        style={{ width: '100%', height: 'auto', maxWidth: width }}
      >
        {/* Y gridlines + labels */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (niceMax / gridLines) * i
          const y = yFor(v)
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#6b7280">
                {formatValue(Math.round(v))}
              </text>
            </g>
          )
        })}
        {/* Baseline */}
        <line x1={padLeft} y1={padTop + plotH} x2={padLeft + plotW} y2={padTop + plotH} stroke="#9ca3af" strokeWidth={1} />

        {/* Groups */}
        {data.map((group, gi) => {
          const gx = padLeft + gi * groupWidth
          return (
            <g key={gi}>
              {group.values.map((val, si) => {
                const x = gx + groupOffset + si * (barW + barGap)
                const y = yFor(Math.max(0, val))
                const h = padTop + plotH - y
                return (
                  <g key={si}>
                    <rect x={x} y={y} width={barW} height={Math.max(0, h)} fill={seriesColors[si]} rx={2} />
                    <text
                      x={x + barW / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="#374151"
                    >
                      {formatValue(Math.round(val))}
                    </text>
                  </g>
                )
              })}
              {rotateLabels ? (
                <text
                  x={gx + groupWidth / 2}
                  y={padTop + plotH + 16}
                  textAnchor="end"
                  fontSize={11}
                  fill="#374151"
                  transform={`rotate(-35 ${gx + groupWidth / 2} ${padTop + plotH + 16})`}
                >
                  {group.label}
                </text>
              ) : (
                <text
                  x={gx + groupWidth / 2}
                  y={padTop + plotH + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#374151"
                >
                  {group.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* Legend — SVG swatches so the colors survive PDF export. */}
      <div className="flex flex-wrap gap-4 mt-2">
        {seriesLabels.map((label, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 print:text-black">
            <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
              <rect x={0} y={0} width={12} height={12} rx={2} fill={seriesColors[i]} />
            </svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
