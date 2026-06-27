import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { aggregatePayrollForWeeks } from '@/lib/payroll'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['admin', 'super_admin']

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function fmtHours(h: number): string {
  // Trim trailing zeros but keep up to 3 decimals.
  return String(Math.round((Number(h) || 0) * 1000) / 1000)
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/admin/payroll/export?weeks=YYYY-MM-DD,YYYY-MM-DD
 * (legacy: ?weekEnding=YYYY-MM-DD also accepted)
 *
 * Headerless CSV, one row per employee per earning type per week:
 *   Employee Name, Employee ID, DET, DETCODE, Hours
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const raw = [
    ...(params.get('weeks') || '').split(','),
    ...params.getAll('weekEnding'),
  ]
  const weeks = [...new Set(raw.map((w) => w.trim()).filter((w) => WEEK_RE.test(w)))]
  if (weeks.length === 0) {
    return NextResponse.json({ error: 'At least one week (YYYY-MM-DD) is required' }, { status: 400 })
  }

  const rows = await aggregatePayrollForWeeks(weeks)
  const csv = rows
    .map((r) =>
      [csvCell(r.employeeName), csvCell(r.employeeId), csvCell(r.det), csvCell(r.detcode), csvCell(fmtHours(r.hours))].join(',')
    )
    .join('\r\n')

  const filename =
    weeks.length === 1
      ? `payroll_${weeks[0]}.csv`
      : `payroll_${[...weeks].sort()[0]}_to_${[...weeks].sort().at(-1)}_${weeks.length}weeks.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
