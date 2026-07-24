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
 */
export default function GroupedBarChart({
  title,
  data,
  seriesLabels,
  seriesColors,
  formatValue = (n) => n.toLocaleString('en-US'),
}: GroupedBarChartProps) {
  const seriesCount = seriesLabels.length
  const maxVal = Math.max(1, ...data.flatMap((d) => d.values))

  // "Nice" axis max (round up to a clean step).
  const niceMax = (() => {
    const pow = Math.pow(10, Math.floor(Math.log10(maxVal)))
    const scaled = maxVal / pow
    const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
    return step * pow
  })()

  const plotH = 260
  const padTop = 24
  const padBottom = 90
  const padLeft = 64
  const groupWidth = Math.max(90, 34 * seriesCount + 28)
  const plotW = Math.max(1, data.length) * groupWidth
  const width = padLeft + plotW + 16
  const height = padTop + plotH + padBottom
  const gridLines = 5

  const barGap = 8
  const innerPad = 14
  const barW = (groupWidth - innerPad * 2 - barGap * (seriesCount - 1)) / seriesCount

  const yFor = (v: number) => padTop + plotH - (v / niceMax) * plotH

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 print:text-black">{title}</h4>
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          className="max-w-full"
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
                  const x = gx + innerPad + si * (barW + barGap)
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
              </g>
            )
          })}
        </svg>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2">
        {seriesLabels.map((label, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 print:text-black">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: seriesColors[i] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
