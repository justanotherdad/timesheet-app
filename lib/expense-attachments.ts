/** Shared rules for files on one additional-expense line. */

export const EXPENSE_ATTACHMENT_LIMIT = 10
export const EXPENSE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const EXPENSE_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
] as const

export const EXPENSE_ATTACHMENT_ACCEPT = EXPENSE_ATTACHMENT_EXTENSIONS.join(',')

export function expenseAttachmentExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot).toLowerCase()
}

/** Null when the file can be added. Otherwise a sentence the user can act on. */
export function expenseAttachmentRejection(name: string, size: number, currentCount: number): string | null {
  if (currentCount >= EXPENSE_ATTACHMENT_LIMIT) return 'Remove a file to add another.'
  if (size > EXPENSE_ATTACHMENT_MAX_BYTES) return `${name} is larger than 10 MB.`
  if (!EXPENSE_ATTACHMENT_EXTENSIONS.includes(expenseAttachmentExtension(name) as (typeof EXPENSE_ATTACHMENT_EXTENSIONS)[number])) {
    return 'File type not allowed. Use a PDF, photo, Word, or Excel file.'
  }
  return null
}

export function expenseAttachmentContentType(name: string, reported: string): string {
  const ext = expenseAttachmentExtension(name)
  if (reported && reported !== 'application/octet-stream') return reported
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    default:
      return 'application/octet-stream'
  }
}

/** Adds attachment_count onto each expense. Missing table or query errors leave the count at 0. */
export async function withExpenseAttachmentCounts<T extends { id: string }>(
  client: any,
  poId: string,
  expenses: T[]
): Promise<Array<T & { attachment_count: number }>> {
  if (!expenses.length) return expenses.map((ex) => ({ ...ex, attachment_count: 0 }))
  const { data, error } = await client.from('po_expense_attachments').select('expense_id').eq('po_id', poId).limit(10000)
  if (error || !data) return expenses.map((ex) => ({ ...ex, attachment_count: 0 }))
  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.expense_id] = (counts[row.expense_id] || 0) + 1
  }
  return expenses.map((ex) => ({ ...ex, attachment_count: counts[ex.id] || 0 }))
}
