export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default function ActivitiesAdminPage() {
  redirect('/dashboard/admin/timesheet-options')
}
