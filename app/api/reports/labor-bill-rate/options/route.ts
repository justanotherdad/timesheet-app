import { NextResponse } from 'next/server'
import { laborNotFound, requireLaborAccess } from '@/lib/labor-report-access'

export const dynamic = 'force-dynamic'

type Pageable = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string) => {
        range: (
          from: number,
          to: number
        ) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
      }
    }
  }
}

async function pageAll(admin: Pageable, table: string, columns: string) {
  const out: Record<string, unknown>[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await admin.from(table).select(columns).order('id').range(from, from + size - 1)
    if (error) throw new Error(error.message)
    const rows = (data || []) as Record<string, unknown>[]
    out.push(...rows)
    if (rows.length < size) break
  }
  return out
}

export async function GET() {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { admin } = gate

  let sites: Record<string, unknown>[]
  let pos: Record<string, unknown>[]
  let people: Record<string, unknown>[]
  try {
    ;[sites, pos, people] = await Promise.all([
      pageAll(admin, 'sites', 'id, name'),
      pageAll(admin, 'purchase_orders', 'id, po_number, project_name, description, site_id'),
      pageAll(admin, 'user_profiles', 'id, name, role, employee_type'),
    ])
  } catch {
    return laborNotFound()
  }

  people = people.filter((p) => String(p.role) !== 'client')

  const siteName = new Map(sites.map((s) => [String(s.id), String(s.name || 'Unknown')]))
  const clients = sites
    .map((s) => ({ id: String(s.id), name: String(s.name || 'Unknown') }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const poOptions = pos
    .map((p) => ({
      id: String(p.id),
      poNumber: String(p.po_number || '(no PO #)'),
      projectName: String(p.project_name || p.description || '').trim(),
      clientId: String(p.site_id || ''),
      clientName: siteName.get(String(p.site_id || '')) || 'Unknown',
    }))
    .sort((a, b) => {
      const c = a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' })
      if (c !== 0) return c
      return a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true, sensitivity: 'base' })
    })

  const employees = people
    .map((p) => ({
      id: String(p.id),
      name: String(p.name || 'Unknown'),
      employeeType: String(p.employee_type || 'internal') === 'external' ? 'external' : 'internal',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return NextResponse.json({ clients, pos: poOptions, employees })
}

