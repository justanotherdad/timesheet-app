# Port notes: PTO request and review

Copy this change set into EquippedBiz. CTG migration: `migrations/2026_09_12_pto_requests.sql` — paste into the Supabase SQL editor and Run before using the feature.

## Behavior to preserve

### Who can request

- Internal employees only (`employee_type` blank or `internal`). Clients and externals do not see **Request PTO** on the dashboard or in the hamburger menu.
- Types: Paid Time Off, Vacation, Bereavement, Jury Duty, Comp Time Used, plus **Other** (typed text).
- Hours per day, 0.25–8. Date range inclusive of weekends, max 90 days.
- Employee can **Cancel** while status is pending.
- After approval, hours are still entered on the weekly timesheet PTO row. Do not auto-fill timesheets.

### Who can review

- Named list on Manage Organization → Company Information → **PTO Request Reviewers** (`company_settings` key `pto_request_approver_ids`). Same checkbox pattern as Timesheet Confirmation assignees; separate list.
- Reviewers see **PTO Requests** tile + hamburger item with a pending-count badge (same UX as Timesheet Confirmations).
- First Approve or Deny settles the request for every reviewer and removes it from the shared queue.
- Deny requires a reason; the employee sees it on their request list.

## Files

1. `migrations/2026_09_12_pto_requests.sql` — new `pto_requests` table + RLS select-own.
2. `types/database.ts` — `PtoRequestStatus`, `PtoRequest`.
3. `lib/pto.ts` — helpers, validation, queries.
4. `lib/audit.ts` — `pto.submit` / `cancel` / `approve` / `deny`, entity `pto_request`.
5. `app/api/company-settings/route.ts` — GET/PATCH `pto_request_approver_ids`.
6. `app/api/pto/nav/route.ts`, `app/api/pto/route.ts`, `app/api/pto/queue/route.ts`, `app/api/pto/[id]/cancel|approve|deny/route.ts`.
7. `app/dashboard/pto/page.tsx` + `components/PtoRequestClient.tsx`.
8. `app/dashboard/pto/review/page.tsx` + `components/PtoReviewClient.tsx`.
9. `app/dashboard/page.tsx` — Request PTO tile (internal); PTO Requests tile (named reviewers).
10. `components/Header.tsx` — `/api/pto/nav`; Request PTO; PTO Requests with badge.
11. `components/admin/ConsolidatedManager.tsx` — reviewer checkbox list.
12. `components/GuideModal.tsx` — section 13.
13. `lib/pto-shared.ts` — client-safe constants and date/hour helpers (imported by the request/review UIs).

Do **not** add `/dashboard/pto*` to `lib/client-access.ts`. Clients stay deny-by-default.

## Manual checks

1. External employee: no Request PTO tile or menu link; visiting `/dashboard/pto` redirects to dashboard.
2. Internal employee: submit Vacation 8 hrs/day Sep 21–23; appears under My requests as Pending; Cancel removes it from the admin queue.
3. Manage Organization → Company Information: pick PTO reviewers (can differ from confirmation assignees).
4. Reviewer hamburger: PTO Requests with badge; Approve clears the row for every reviewer; Deny requires a reason that the employee can see.
5. Run the SQL migration in EquippedBiz Supabase before testing.
