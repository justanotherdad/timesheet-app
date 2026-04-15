export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default function DeliverablesAdminPage() {
  redirect('/dashboard/admin/timesheet-options')
}
