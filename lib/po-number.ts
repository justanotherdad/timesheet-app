/** Stored PO numbers are labels. Uniqueness is per site, compared trimmed and case-insensitively. */

export const MISSING_PO_NUMBER_MESSAGE =
  'Enter a PO number. If you do not have one yet, use TBD plus an identifier, such as TBD-Jamjoom.'

export const DUPLICATE_PO_NUMBER_MESSAGE =
  'This site already has a purchase order with that number, including archived ones. Add an identifier, such as TBD-Jamjoom.'

export function normalizePoNumber(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Friendly text for a per-site PO number collision or a blank number. Null when the error is something else. */
export function poNumberSaveError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const rec = error as { code?: string; message?: string }
  const message = typeof rec.message === 'string' ? rec.message : ''
  if (rec.code === '23514' || message.includes('purchase_orders_po_number_not_blank')) {
    return MISSING_PO_NUMBER_MESSAGE
  }
  if (
    rec.code === '23505' ||
    message.includes('purchase_orders_po_number_key') ||
    message.includes('purchase_orders_site_po_number')
  ) {
    return DUPLICATE_PO_NUMBER_MESSAGE
  }
  return null
}
