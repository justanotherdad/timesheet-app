/** Parsed metadata for user-added indirect rows (stored in `notes` as JSON). */
export type IndirectCustomMeta = {
  label?: string
  contingencyType?: 'none' | 'fixed' | 'percent'
  contingencyValue?: number
  /**
   * How the converted PO should treat this indirect line:
   *   'activity' — write a project_details row so people can log time against
   *                it from a timesheet (Indirect / Indirect / <category>).
   *   'expense'  — write a po_expenses row (current behavior).
   *
   * Only meaningful for `additional_indirect` and `custom_*` categories. The
   * preset PM / Doc Coord / Proj Controls rows always behave as 'activity'
   * and the preset T&L rows always behave as 'expense', regardless of what's
   * stored here. Resolve via `effectiveIndirectTreatAs` to apply those rules.
   */
  treatAs?: 'activity' | 'expense'
}

/** Stable category-to-treatment table for the preset categories. */
const PRESET_TREAT_AS: Record<string, 'activity' | 'expense'> = {
  project_management: 'activity',
  document_coordinator: 'activity',
  project_controls: 'activity',
  travel_living_project: 'expense',
  travel_living_fat: 'expense',
  additional_indirect: 'expense', // user-pickable but defaults to expense
}

/**
 * Resolve how a given indirect-labor row should be treated when the bid sheet
 * converts to a project budget. Preset categories always win over the notes
 * `treatAs` field; only `additional_indirect` and `custom_*` honor notes.
 */
export function effectiveIndirectTreatAs(
  category: string,
  notes: string | null | undefined
): 'activity' | 'expense' {
  if (category === 'additional_indirect' || category.startsWith('custom_')) {
    const meta = decodeIndirectNotes(notes)
    if (meta.treatAs === 'activity' || meta.treatAs === 'expense') return meta.treatAs
    return 'expense'
  }
  return PRESET_TREAT_AS[category] ?? 'expense'
}

/**
 * Stable label used as the timesheet activity name for indirect rows that are
 * being converted as 'activity'. Preset categories use their human label;
 * custom rows pull their label from the notes JSON (with a sensible fallback).
 */
export function indirectActivityName(
  category: string,
  notes: string | null | undefined
): string {
  switch (category) {
    case 'project_management': return 'Project Management'
    case 'document_coordinator': return 'Document Coordinator'
    case 'project_controls': return 'Project Controls'
    case 'additional_indirect': return 'Additional Indirect Labor'
    default: {
      if (category.startsWith('custom_')) {
        const meta = decodeIndirectNotes(notes)
        const label = meta.label?.trim()
        return label || 'Additional Indirect Labor'
      }
      return category
    }
  }
}

/** Catalog names used when an indirect row converts as a loggable activity. */
export const INDIRECT_SYSTEM_NAME = 'Indirect'
export const INDIRECT_DELIVERABLE_NAME = 'Indirect'

export function decodeIndirectNotes(notes: string | null | undefined): IndirectCustomMeta {
  if (notes == null || String(notes).trim() === '') return {}
  const s = String(notes).trim()
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      const contingencyType = j.contingencyType
      const treatAs = j.treatAs
      return {
        label: typeof j.label === 'string' ? j.label : undefined,
        contingencyType:
          contingencyType === 'fixed' || contingencyType === 'percent' || contingencyType === 'none'
            ? contingencyType
            : 'none',
        contingencyValue: typeof j.contingencyValue === 'number' ? j.contingencyValue : undefined,
        treatAs: treatAs === 'activity' || treatAs === 'expense' ? treatAs : undefined,
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
  const treatAs = meta.treatAs
  if (!label && contingencyType === 'none' && !contingencyValue && !treatAs) return null
  const payload: Record<string, unknown> = {
    label,
    contingencyType,
    contingencyValue: contingencyType === 'none' ? 0 : contingencyValue,
  }
  if (treatAs) payload.treatAs = treatAs
  return JSON.stringify(payload)
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
