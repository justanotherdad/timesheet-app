/** Parsed metadata for user-added indirect rows (stored in `notes` as JSON). */
export type IndirectCustomMeta = {
  label?: string
  contingencyType?: 'none' | 'fixed' | 'percent'
  contingencyValue?: number
}

export function decodeIndirectNotes(notes: string | null | undefined): IndirectCustomMeta {
  if (notes == null || String(notes).trim() === '') return {}
  const s = String(notes).trim()
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      const contingencyType = j.contingencyType
      return {
        label: typeof j.label === 'string' ? j.label : undefined,
        contingencyType:
          contingencyType === 'fixed' || contingencyType === 'percent' || contingencyType === 'none'
            ? contingencyType
            : 'none',
        contingencyValue: typeof j.contingencyValue === 'number' ? j.contingencyValue : undefined,
      }
    } catch {
      return { label: notes }
    }
  }
  return { label: notes }
}

export function encodeIndirectNotes(meta: IndirectCustomMeta): string | null {
  const label = meta.label?.trim() || ''
  const contingencyType = meta.contingencyType || 'none'
  const contingencyValue = meta.contingencyValue ?? 0
  if (!label && contingencyType === 'none' && !contingencyValue) return null
  return JSON.stringify({
    label,
    contingencyType,
    contingencyValue: contingencyType === 'none' ? 0 : contingencyValue,
  })
}

/** Base hours × rate plus optional contingency (custom rows only). */
export function indirectLineDollarTotal(
  hours: number,
  rate: number,
  category: string,
  notes: string | null | undefined
): number {
  const base = (hours || 0) * (rate || 0)
  if (!category.startsWith('custom_')) return base
  const meta = decodeIndirectNotes(notes)
  if (meta.contingencyType === 'fixed') return base + (meta.contingencyValue || 0)
  if (meta.contingencyType === 'percent') return base * (1 + (meta.contingencyValue || 0) / 100)
  return base
}
