export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default function SystemsAdminPage() {
  redirect('/dashboard/admin/timesheet-options')
}
