'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from './SearchableSelect'
import SystemInput from './SystemInput'
import DeleteTimesheetButton from './DeleteTimesheetButton'
import { getWeekDates, formatDate, formatDateShort, formatDateForInput, formatHours, formatWeekEnding, getWeekEndingSundayOptions, normalizeTimesheetHours } from '@/lib/utils'
import { billRateAppliesToWeekEnding } from '@/lib/po-bill-rate-utils'
import { format } from 'date-fns'
import { GripVertical, Plus, Trash2, X } from 'lucide-react'

interface WeeklyTimesheetFormProps {
  sites: Array<{ id: string; name: string; code?: string }>
  purchaseOrders: Array<{ id: string; po_number: string; description?: string; site_id?: string; department_id?: string }>
  systems?: Array<{ id: string; name: string; code?: string; site_id?: string; project_po_id?: string | null }>
  deliverables?: Array<{ id: string; name: string; code?: string; site_id?: string; project_po_id?: string | null }>
  activities?: Array<{ id: string; name: string; code?: string; site_id?: string; project_po_id?: string | null }>
  systemPOIds?: Record<string, string[]>
  systemDepartmentIds?: Record<string, string[]>
  deliverablePOIds?: Record<string, string[]>
  deliverableDepartmentIds?: Record<string, string[]>
  activityPOIds?: Record<string, string[]>
  /**
   * For each project-budget PO, the (system, deliverable, activity) triplets
   * that exist in project_details. That list is the exclusive timesheet
   * allowlist for the PO — Manage Timesheet Options department/PO assignments
   * do not hide matrix cells. POs absent from the map (Basic Budgets) keep
   * the looser dept/PO filtering.
   */
  projectBudgetCombosByPo?: Record<
    string,
    Array<{ systemId: string; deliverableId: string; activityId: string }>
  >
  /**
   * Dropdown options for the unbillable "Description" field, keyed by row type.
   * Populated from the org-wide payroll earning types (those flagged
   * dropdown = 'Y'). Employees can pick one or type their own value.
   */
  unbillableDescriptionOptions?: Partial<Record<'HOLIDAY' | 'INTERNAL' | 'PTO', string[]>>
  /**
   * Employee bill-rate windows. When present, PO/client dropdowns only include
   * POs whose rate covers the selected week ending. Empty for admin editors
   * (they see all active POs).
   */
  billRateWindows?: Array<{
    po_id: string
    effective_from_date?: string | null
    effective_to_date?: string | null
  }>
  defaultWeekEnding: string
  userId: string
  timesheetId?: string
  timesheetStatus?: string
  rejectionReason?: string
  timesheetNotes?: string
  /**
   * True when the current viewer is an admin/super_admin editing the
   * timesheet. Admins can edit any timesheet at any status; when they save
   * edits to an already-approved (or submitted) timesheet, the status is
   * preserved in place so it stays in the budget/payroll views.
   */
  isAdminEditor?: boolean
  /** Shown when an admin is creating/editing on behalf of another employee. */
  employeeName?: string
  previousWeekData?: {
    entries?: Array<{
      client_project_id?: string
      po_id?: string
      task_description: string
      system_id?: string
      system_name?: string
      deliverable_id?: string
      activity_id?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
    unbillable?: Array<{
      description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
      notes?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
  }
  initialData?: {
    entries?: Array<{
      id?: string
      client_project_id?: string
      po_id?: string
      task_description: string
      system_id?: string
      system_name?: string
      deliverable_id?: string
      activity_id?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
    unbillable?: Array<{
      id?: string
      description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
      notes?: string
      mon_hours: number
      tue_hours: number
      wed_hours: number
      thu_hours: number
      fri_hours: number
      sat_hours: number
      sun_hours: number
    }>
  }
}

interface BillableEntry {
  id?: string
  client_project_id?: string
  po_id?: string
  task_description: string
  system_id?: string
  system_name?: string // Custom system name (not saved to DB, stored in entry)
  deliverable_id?: string
  activity_id?: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
}

interface UnbillableEntry {
  id?: string
  description: 'HOLIDAY' | 'INTERNAL' | 'PTO'
  /** Free-text detail shown to the right of the type label */
  notes?: string
  mon_hours: number
  tue_hours: number
  wed_hours: number
  thu_hours: number
  fri_hours: number
  sat_hours: number
  sun_hours: number
}

export default function WeeklyTimesheetForm({
  sites,
  purchaseOrders,
  systems = [],
  deliverables = [],
  activities = [],
  systemPOIds = {},
  systemDepartmentIds = {},
  deliverablePOIds = {},
  deliverableDepartmentIds = {},
  activityPOIds = {},
  projectBudgetCombosByPo = {},
  unbillableDescriptionOptions = {},
  billRateWindows = [],
  defaultWeekEnding,
  userId,
  timesheetId,
  timesheetStatus = 'draft',
  rejectionReason,
  timesheetNotes: initialTimesheetNotes = '',
  isAdminEditor = false,
  employeeName,
  initialData,
  previousWeekData,
}: WeeklyTimesheetFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [weekEnding, setWeekEnding] = useState<string>(defaultWeekEnding)
  const [currentStatus, setCurrentStatus] = useState<string>(timesheetStatus)
  // Remember a timesheet this form instance created (draft save on the /new page)
  // so a subsequent Save/Submit UPDATEs that same row instead of INSERTing a
  // second one. Without this, "save draft then submit" produced two rows
  // (a draft and a submitted duplicate) for the same week.
  const [createdTimesheetId, setCreatedTimesheetId] = useState<string | null>(null)
  // Ref mirror of the id above. State is subject to stale-closure/timing races:
  // if the user clicks "Save Timesheet" then "Submit for Approval" quickly on the
  // /new page (before the draft-save navigation/re-render settles), the submit
  // handler could still read the old null state and INSERT a second row. The ref
  // updates synchronously so the follow-up save always UPDATEs the same row.
  const createdTimesheetIdRef = useRef<string | null>(null)
  // Hard guard against overlapping saves (double-click / rapid Save+Submit).
  const savingRef = useRef(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [showUnbillableTypeMenu, setShowUnbillableTypeMenu] = useState(false)
  // Week ending: create, draft, rejected — or any status when an admin is editing.
  const canChangeWeekEnding =
    isAdminEditor ||
    !timesheetId ||
    currentStatus === 'draft' ||
    currentStatus === 'rejected'

  const weekEndingOptions = useMemo(() => {
    const opts = getWeekEndingSundayOptions()
    if (weekEnding && !opts.includes(weekEnding)) {
      return [...opts, weekEnding].sort((a, b) => a.localeCompare(b))
    }
    return opts
  }, [weekEnding])

  const weekDates = getWeekDates(weekEnding)
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

  const [billableEntries, setBillableEntries] = useState<BillableEntry[]>(
    initialData?.entries || []
  )

  const [timesheetNotes, setTimesheetNotes] = useState<string>(initialTimesheetNotes)

  const [unbillableEntries, setUnbillableEntries] = useState<UnbillableEntry[]>(
    initialData?.unbillable || [
      { description: 'HOLIDAY', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'INTERNAL', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
      { description: 'PTO', notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
    ]
  )

  const restrictPosToBillRates = billRateWindows.length > 0
  const poAppliesToSelectedWeek = (poId: string) =>
    billRateWindows.some((w) => w.po_id === poId && billRateAppliesToWeekEnding(w, weekEnding))
  const availablePurchaseOrders = useMemo(() => {
    if (!restrictPosToBillRates) return purchaseOrders
    const kept = new Set(billableEntries.map((e) => e.po_id).filter(Boolean))
    return purchaseOrders.filter(
      (po) =>
        billRateWindows.some((w) => w.po_id === po.id && billRateAppliesToWeekEnding(w, weekEnding)) ||
        kept.has(po.id)
    )
  }, [restrictPosToBillRates, purchaseOrders, billRateWindows, weekEnding, billableEntries])
  const availableSites = useMemo(() => {
    if (!restrictPosToBillRates) return sites
    const siteIds = new Set(
      availablePurchaseOrders.map((po) => po.site_id).filter(Boolean) as string[]
    )
    for (const entry of billableEntries) {
      if (entry.client_project_id) siteIds.add(entry.client_project_id)
    }
    return sites.filter((s) => siteIds.has(s.id))
  }, [restrictPosToBillRates, sites, availablePurchaseOrders, billableEntries])

  const calculateTotal = (entry: BillableEntry | UnbillableEntry): number => {
    return entry.mon_hours + entry.tue_hours + entry.wed_hours + entry.thu_hours + 
           entry.fri_hours + entry.sat_hours + entry.sun_hours
  }

  const getBillableSubtotal = (day: typeof days[number]): number => {
    return billableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
  }

  const getUnbillableSubtotal = (day: typeof days[number]): number => {
    return unbillableEntries.reduce((sum, e) => sum + e[`${day}_hours`], 0)
  }

  const getGrandTotal = (): number => {
    const billableTotal = billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0)
    const unbillableTotal = unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0)
    return billableTotal + unbillableTotal
  }

  const getPOName = (poId?: string): string => {
    if (!poId) return ''
    const po = purchaseOrders.find(p => p.id === poId)
    return po ? `${po.po_number}${po.description ? ` - ${po.description}` : ''}` : ''
  }

  const updateBillable = (index: number, next: BillableEntry) => {
    setBillableEntries((prev) => prev.map((row, i) => (i === index ? next : row)))
  }

  const handleAddEntry = () => {
    const newEntry: BillableEntry = {
      task_description: '',
      system_name: undefined,
      mon_hours: 0,
      tue_hours: 0,
      wed_hours: 0,
      thu_hours: 0,
      fri_hours: 0,
      sat_hours: 0,
      sun_hours: 0,
    }
    setBillableEntries((prev) => [...prev, newEntry])
  }

  const handleRemoveEntry = (index: number) => {
    if (window.confirm('Delete this row?')) {
      setBillableEntries(billableEntries.filter((_, i) => i !== index))
    }
  }

  // Drag the grip to reorder. Order is persisted via sort_order on save.
  const billableRowRefs = useRef<Array<HTMLTableRowElement | null>>([])
  const dragFromRef = useRef<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const indexAtPointer = (clientY: number) => {
    const count = billableEntries.length
    let over = Math.max(0, count - 1)
    for (let i = 0; i < count; i++) {
      const el = billableRowRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
      over = i
    }
    return over
  }

  const reorderBillable = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return
    setBillableEntries((prev) => {
      if (from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const onGripPointerDown = (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragFromRef.current = index
    setDraggingIndex(index)
    setDragOverIndex(index)
  }

  const onGripPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragFromRef.current === null) return
    setDragOverIndex(indexAtPointer(event.clientY))
  }

  const onGripPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = dragFromRef.current
    if (from === null) return
    const over = indexAtPointer(event.clientY)
    dragFromRef.current = null
    setDraggingIndex(null)
    setDragOverIndex(null)
    reorderBillable(from, over)
  }

  const saveTimesheet = async (shouldSubmit: boolean = false) => {
    // Ignore a second save that lands while the first is still running (e.g. a
    // fast Save-then-Submit). Without this the two calls can race and each
    // INSERT its own row for the same week.
    if (savingRef.current) return
    savingRef.current = true
    setError(null)
    setLoading(true)

    try {
      // Prefer the prop id (edit page), then any row this form instance already
      // created (so a save-then-submit on the /new page updates in place). The
      // ref is authoritative because it is set synchronously on create.
      let currentTimesheetId = timesheetId || createdTimesheetIdRef.current || createdTimesheetId
      const newStatus = shouldSubmit ? 'submitted' : 'draft'

      // Admin creating or editing any owner's sheet: service-role API so RLS
      // does not block weekly_timesheets / entries writes on other users.
      if (isAdminEditor) {
        const payload = {
          week_ending: weekEnding,
          week_starting: formatDateForInput(weekDates.start),
          notes: timesheetNotes.trim() || null,
          billable_entries: billableEntries,
          unbillable_entries: unbillableEntries,
          submit: shouldSubmit,
        }
        const res = currentTimesheetId
          ? await fetch(`/api/timesheets/${currentTimesheetId}/admin-save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch('/api/timesheets/admin-create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...payload, user_id: userId }),
            })
        const apiPayload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(apiPayload.error || 'Failed to save timesheet')
        }
        const savedId = (apiPayload.id as string) || currentTimesheetId
        if (!currentTimesheetId && savedId) {
          createdTimesheetIdRef.current = savedId
          setCreatedTimesheetId(savedId)
          setCurrentStatus(newStatus)
        }
        if (shouldSubmit) {
          router.refresh()
          router.push('/dashboard/timesheets')
        } else {
          router.refresh()
          const preservedAdminEdit =
            currentStatus === 'approved' || currentStatus === 'submitted'
          router.push(
            preservedAdminEdit
              ? `/dashboard/timesheets/${savedId}`
              : `/dashboard/timesheets/${savedId}/edit`
          )
        }
        return
      }

      if (currentTimesheetId) {
        // Update existing timesheet
        const updateData: any = {
          week_ending: weekEnding,
          week_starting: formatDateForInput(weekDates.start),
          notes: timesheetNotes.trim() || null,
          updated_at: new Date().toISOString(),
        }

        if (shouldSubmit && currentStatus === 'draft') {
          updateData.status = 'submitted'
          updateData.submitted_at = new Date().toISOString()
          updateData.employee_signed_at = new Date().toISOString()
        } else if (shouldSubmit && currentStatus === 'rejected') {
          // Resubmitting after rejection: clear approval signatures so workflow restarts
          await supabase.from('timesheet_signatures').delete().eq('timesheet_id', currentTimesheetId)
          updateData.status = 'submitted'
          updateData.submitted_at = new Date().toISOString()
          updateData.employee_signed_at = new Date().toISOString()
        } else if (!shouldSubmit) {
          // Admins editing an already-approved/submitted timesheet save in
          // place without demoting it to draft (so it stays in the budget and
          // payroll views). Everyone else's "Save" lands as a draft.
          const preserveStatus =
            isAdminEditor && (currentStatus === 'approved' || currentStatus === 'submitted')
          if (!preserveStatus) {
            updateData.status = 'draft'
          }
        }

        const { error: updateError } = await supabase
          .from('weekly_timesheets')
          .update(updateData)
          .eq('id', currentTimesheetId)

        if (updateError) throw updateError

        // Delete existing entries
        await supabase.from('timesheet_entries').delete().eq('timesheet_id', currentTimesheetId)
        await supabase.from('timesheet_unbillable').delete().eq('timesheet_id', currentTimesheetId)
      } else {
        // Always create a new timesheet (allow multiple per week per user)
        const insertData: any = {
          user_id: userId,
          week_ending: weekEnding,
          week_starting: formatDateForInput(weekDates.start),
          status: newStatus,
          notes: timesheetNotes.trim() || null,
        }

        if (shouldSubmit) {
          insertData.submitted_at = new Date().toISOString()
          insertData.employee_signed_at = new Date().toISOString()
        }

        const { data: newTimesheet, error: createError } = await supabase
          .from('weekly_timesheets')
          .insert(insertData)
          .select()
          .single()

        if (createError) {
          throw createError
        }
        if (!newTimesheet) {
          throw new Error('Failed to create timesheet')
        }
        currentTimesheetId = newTimesheet.id
        // Remember it so any follow-up Save/Submit from this same form instance
        // updates this row rather than inserting another one. The ref is set
        // first so an immediate follow-up save sees it without waiting for the
        // state update / re-render.
        createdTimesheetIdRef.current = newTimesheet.id
        setCreatedTimesheetId(newTimesheet.id)
        setCurrentStatus(newStatus)
      }

      // Insert billable entries
      const entriesToInsert = billableEntries
        .filter(e => e.task_description.trim() || calculateTotal(e) > 0)
        .map((e, idx) => ({
          timesheet_id: currentTimesheetId!,
          sort_order: idx,
          client_project_id: e.client_project_id || null,
          po_id: e.po_id || null,
          task_description: e.task_description,
          system_id: e.system_id || null, // Only set if from dropdown, null if custom
          system_name: e.system_name || null, // Custom system name (not in systems table)
          deliverable_id: e.deliverable_id || null,
          activity_id: e.activity_id || null,
          mon_hours: normalizeTimesheetHours(Number(e.mon_hours) || 0),
          tue_hours: normalizeTimesheetHours(Number(e.tue_hours) || 0),
          wed_hours: normalizeTimesheetHours(Number(e.wed_hours) || 0),
          thu_hours: normalizeTimesheetHours(Number(e.thu_hours) || 0),
          fri_hours: normalizeTimesheetHours(Number(e.fri_hours) || 0),
          sat_hours: normalizeTimesheetHours(Number(e.sat_hours) || 0),
          sun_hours: normalizeTimesheetHours(Number(e.sun_hours) || 0),
        }))

      if (entriesToInsert.length > 0) {
        const { error: entriesError } = await supabase
          .from('timesheet_entries')
          .insert(entriesToInsert)

        if (entriesError) throw entriesError
      }

      // Insert/update unbillable entries
      const unbillableToInsert = unbillableEntries.map(e => ({
        timesheet_id: currentTimesheetId!,
        description: e.description,
        notes: (e.notes && e.notes.trim()) ? e.notes.trim() : null,
        mon_hours: normalizeTimesheetHours(Number(e.mon_hours) || 0),
        tue_hours: normalizeTimesheetHours(Number(e.tue_hours) || 0),
        wed_hours: normalizeTimesheetHours(Number(e.wed_hours) || 0),
        thu_hours: normalizeTimesheetHours(Number(e.thu_hours) || 0),
        fri_hours: normalizeTimesheetHours(Number(e.fri_hours) || 0),
        sat_hours: normalizeTimesheetHours(Number(e.sat_hours) || 0),
        sun_hours: normalizeTimesheetHours(Number(e.sun_hours) || 0),
      }))

      const { error: unbillableError } = await supabase
        .from('timesheet_unbillable')
        .insert(unbillableToInsert)

      if (unbillableError) throw unbillableError

      // After Submit for Approval: check if final approver (no one above) → auto-approve, then go to list
      if (shouldSubmit) {
        await fetch(`/api/timesheets/${currentTimesheetId}/check-auto-approve`, { method: 'POST' })
        router.refresh()
        router.push('/dashboard/timesheets')
      } else {
        router.refresh()
        const preservedAdminEdit =
          isAdminEditor && (currentStatus === 'approved' || currentStatus === 'submitted')
        router.push(
          preservedAdminEdit
            ? `/dashboard/timesheets/${currentTimesheetId}`
            : `/dashboard/timesheets/${currentTimesheetId}/edit`
        )
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
      savingRef.current = false
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveTimesheet(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const incompleteRows = billableEntries
      .map((entry, index) => ({ entry, rowNumber: index + 1 }))
      .filter(({ entry }) => calculateTotal(entry) > 0)
      .filter(({ entry }) => !entry.client_project_id || !entry.po_id)

    if (incompleteRows.length > 0) {
      const rowList = incompleteRows
        .map(({ rowNumber, entry }) => {
          const missing: string[] = []
          if (!entry.client_project_id) missing.push('Client')
          if (!entry.po_id) missing.push('PO')
          return `Row ${rowNumber} (missing ${missing.join(' and ')})`
        })
        .join('; ')
      setError(`Cannot submit: billable rows with hours must have Client and PO filled in. ${rowList}`)
      return
    }

    if (restrictPosToBillRates) {
      const expiredRows = billableEntries
        .map((entry, index) => ({ entry, rowNumber: index + 1 }))
        .filter(({ entry }) => calculateTotal(entry) > 0 && entry.po_id && !poAppliesToSelectedWeek(entry.po_id))
      if (expiredRows.length > 0) {
        const rowList = expiredRows
          .map(({ rowNumber, entry }) => `Row ${rowNumber} (${getPOName(entry.po_id) || 'PO'})`)
          .join('; ')
        setError(
          `Cannot submit: those POs are not available for week ending ${formatWeekEnding(weekEnding)}. ${rowList}`
        )
        return
      }
    }

    // Block regular employees from submitting a second timesheet for a week they
    // already have one for. Admin/manager editors are exempt so they can still
    // make corrections. The timesheet currently being edited/created is excluded.
    if (!isAdminEditor) {
      const currentId = timesheetId || createdTimesheetIdRef.current
      let dupQuery = supabase
        .from('weekly_timesheets')
        .select('id, status')
        .eq('user_id', userId)
        .eq('week_ending', weekEnding)
      if (currentId) dupQuery = dupQuery.neq('id', currentId)
      const { data: existing, error: dupError } = await dupQuery
      if (dupError) {
        setError('Could not verify existing timesheets. Please try again.')
        return
      }
      if (existing && existing.length > 0) {
        setError(
          `You already have a timesheet for week ending ${formatDate(weekDates.end)}. Please edit or delete the existing one instead of submitting another copy.`
        )
        return
      }
    }

    await saveTimesheet(true)
  }

  const updateUnbillableEntry = (index: number, day: typeof days[number], value: number) => {
    const updated = [...unbillableEntries]
    updated[index] = { ...updated[index], [`${day}_hours`]: normalizeTimesheetHours(value) }
    setUnbillableEntries(updated)
  }

  const updateUnbillableNotes = (index: number, value: string) => {
    const updated = [...unbillableEntries]
    updated[index] = { ...updated[index], notes: value }
    setUnbillableEntries(updated)
  }

  const addUnbillableRow = (type: 'HOLIDAY' | 'INTERNAL' | 'PTO') => {
    setUnbillableEntries((prev) => [
      ...prev,
      { description: type, notes: '', mon_hours: 0, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 0, sun_hours: 0 },
    ])
    setShowUnbillableTypeMenu(false)
  }

  const removeUnbillableRow = (index: number) => {
    setUnbillableEntries((prev) => prev.filter((_, i) => i !== index))
  }

  // Per-row dropdowns. Same filters the old popup used: client limits POs,
  // and a project-budget PO limits system / deliverable / activity to its matrix.
  const rowChoices = (entry: BillableEntry) => {
    // Filter POs by selected client (site) - when client is selected, only show POs assigned to that client
    const poOptions = (entry.client_project_id
      ? availablePurchaseOrders.filter(po => po.site_id === entry.client_project_id)
      : availablePurchaseOrders
    ).map(po => ({
      id: po.id,
      name: po.po_number,
      code: po.description,
    }))

    // When the selected PO is a project budget, the matrix is the exclusive
    // allowlist. Do not apply site / Manage Timesheet Options junction filters
    // on top — anyone with a bill rate on this PO should see every cell.
    const projectCombosForPo: Array<{ systemId: string; deliverableId: string; activityId: string }> =
      entry.po_id ? projectBudgetCombosByPo[entry.po_id] || [] : []
    const usingProjectCombos = projectCombosForPo.length > 0

    // Systems/deliverables/activities are stored per project PO, so the same name
    // (e.g. "Project", "EMPV") exists as many rows across the site — one per PO.
    // In project-budget mode we MUST restrict the System dropdown to the exact
    // system ids that appear in this PO's matrix; otherwise the user can pick a
    // like-named system belonging to another PO whose id matches no combo here,
    // and the Deliverable/Activity dropdowns come back empty.
    //
    // In basic-budget mode we only show globally-scoped rows (project_po_id IS
    // NULL), then filter by site + PO/department the same way Deliverable does.
    // That stops project-matrix systems from leaking into other POs' dropdowns.
    // If this entry already has a system_id that falls outside the allowlist
    // (legacy bad data), keep it in the options so the saved value still displays.
    const systemOptions = (() => {
      let list = systems
      if (usingProjectCombos) {
        const allowedSystemIds = new Set(projectCombosForPo.map(c => c.systemId))
        list = list.filter(s => allowedSystemIds.has(s.id))
      } else {
        list = list.filter(s => !s.project_po_id)
        if (entry.client_project_id) {
          list = list.filter(s => s.site_id === entry.client_project_id)
        }
        if (entry.po_id) {
          const selectedPO = purchaseOrders.find(p => p.id === entry.po_id)
          const poDepartmentId = selectedPO?.department_id
          list = list.filter(s => {
            const poIds = systemPOIds[s.id] || []
            if (poIds.length > 0) {
              return poIds.includes(entry.po_id!)
            }
            const sysDeptIds = systemDepartmentIds[s.id] || []
            if (sysDeptIds.length === 0) return true
            if (!poDepartmentId) return false
            return sysDeptIds.includes(poDepartmentId)
          })
        }
      }
      // Preserve a previously-saved selection that is no longer in the allowlist
      // so edit view still shows the value; it just won't be offered as a new pick.
      if (entry.system_id && !list.some(s => s.id === entry.system_id)) {
        const saved = systems.find(s => s.id === entry.system_id)
        if (saved) list = [...list, saved]
      }
      return list.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }))
    })()

    // Filter deliverables by client (site) and PO; deduplicate by id
    // When deliverable has no PO assignments: only show if its department matches the selected PO's department
    const filteredDeliverables = (() => {
      let list = deliverables
      if (entry.po_id && usingProjectCombos) {
        // Strict project-budget mode: matrix cells only. Skip site/junction
        // filters so a PO-private row cannot be hidden from someone who can
        // already charge this PO.
        const allowedIds = new Set<string>()
        for (const combo of projectCombosForPo) {
          if (entry.system_id && combo.systemId !== entry.system_id) continue
          if (entry.activity_id && combo.activityId !== entry.activity_id) continue
          allowedIds.add(combo.deliverableId)
        }
        list = list.filter(d => allowedIds.has(d.id))
      } else {
        if (entry.client_project_id) {
          list = list.filter(d => d.site_id === entry.client_project_id)
        }
        if (entry.po_id) {
          // Basic budget: never offer project-scoped private rows.
          list = list.filter(d => !d.project_po_id)
          const selectedPO = purchaseOrders.find(p => p.id === entry.po_id)
          const poDepartmentId = selectedPO?.department_id
          list = list.filter(d => {
            const poIds = deliverablePOIds[d.id] || []
            if (poIds.length > 0) {
              return poIds.includes(entry.po_id!)
            }
            // No PO assignments
            const delDeptIds = deliverableDepartmentIds[d.id] || []
            if (delDeptIds.length === 0) return true // N/A department: show for any PO
            if (!poDepartmentId) return false
            return delDeptIds.includes(poDepartmentId)
          })
        }
      }
      if (entry.deliverable_id && !list.some(d => d.id === entry.deliverable_id)) {
        const saved = deliverables.find(d => d.id === entry.deliverable_id)
        if (saved) list = [...list, saved]
      }
      return Array.from(new Map(list.map(d => [d.id, d])).values())
    })()

    const deliverableOptions = filteredDeliverables.map(d => ({
      id: d.id,
      name: d.name,
      code: d.code,
    }))

    // Filter activities by client (site) and PO; deduplicate by id
    const filteredActivities = (() => {
      let list = activities
      if (entry.po_id && usingProjectCombos) {
        // Strict project-budget mode (mirrors filteredDeliverables above).
        const allowedIds = new Set<string>()
        for (const combo of projectCombosForPo) {
          if (entry.system_id && combo.systemId !== entry.system_id) continue
          if (entry.deliverable_id && combo.deliverableId !== entry.deliverable_id) continue
          allowedIds.add(combo.activityId)
        }
        list = list.filter(a => allowedIds.has(a.id))
      } else {
        if (entry.client_project_id) {
          list = list.filter(a => a.site_id === entry.client_project_id)
        }
        if (entry.po_id) {
          list = list.filter(a => !a.project_po_id)
          list = list.filter(a => {
            const poIds = activityPOIds[a.id] || []
            return poIds.length === 0 || poIds.includes(entry.po_id!)
          })
        }
      }
      if (entry.activity_id && !list.some(a => a.id === entry.activity_id)) {
        const saved = activities.find(a => a.id === entry.activity_id)
        if (saved) list = [...list, saved]
      }
      return Array.from(new Map(list.map(a => [a.id, a])).values())
    })()

    const activityOptions = filteredActivities.map(a => ({
      id: a.id,
      name: a.name,
      code: a.code,
    }))

    return { poOptions, systemOptions, deliverableOptions, activityOptions, usingProjectCombos }
  }

  // Note: a previous version of this component auto-filled the Deliverable
  // and Activity dropdowns whenever there was only one valid option. That
  // made the X "clear" button on those fields effectively a no-op — the
  // user would click X, the field would clear for a render, then the
  // effect would immediately re-fill it from the single available option,
  // so the field appeared "locked". The auto-fill has been removed: the
  // user always picks Deliverable and Activity explicitly. The single-
  // option case is still one extra click but the field can now be cleared.

  return (
    <>
      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {employeeName && isAdminEditor && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
            Creating this timesheet for <span className="font-semibold">{employeeName}</span>. Submit uses their approval chain.
          </div>
        )}

        {rejectionReason && currentStatus === 'rejected' && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Rejection Note</p>
            <p className="text-red-700 dark:text-red-300 mb-3">{rejectionReason}</p>
            <a
              href={`/dashboard/timesheets/new?week=${weekEnding}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              Create new timesheet (start fresh) →
            </a>
          </div>
        )}

        {/* Week Information */}
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
          <div className="mb-3 flex justify-between items-center">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Week Ending Date
              </label>
              {canChangeWeekEnding ? (
                <select
                  value={weekEnding}
                  onChange={(e) => setWeekEnding(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                >
                  {weekEndingOptions.map((date) => (
                    <option key={date} value={date}>
                      {formatWeekEnding(date)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="px-4 py-2 text-gray-900 dark:text-gray-100 font-medium">
                  {formatWeekEnding(weekEnding)}
                </p>
              )}
            </div>
            {previousWeekData && (previousWeekData.entries?.length ?? 0) > 0 && (
              <div className="ml-4">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  Copy Previous Week
                </button>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Week Ending:</span> {formatDate(weekDates.end)}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Week Starting:</span> {formatDate(weekDates.start)}
          </p>
        </div>

        {/* Copy Previous Week Modal */}
        {showCopyModal && previousWeekData && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setShowCopyModal(false)
              }
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Copy Previous Week Data</h3>
                <button
                  onClick={() => setShowCopyModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                This will copy the structure (client, PO, task description, system, deliverable, activity) from the previous week&apos;s billable entries. Hours will start at zero for you to fill in.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCopyModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previousWeekData.entries) {
                      setBillableEntries(previousWeekData.entries.map((e: any) => ({
                        client_project_id: e.client_project_id,
                        po_id: e.po_id,
                        task_description: e.task_description,
                        system_id: e.system_id,
                        system_name: e.system_name,
                        deliverable_id: e.deliverable_id,
                        activity_id: e.activity_id,
                        mon_hours: 0,
                        tue_hours: 0,
                        wed_hours: 0,
                        thu_hours: 0,
                        fri_hours: 0,
                        sat_hours: 0,
                        sun_hours: 0,
                      })))
                    }
                    setShowCopyModal(false)
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Copy Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Billable Time Section */}
        <div className="relative">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Billable Time</h2>
          
          <div className="overflow-x-auto">
            {/* table-fixed so <col> widths are respected. Day columns use the same
                w-[3.5rem] as the unbillable table so both grids stay visually consistent. */}
            <table className="min-w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
              <colgroup>
                <col className="w-12" />         {/* reorder up/down */}
                <col className="w-40" />         {/* Client */}
                <col className="w-36" />         {/* PO# */}
                <col className="w-40" />         {/* Task Description */}
                <col className="w-36" />         {/* System */}
                <col className="w-36" />         {/* Deliverable */}
                <col className="w-36" />         {/* Activity */}
                {weekDates.days.map((_, idx) => (
                  <col key={idx} className="w-[3.5rem]" />  /* day columns */
                ))}
                <col className="w-[4.5rem]" />   {/* Total */}
                <col className="w-10" />          {/* delete btn */}
              </colgroup>
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100" title="Drag to reorder">
                    <GripVertical className="h-4 w-4 mx-auto text-gray-500" aria-hidden />
                    <span className="sr-only">Reorder</span>
                  </th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Client / Project #</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">PO#</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Task Description</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">System</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Deliverable</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100">Activity</th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE')}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">Total</th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {billableEntries.map((entry, entryIdx) => {
                  const choices = rowChoices(entry)
                  const cell = 'border border-gray-300 dark:border-gray-600 px-1 py-1 align-top'
                  return (
                  <tr
                    key={entryIdx}
                    ref={(el) => { billableRowRefs.current[entryIdx] = el }}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${draggingIndex === entryIdx ? 'opacity-60' : ''} ${dragOverIndex === entryIdx && draggingIndex !== null ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`}
                  >
                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center align-middle">
                      <button
                        type="button"
                        aria-label={`Drag to reorder row ${entryIdx + 1}`}
                        title="Drag to reorder"
                        onPointerDown={(e) => onGripPointerDown(entryIdx, e)}
                        onPointerMove={onGripPointerMove}
                        onPointerUp={onGripPointerUp}
                        onPointerCancel={() => {
                          dragFromRef.current = null
                          setDraggingIndex(null)
                          setDragOverIndex(null)
                        }}
                        className="cursor-grab active:cursor-grabbing touch-none text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    </td>
                    <td className={cell}>
                      <SearchableSelect
                        compact
                        options={availableSites}
                        value={entry.client_project_id || null}
                        onChange={(value) => {
                          const newClientId = value || undefined
                          const poStillValid = !newClientId || !entry.po_id || availablePurchaseOrders.some(po => po.id === entry.po_id && po.site_id === newClientId)
                          const delStillValid = !newClientId || !entry.deliverable_id || deliverables.some(d => d.id === entry.deliverable_id && d.site_id === newClientId)
                          const actStillValid = !newClientId || !entry.activity_id || activities.some(a => a.id === entry.activity_id && a.site_id === newClientId)
                          updateBillable(entryIdx, {
                            ...entry,
                            client_project_id: newClientId,
                            ...(poStillValid ? {} : { po_id: undefined }),
                            ...(delStillValid ? {} : { deliverable_id: undefined }),
                            ...(actStillValid ? {} : { activity_id: undefined }),
                          })
                        }}
                        placeholder="Client..."
                      />
                    </td>
                    <td className={cell}>
                      <SearchableSelect
                        compact
                        options={choices.poOptions}
                        value={entry.po_id || null}
                        onChange={(value) => {
                          const newPOId = value || undefined
                          const delStillValid = !newPOId || !entry.deliverable_id || (() => {
                            const poIds = deliverablePOIds[entry.deliverable_id!] || []
                            if (poIds.length > 0) return poIds.includes(newPOId)
                            const delDeptIds = deliverableDepartmentIds[entry.deliverable_id!] || []
                            if (delDeptIds.length === 0) return true
                            const newPO = purchaseOrders.find(p => p.id === newPOId)
                            if (!newPO?.department_id) return false
                            return delDeptIds.includes(newPO.department_id)
                          })()
                          const actStillValid = !newPOId || !entry.activity_id || (() => {
                            const poIds = activityPOIds[entry.activity_id!] || []
                            return poIds.length === 0 || poIds.includes(newPOId)
                          })()
                          updateBillable(entryIdx, {
                            ...entry,
                            po_id: newPOId,
                            ...(delStillValid ? {} : { deliverable_id: undefined }),
                            ...(actStillValid ? {} : { activity_id: undefined }),
                          })
                        }}
                        placeholder="PO..."
                      />
                    </td>
                    <td className={cell}>
                      <input
                        type="text"
                        value={entry.task_description}
                        onChange={(e) => updateBillable(entryIdx, { ...entry, task_description: e.target.value })}
                        placeholder="Task..."
                        className="w-full min-w-0 px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-900 bg-white dark:bg-white"
                      />
                    </td>
                    <td className={cell}>
                      <SystemInput
                        compact
                        options={choices.systemOptions}
                        allowCustom={!choices.usingProjectCombos}
                        value={entry.system_id || null}
                        customValue={entry.system_name}
                        onChange={(value, customValue) => {
                          if (customValue) {
                            updateBillable(entryIdx, {
                              ...entry,
                              system_id: undefined,
                              system_name: customValue,
                              deliverable_id: undefined,
                              activity_id: undefined,
                            })
                          } else {
                            updateBillable(entryIdx, {
                              ...entry,
                              system_id: value || undefined,
                              system_name: undefined,
                              deliverable_id: undefined,
                              activity_id: undefined,
                            })
                          }
                        }}
                        placeholder="System..."
                      />
                    </td>
                    <td className={cell}>
                      <SearchableSelect
                        compact
                        options={choices.deliverableOptions}
                        value={entry.deliverable_id || null}
                        onChange={(value) => updateBillable(entryIdx, { ...entry, deliverable_id: value || undefined })}
                        placeholder="Deliverable..."
                      />
                    </td>
                    <td className={cell}>
                      <SearchableSelect
                        compact
                        options={choices.activityOptions}
                        value={entry.activity_id || null}
                        onChange={(value) => updateBillable(entryIdx, { ...entry, activity_id: value || undefined })}
                        placeholder="Activity..."
                      />
                    </td>
                    {days.map((day) => (
                      <td key={day} className={cell}>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max="24"
                          value={entry[`${day}_hours`] || ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              updateBillable(entryIdx, { ...entry, [`${day}_hours`]: 0 })
                              return
                            }
                            const parsed = e.target.valueAsNumber
                            if (isNaN(parsed)) return
                            updateBillable(entryIdx, { ...entry, [`${day}_hours`]: normalizeTimesheetHours(parsed) })
                          }}
                          className="w-full max-w-[3.25rem] min-w-[3rem] mx-auto px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-sm text-gray-900 bg-white dark:bg-white"
                        />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center font-medium text-sm text-gray-900 dark:text-gray-100">
                      {formatHours(calculateTotal(entry))}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entryIdx)}
                        aria-label={`Delete row ${entryIdx + 1}`}
                        title="Delete row"
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  )
                })}
                
                {/* Sub Totals Row */}
                <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                  <td colSpan={7} className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-center text-gray-900 dark:text-gray-100">
                      {formatHours(getBillableSubtotal(day))}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                    {formatHours(billableEntries.reduce((sum, e) => sum + calculateTotal(e), 0))}
                  </td>
                  <td className="border border-gray-300 dark:border-gray-600 px-2 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleAddEntry}
            title="Add a new billable row"
            className="mt-2 flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Add Row
          </button>
        </div>

        {/* Unbillable Time */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Non-Billable Time</h2>
          
          {(['HOLIDAY', 'INTERNAL', 'PTO'] as const).map((t) => (
            <datalist key={t} id={`unbillable-desc-${t}`}>
              {(unbillableDescriptionOptions[t] || []).map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          ))}
          <div className="overflow-x-auto">
            <table className="min-w-full w-full table-fixed border-collapse border border-gray-300 dark:border-gray-600">
              <colgroup>
                <col className="w-[6.5rem]" />
                <col />
                {weekDates.days.map((_, idx) => (
                  <col key={idx} className="w-[3.5rem]" />
                ))}
                <col className="w-[4.5rem]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    Type
                  </th>
                  <th className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-left text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0">
                    Description
                  </th>
                  {weekDates.days.map((day, idx) => (
                    <th key={idx} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div>{format(day, 'EEE')}</div>
                      <div className="text-xs font-normal">{formatDateShort(weekDates.days[idx])}</div>
                    </th>
                  ))}
                  <th className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {unbillableEntries.map((entry, entryIdx) => (
                  <tr key={entryIdx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      <div className="flex items-center justify-between gap-1">
                        <span>{entry.description}</span>
                        <button
                          type="button"
                          onClick={() => removeUnbillableRow(entryIdx)}
                          title="Remove row"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 min-w-0">
                      <input
                        type="text"
                        list={`unbillable-desc-${entry.description}`}
                        value={entry.notes ?? ''}
                        onChange={(e) => updateUnbillableNotes(entryIdx, e.target.value)}
                        placeholder={(unbillableDescriptionOptions[entry.description] || []).length ? 'Select or type…' : 'Optional'}
                        className="w-full min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 bg-white dark:bg-gray-700 dark:text-gray-100"
                      />
                    </td>
                    {days.map((day) => (
                      <td key={day} className="border border-gray-300 dark:border-gray-600 px-1 py-2">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max="24"
                          value={entry[`${day}_hours`] || ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              updateUnbillableEntry(entryIdx, day, 0)
                              return
                            }
                            const parsed = e.target.valueAsNumber
                            if (isNaN(parsed)) {
                              return
                            }
                            updateUnbillableEntry(entryIdx, day, normalizeTimesheetHours(parsed))
                          }}
                          className="w-full max-w-[3.25rem] min-w-[3rem] mx-auto px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-sm focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white dark:bg-white"
                        />
                      </td>
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatHours(calculateTotal(entry))}
                    </td>
                  </tr>
                ))}
                
                {/* Sub Totals Row */}
                <tr className="bg-yellow-50 dark:bg-yellow-900/30 font-semibold">
                  <td colSpan={2} className="border border-gray-300 dark:border-gray-600 px-2 py-2 text-gray-900 dark:text-gray-100">Sub Totals</td>
                  {days.map((day) => (
                    <td key={day} className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-gray-900 dark:text-gray-100">
                      {formatHours(getUnbillableSubtotal(day))}
                    </td>
                  ))}
                  <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {formatHours(unbillableEntries.reduce((sum, e) => sum + calculateTotal(e), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 relative inline-block">
            <button
              type="button"
              onClick={() => setShowUnbillableTypeMenu((s) => !s)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> Add Row
            </button>
            {showUnbillableTypeMenu && (
              <div className="absolute z-10 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                {(['HOLIDAY', 'INTERNAL', 'PTO'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addUnbillableRow(t)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notes Section */}
        <div>
          <label
            htmlFor="timesheet-notes"
            className="block text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2"
          >
            Notes
          </label>
          <textarea
            id="timesheet-notes"
            value={timesheetNotes}
            onChange={(e) => setTimesheetNotes(e.target.value)}
            placeholder="Optional — add any notes or comments for this timesheet"
            rows={3}
            disabled={currentStatus !== 'draft' && currentStatus !== 'rejected'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 resize-y disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Grand Total */}
        <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">GRAND TOTAL</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatHours(getGrandTotal())}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button
            type="submit"
            disabled={loading || (!isAdminEditor && currentStatus !== 'draft' && currentStatus !== 'rejected')}
            className="min-h-[44px] sm:min-h-0 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Saving...'
              : isAdminEditor && currentStatus !== 'draft' && currentStatus !== 'rejected'
                ? 'Save Changes'
                : timesheetId
                  ? 'Save Draft'
                  : 'Save Timesheet'}
          </button>
          {(currentStatus === 'draft' || currentStatus === 'rejected') && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="min-h-[44px] sm:min-h-0 bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : currentStatus === 'rejected' ? 'Resubmit for Approval' : 'Submit for Approval'}
            </button>
          )}
          {timesheetId && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/timesheets/${timesheetId}`)}
              className="min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              disabled={loading}
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            className="min-h-[44px] sm:min-h-0 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          {timesheetId && currentStatus === 'draft' && (
            <DeleteTimesheetButton
              timesheetId={timesheetId}
              status={currentStatus}
              variant="button"
              onDeleted={() => {
                // Client-side navigation preserves the applied theme (dark/light
                // class on <html>). A full window.location reload can flash to
                // light mode before ThemeScript re-reads localStorage.
                router.push('/dashboard/timesheets')
                router.refresh()
              }}
            />
          )}
        </div>
      </form>

    </>
  )
}
