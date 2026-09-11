# Port notes: Project matrix edit-row pick-or-type

Copy this change set into EquippedBiz. Behavior to preserve:

- Edit System / Deliverable / Activity: pick an existing name **or** type a new one.
- Suggestion lists: **every name already used on this PO** (not cascading, not “existing combo only”).
- Save updates **this matrix row only** (find-or-create catalog row, re-point this `project_details` FKs).
- Same catalog name → **reuse** the existing record (case-insensitive). Do not create a second “Execution”.
- Same full combo already a row → keep the **409 duplicate** error.
- Approved timesheet hours on the old combo stay unmatched (Fix Entries / Reassign unchanged).
- **Rename system** box still renames that system for **every** row on the PO.

## Files

### 1. `lib/syncBidSheetToProject.ts`

Add after `ensurePoLink`:

- `namesMatch`, `escapeIlikeExact`, `findProjectScopedByName`
- exported `resolveProjectComboByNames(admin, siteId, poId, names, current?)`
  - If `current` still matches a typed name, keep that ID (so changing only activity does not swap systems that share a name).
  - Else find PO-scoped row by name (any system code), else `findOrCreate*`.
  - Always `ensurePoLink` for the resolved IDs.

Do **not** use `upsertProjectDetailByNames` for edit — that merges into an existing cell instead of updating this row.

### 2. `app/api/budget/[poId]/project-details/route.ts`

PATCH accepts `system_name`, `deliverable_name`, `activity_name` (all three together).

- Reject mixing names with `system_id` / `deliverable_id` / `activity_id`.
- Load the current `project_details` row + joined names.
- Call `resolveProjectComboByNames`, then update **this** row’s FKs.
- Keep existing 23505 → 409 message.
- Keep the ID-based re-point path for other callers.

### 3. `components/budget/ProjectBudgetMatrix.tsx`

- Replace edit cascading `<select>`s (validCombos / unmatched-entries) with pick-or-type inputs (`<input list>` + `<datalist>`) of unique PO names from `data.rows`.
- State: `editComboSystem`, `editComboDeliverable`, `editComboActivity` (strings). Prefill in `openEdit` from the row; no combo fetch on open.
- `handleSaveEdit`: if names changed, send `system_name` / `deliverable_name` / `activity_name`. Do not send combo IDs. Do not call `resolveSystemIdForPick`.
- If Rename system ran **and** deliverable/activity also changed, and the System combo still shows the old name, send the **renamed** system name so a second system is not created.
- Keep Rename system UI; helper text: dropdowns/fields below move **this row**; rename box changes the name everywhere.
- Reassign-manually dialog stays cascading selects over `validCombos`.

## Manual checks

1. Edit Nester / CTP Report / Generation → Activity `Execution / DP Comp` (exists on PO, not on this cell) → row updates; other Execution / DP Comp rows unchanged.
2. Type a brand-new activity on one row → only that row gets it.
3. Point a row at a combo that already exists → 409 duplicate.
4. Rename system still retitles every row using that system.
5. Hours-only save does not touch the combo.
6. Unmatched timesheet banner / Fix Entries / Reassign unchanged.
