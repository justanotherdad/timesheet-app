export type PayKind = 'w2' | '1099'

export type LaborWeek = {
  userId: string
  userName: string
  employeeType: 'internal' | 'external'
  poId: string
  poNumber: string
  projectName: string
  clientName: string
  weekEnding: string
  hours: number
  billRate: number
}

export type PayRateRow = {
  id: string
  userId: string
  classification: PayKind
  amount: number
  effectiveFrom: string
  effectiveTo: string | null
}

export type StatementLine = {
  userId: string
  userName: string
  employeeType: 'internal' | 'external'
  clientName: string
  poNumber: string
  projectName: string
  billRate: number
  /** First and last week-ending in this line. */
  weekFrom: string
  weekTo: string
  hours: number
  loadedCost: number | null
  payKind: PayKind | null
  payAmount: number | null
  revenue: number
  cost: number | null
  profit: number | null
  profitPerHour: number | null
}

export type EmployeeBlock = {
  userId: string
  userName: string
  employeeType: 'internal' | 'external'
  lines: StatementLine[]
  hours: number
  revenue: number
  cost: number | null
  profit: number | null
  /** Distinct loaded-cost captions for the header. */
  payCaptions: string[]
  missingPay: boolean
}

export type StatementModel = {
  employees: EmployeeBlock[]
  hours: number
  revenue: number
  cost: number | null
  profit: number | null
  /** Revenue on lines that have a pay rate. Margin uses this, not total revenue. */
  coveredRevenue: number
  people: number
  peopleWithPay: number
}

export const DEFAULT_W2_OVERHEAD = 0.25

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Percent text such as "25" or "25.5" becomes the fraction stored on the setting. */
export function parseOverheadPercent(raw: string): number | null {
  const text = raw.trim().replace(/%/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  const pct = Number(text)
  if (!Number.isFinite(pct) || pct < 0 || pct > 200) return null
  return Math.round(pct * 100) / 10000
}

export function overheadPercentText(fraction: number): string {
  const pct = Math.round(fraction * 10000) / 100
  return String(pct)
}

export function loadedHourlyCost(kind: PayKind, amount: number, overhead = DEFAULT_W2_OVERHEAD): number {
  return kind === 'w2' ? roundMoney(amount * (1 + overhead)) : roundMoney(amount)
}

export function payCaption(kind: PayKind, amount: number, overhead = DEFAULT_W2_OVERHEAD): string {
  const pay = payMoney(amount)
  if (kind === 'w2') {
    const overheadAmount = money(roundMoney(amount * overhead))
    const loaded = money(loadedHourlyCost(kind, amount, overhead))
    return `W2 ${pay}/hr + ${overheadPercentText(overhead)}% overhead (${overheadAmount}) = ${loaded} loaded cost/hr`
  }
  return `1099 ${pay}/hr, no overhead`
}

export function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/** Pay rates keep up to four decimal places. Totals stay in cents. */
export function payMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

export function roundPay(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function hoursLabel(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function marginLabel(profit: number, revenue: number): string {
  if (revenue === 0) return '—'
  return `${((profit / revenue) * 100).toFixed(1)}%`
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function payRateForWeek(rows: PayRateRow[], userId: string, weekEnding: string): PayRateRow | null {
  const we = weekEnding.slice(0, 10)
  const mine = rows.filter((r) => r.userId === userId)
  const hit = mine.find((r) => {
    const from = r.effectiveFrom.slice(0, 10)
    const to = r.effectiveTo ? r.effectiveTo.slice(0, 10) : ''
    if (from > we) return false
    if (to && to < we) return false
    return true
  })
  return hit || null
}

type Bucket = {
  sample: LaborWeek
  hours: number
  weekFrom: string
  weekTo: string
  loadedCost: number | null
  payKind: PayKind | null
  payAmount: number | null
}

export function buildStatement(
  weeks: LaborWeek[],
  payRates: PayRateRow[],
  overhead = DEFAULT_W2_OVERHEAD
): StatementModel {
  const buckets = new Map<string, Bucket>()

  for (const week of weeks) {
    if (week.hours <= 0) continue
    const pay = payRateForWeek(payRates, week.userId, week.weekEnding)
    const loaded = pay ? loadedHourlyCost(pay.classification, pay.amount, overhead) : null
    const loadedKey = loaded == null ? 'none' : loaded.toFixed(2)
    const key = [week.userId, week.poId, week.billRate.toFixed(4), loadedKey].join('|')
    const prev = buckets.get(key)
    if (!prev) {
      buckets.set(key, {
        sample: week,
        hours: week.hours,
        weekFrom: week.weekEnding,
        weekTo: week.weekEnding,
        loadedCost: loaded,
        payKind: pay?.classification ?? null,
        payAmount: pay?.amount ?? null,
      })
    } else {
      prev.hours += week.hours
      if (week.weekEnding < prev.weekFrom) prev.weekFrom = week.weekEnding
      if (week.weekEnding > prev.weekTo) prev.weekTo = week.weekEnding
    }
  }

  const lines: StatementLine[] = [...buckets.values()].map((b) => {
    const hours = b.hours
    const revenue = roundMoney(hours * b.sample.billRate)
    const cost = b.loadedCost == null ? null : roundMoney(hours * b.loadedCost)
    const profit = cost == null ? null : roundMoney(revenue - cost)
    const profitPerHour = b.loadedCost == null ? null : roundMoney(b.sample.billRate - b.loadedCost)
    return {
      userId: b.sample.userId,
      userName: b.sample.userName,
      employeeType: b.sample.employeeType,
      clientName: b.sample.clientName,
      poNumber: b.sample.poNumber,
      projectName: b.sample.projectName,
      billRate: b.sample.billRate,
      weekFrom: b.weekFrom,
      weekTo: b.weekTo,
      hours,
      loadedCost: b.loadedCost,
      payKind: b.payKind,
      payAmount: b.payAmount,
      revenue,
      cost,
      profit,
      profitPerHour,
    }
  })

  lines.sort((a, b) => {
    const name = a.userName.localeCompare(b.userName, undefined, { sensitivity: 'base' })
    if (name !== 0) return name
    const client = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
    if (client !== 0) return client
    const po = a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true, sensitivity: 'base' })
    if (po !== 0) return po
    return a.weekFrom.localeCompare(b.weekFrom)
  })

  const byUser = new Map<string, StatementLine[]>()
  for (const line of lines) {
    const list = byUser.get(line.userId) || []
    list.push(line)
    byUser.set(line.userId, list)
  }

  const employees: EmployeeBlock[] = [...byUser.values()].map((userLines) => {
    const first = userLines[0]
    const hours = userLines.reduce((s, l) => s + l.hours, 0)
    const revenue = roundMoney(userLines.reduce((s, l) => s + l.revenue, 0))
    const missingPay = userLines.some((l) => l.cost == null)
    const cost = missingPay ? null : roundMoney(userLines.reduce((s, l) => s + (l.cost || 0), 0))
    const profit = cost == null ? null : roundMoney(revenue - cost)
    const captions: string[] = []
    for (const line of userLines) {
      if (line.payKind == null || line.payAmount == null) continue
      const caption = payCaption(line.payKind, line.payAmount, overhead)
      if (!captions.includes(caption)) captions.push(caption)
    }
    return {
      userId: first.userId,
      userName: first.userName,
      employeeType: first.employeeType,
      lines: userLines,
      hours,
      revenue,
      cost,
      profit,
      payCaptions: captions,
      missingPay,
    }
  })

  const hours = employees.reduce((s, e) => s + e.hours, 0)
  const revenue = roundMoney(employees.reduce((s, e) => s + e.revenue, 0))
  const coveredUserIds = new Set(employees.filter((e) => !e.missingPay).map((e) => e.userId))
  const coveredLines = lines.filter((l) => coveredUserIds.has(l.userId))
  const coveredRevenue = roundMoney(coveredLines.reduce((s, l) => s + l.revenue, 0))
  const coveredCost = roundMoney(coveredLines.reduce((s, l) => s + (l.cost || 0), 0))
  const anyCovered = coveredLines.length > 0
  const cost = anyCovered ? coveredCost : null
  const profit = anyCovered ? roundMoney(coveredRevenue - coveredCost) : null
  const peopleWithPay = employees.filter((e) => !e.missingPay).length

  return {
    employees,
    hours,
    revenue,
    cost,
    profit,
    coveredRevenue,
    people: employees.length,
    peopleWithPay,
  }
}

/** True when two inclusive date ranges overlap. A null end is open-ended. */
export function rangesOverlap(
  aFrom: string,
  aTo: string | null,
  bFrom: string,
  bTo: string | null
): boolean {
  const aEnd = aTo || '9999-12-31'
  const bEnd = bTo || '9999-12-31'
  return aFrom.slice(0, 10) <= bEnd && bFrom.slice(0, 10) <= aEnd
}
