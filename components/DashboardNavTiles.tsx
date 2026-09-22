'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  Building,
  Calendar,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FileBarChart,
  FileText,
  Users,
  X,
} from 'lucide-react'

export type TileIcon =
  | 'fileText'
  | 'calendar'
  | 'calendarOff'
  | 'users'
  | 'building'
  | 'activity'
  | 'fileBarChart'
  | 'barChart'
  | 'clipboardList'
  | 'clipboardCheck'
  | 'dollarSign'

export type TileColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'teal'
  | 'indigo'
  | 'orange'
  | 'violet'
  | 'cyan'
  | 'emerald'

export type NavTileOption = {
  id: string
  href: string
  title: string
  description: string
  icon: TileIcon
  color: TileColor
  openInNewTab?: boolean
  badge?: number
}

export type NavTile = {
  id: string
  title: string
  description: string
  icon: TileIcon
  color: TileColor
  href?: string
  openInNewTab?: boolean
  badge?: number
  /** Hide on small screens (Payroll today). */
  desktopOnly?: boolean
  options?: NavTileOption[]
}

const ICONS: Record<TileIcon, typeof FileText> = {
  fileText: FileText,
  calendar: Calendar,
  calendarOff: CalendarOff,
  users: Users,
  building: Building,
  activity: Activity,
  fileBarChart: FileBarChart,
  barChart: BarChart3,
  clipboardList: ClipboardList,
  clipboardCheck: ClipboardCheck,
  dollarSign: DollarSign,
}

const COLOR: Record<TileColor, { wrap: string; icon: string }> = {
  blue: {
    wrap: 'bg-blue-100 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    wrap: 'bg-green-100 dark:bg-green-900/30',
    icon: 'text-green-600 dark:text-green-400',
  },
  purple: {
    wrap: 'bg-purple-100 dark:bg-purple-900/30',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  teal: {
    wrap: 'bg-teal-100 dark:bg-teal-900/30',
    icon: 'text-teal-600 dark:text-teal-400',
  },
  indigo: {
    wrap: 'bg-indigo-100 dark:bg-indigo-900/30',
    icon: 'text-indigo-600 dark:text-indigo-400',
  },
  orange: {
    wrap: 'bg-orange-100 dark:bg-orange-900/30',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  violet: {
    wrap: 'bg-violet-100 dark:bg-violet-900/30',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  cyan: {
    wrap: 'bg-cyan-100 dark:bg-cyan-900/30',
    icon: 'text-cyan-600 dark:text-cyan-400',
  },
  emerald: {
    wrap: 'bg-emerald-100 dark:bg-emerald-900/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
}

const cardClass =
  'bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0 w-full text-left'

function TileVisual({
  icon,
  color,
  title,
  description,
  badge,
}: {
  icon: TileIcon
  color: TileColor
  title: string
  description: string
  badge?: number
}) {
  const Icon = ICONS[icon]
  const colors = COLOR[color]
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className={`${colors.wrap} p-3 rounded-lg relative`}>
        <Icon className={`h-6 w-6 ${colors.icon}`} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{description}</p>
      </div>
    </div>
  )
}

function TileLink({ tile }: { tile: NavTile | NavTileOption }) {
  const className = `${cardClass}${
    'desktopOnly' in tile && tile.desktopOnly ? ' hidden md:block' : ''
  }`
  const visual = (
    <TileVisual
      icon={tile.icon}
      color={tile.color}
      title={tile.title}
      description={tile.description}
      badge={tile.badge}
    />
  )
  if (tile.openInNewTab) {
    return (
      <a href={tile.href} target="_blank" rel="noopener noreferrer" className={className}>
        {visual}
      </a>
    )
  }
  return (
    <Link href={tile.href || '#'} className={className}>
      {visual}
    </Link>
  )
}

function ChooserModal({
  title,
  options,
  onClose,
}: {
  title: string
  options: NavTileOption[]
  onClose: () => void
}) {
  const headingId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('a,button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-gray-50 dark:bg-gray-900 shadow-xl p-4 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {options.map((opt) => (
            <div key={opt.id} onClick={onClose}>
              <TileLink tile={opt} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GroupTile({ tile }: { tile: NavTile }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        type="button"
        className={`${cardClass}${tile.desktopOnly ? ' hidden md:block' : ''}`}
        onClick={() => setOpen(true)}
      >
        <TileVisual
          icon={tile.icon}
          color={tile.color}
          title={tile.title}
          description={tile.description}
          badge={tile.badge}
        />
      </button>
      {open && tile.options && (
        <ChooserModal title={tile.title} options={tile.options} onClose={close} />
      )}
    </>
  )
}

function resolveTile(tile: NavTile): NavTile {
  const options = tile.options
  if (!options || options.length !== 1) return tile
  const only = options[0]
  return {
    ...tile,
    title: only.title,
    description: only.description,
    icon: only.icon,
    color: only.color,
    href: only.href,
    openInNewTab: only.openInNewTab,
    badge: only.badge ?? tile.badge,
    options: undefined,
  }
}

export default function DashboardNavTiles({ tiles }: { tiles: NavTile[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
      {tiles.map((tile) => {
        if (Array.isArray(tile.options) && tile.options.length > 1) {
          return <GroupTile key={tile.id} tile={tile} />
        }
        return <TileLink key={tile.id} tile={resolveTile(tile)} />
      })}
    </div>
  )
}
