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

/**
 * GET /api/admin/payroll/export?weekEnding=YYYY-MM-DD
 *
 * Headerless CSV, one row per employee per earning type:
 *   Employee Name, Employee ID, DET, DETCODE, Hours
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const weekEnding = new URL(req.url).searchParams.get('weekEnding') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
    return NextResponse.json({ error: 'weekEnding (YYYY-MM-DD) is required' }, { status: 400 })
  }

  const rows = await aggregatePayrollForWeek(weekEnding)
  const csv = rows
    .map((r) =>
      [csvCell(r.employeeName), csvCell(r.employeeId), csvCell(r.det), csvCell(r.detcode), csvCell(fmtHours(r.hours))].join(',')
    )
    .join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll_${weekEnding}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
