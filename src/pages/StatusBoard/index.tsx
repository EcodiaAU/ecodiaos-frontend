/**
 * StatusBoard - Tate-facing management UI for the status_board table.
 *
 * Inline edit, archive, bulk actions, filters, mobile card view.
 * This is the drift-audit surface that lifts hygiene off the conductor.
 *
 * Design: dark conductor theme, green+gold palette, framer-motion polish.
 * Origin: fork_mp1ym10n_303c2a, 2026-05-12
 */
import {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow, isAfter, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Archive, Plus, Search, X, RefreshCw,
  User, Layers, MessageSquare, CheckSquare, TrendingUp,
  Heart, Scale, Server, ChevronDown, CheckCheck, Tag,
  Clock, ArrowUpDown,
} from 'lucide-react'
import {
  listRows, createRow, updateRow, archiveRow, bulkArchive, bulkPriority,
} from '@/api/statusBoard'
import type {
  StatusRow, UpdatePayload, CreatePayload, NextActionBy, EntityType,
} from '@/api/statusBoard'

// ── Design tokens ────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<number, {
  label: string; chip: string; dot: string; row: string
}> = {
  1: { label: 'P1', chip: 'bg-red-900/60 text-red-200 border border-red-700/50', dot: 'bg-red-400', row: 'border-l-red-500/70' },
  2: { label: 'P2', chip: 'bg-orange-900/50 text-orange-200 border border-orange-700/40', dot: 'bg-orange-400', row: 'border-l-orange-500/60' },
  3: { label: 'P3', chip: 'bg-blue-900/40 text-blue-200 border border-blue-700/30', dot: 'bg-blue-400', row: 'border-l-blue-500/50' },
  4: { label: 'P4', chip: 'bg-zinc-800/70 text-zinc-300 border border-zinc-700/40', dot: 'bg-zinc-500', row: 'border-l-zinc-600/40' },
  5: { label: 'P5', chip: 'bg-zinc-900/60 text-zinc-500 border border-zinc-800/40', dot: 'bg-zinc-700', row: 'border-l-zinc-700/30' },
}

const NAB_CFG: Record<string, { label: string; chip: string }> = {
  ecodiaos: { label: 'OS', chip: 'bg-green-900/50 text-green-200 border border-green-700/40' },
  tate: { label: 'Tate', chip: 'bg-amber-900/50 text-amber-200 border border-amber-700/40' },
  client: { label: 'Client', chip: 'bg-sky-900/40 text-sky-200 border border-sky-700/30' },
  external: { label: 'External', chip: 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/40' },
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  client: User,
  project: Layers,
  thread: MessageSquare,
  task: CheckSquare,
  opportunity: TrendingUp,
  personal: Heart,
  legal: Scale,
  infrastructure: Server,
}

const NAB_OPTIONS: NextActionBy[] = ['ecodiaos', 'tate', 'client', 'external']
const ENTITY_OPTIONS: EntityType[] = [
  'client', 'project', 'thread', 'task',
  'opportunity', 'personal', 'legal', 'infrastructure',
]
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5]

const STALE_THRESHOLD = subDays(new Date(), 7)

// ── Small components ─────────────────────────────────────────────────────

function PriorityChip({ p }: { p: number | null }) {
  const cfg = PRIORITY_CFG[p ?? 3] ?? PRIORITY_CFG[3]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wide ${cfg.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function NabChip({ nab }: { nab: string | null }) {
  const cfg = NAB_CFG[nab ?? 'ecodiaos'] ?? NAB_CFG.ecodiaos
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.chip}`}>
      {cfg.label}
    </span>
  )
}

function EntityIcon({ type }: { type: string }) {
  const Icon = ENTITY_ICONS[type] ?? CheckSquare
  return <Icon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
}

function RelTime({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-zinc-700 text-xs">-</span>
  const date = new Date(ts)
  const isStale = isAfter(STALE_THRESHOLD, date)
  return (
    <span className={`text-xs ${isStale ? 'text-amber-600' : 'text-zinc-500'}`} title={ts}>
      {isStale && <Clock className="inline w-3 h-3 mr-0.5 opacity-70" />}
      {formatDistanceToNow(date, { addSuffix: true })}
    </span>
  )
}

// ── Inline text editor ───────────────────────────────────────────────────

interface InlineTextProps {
  value: string | null
  multiline?: boolean
  onSave: (v: string) => void
  className?: string
  placeholder?: string
}

function InlineText({ value, multiline, onSave, className = '', placeholder = '-' }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed !== (value ?? '')) onSave(trimmed)
    setEditing(false)
  }, [draft, value, onSave])

  const cancel = useCallback(() => {
    setDraft(value ?? '')
    setEditing(false)
  }, [value])

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value ?? ''); setEditing(true) }}
        className={`text-left w-full hover:bg-white/5 rounded px-1 -mx-1 transition-colors group ${className}`}
        title="Click to edit"
      >
        {value
          ? <span className="group-hover:text-white transition-colors">{value}</span>
          : <span className="text-zinc-700 italic text-xs">{placeholder}</span>}
      </button>
    )
  }

  const shared = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
      if (e.key === 'Escape') cancel()
    },
    onBlur: commit,
    className: `w-full bg-white/8 border border-primary/40 rounded px-2 py-0.5 text-sm text-white
      focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none`,
  }

  return multiline
    ? <textarea ref={inputRef as React.Ref<HTMLTextAreaElement>} {...shared} rows={3} />
    : <input ref={inputRef as React.Ref<HTMLInputElement>} {...shared} />
}

// ── Inline select editor ─────────────────────────────────────────────────

interface InlineSelectProps<T extends string> {
  value: T | null
  options: T[]
  renderLabel: (v: T) => React.ReactNode
  onSave: (v: T) => void
}

function InlineSelect<T extends string>({ value, options, renderLabel, onSave }: InlineSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
      >
        {value ? renderLabel(value) : <span className="text-zinc-700 text-xs italic">-</span>}
        <ChevronDown className="w-2.5 h-2.5 text-zinc-600" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full left-0 mt-1 min-w-[120px] bg-zinc-900 border border-zinc-700/60
              rounded-lg shadow-xl shadow-black/60 overflow-hidden"
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onSave(opt); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/8 transition-colors
                  ${opt === value ? 'bg-primary/10 text-primary-light' : 'text-zinc-300'}`}
              >
                {renderLabel(opt)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── New row modal ────────────────────────────────────────────────────────

function NewRowModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (row: StatusRow) => void
}) {
  const [form, setForm] = useState<CreatePayload>({
    entity_type: 'task',
    name: '',
    status: 'active',
    next_action: '',
    next_action_by: 'ecodiaos',
    priority: 3,
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof CreatePayload, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const row = await createRow(form)
      toast.success('Row created')
      onCreated(row)
      onClose()
    } catch {
      toast.error('Failed to create row')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        onClick={e => e.stopPropagation()}
        className="relative z-10 w-full max-w-lg bg-zinc-900 border border-zinc-700/60
          rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">New status row</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Name *</label>
            <input
              autoFocus
              value={form.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="What is this row tracking?"
              className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                text-white placeholder-zinc-600 focus:outline-none focus:border-primary/60
                focus:ring-1 focus:ring-primary/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Type</label>
              <select
                value={form.entity_type}
                onChange={e => set('entity_type', e.target.value as EntityType)}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                  text-white focus:outline-none focus:border-primary/60"
              >
                {ENTITY_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={e => set('priority', parseInt(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                  text-white focus:outline-none focus:border-primary/60"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>P{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Status</label>
            <input
              value={form.status ?? ''}
              onChange={e => set('status', e.target.value)}
              placeholder="active"
              className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                text-white placeholder-zinc-600 focus:outline-none focus:border-primary/60"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Next action</label>
            <textarea
              value={form.next_action ?? ''}
              onChange={e => set('next_action', e.target.value)}
              placeholder="What needs to happen next?"
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                text-white placeholder-zinc-600 focus:outline-none focus:border-primary/60 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Owner</label>
            <select
              value={form.next_action_by}
              onChange={e => set('next_action_by', e.target.value as NextActionBy)}
              className="w-full bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-sm
                text-white focus:outline-none focus:border-primary/60"
            >
              {NAB_OPTIONS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 bg-primary hover:bg-primary/80 disabled:opacity-50
              text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving && <RefreshCw className="w-3 h-3 animate-spin" />}
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Mobile card ──────────────────────────────────────────────────────────

function MobileCard({
  row, selected, onSelect, onUpdate: _onUpdate, onArchive,
}: {
  row: StatusRow
  selected: boolean
  onSelect: (id: string, v: boolean) => void
  onUpdate: (id: string, patch: UpdatePayload) => void
  onArchive: (id: string) => void
}) {
  const p = row.priority ?? 3
  const cfg = PRIORITY_CFG[p] ?? PRIORITY_CFG[3]
  const isStale = row.last_touched
    ? isAfter(STALE_THRESHOLD, new Date(row.last_touched))
    : false

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={`bg-zinc-900/80 border rounded-xl overflow-hidden
        ${selected ? 'border-primary/60' : 'border-zinc-800/60'}
        ${isStale ? 'opacity-60' : ''}
        border-l-2 ${cfg.row}`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(row.id, e.target.checked)}
            className="mt-0.5 w-3.5 h-3.5 accent-primary rounded flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <PriorityChip p={p} />
              <NabChip nab={row.next_action_by} />
              <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                <EntityIcon type={row.entity_type} />
                {row.entity_type}
              </span>
            </div>
            <div className="text-sm font-medium text-white mb-0.5 truncate">
              {row.name}
            </div>
            {row.status && (
              <div className="text-xs text-zinc-500">{row.status}</div>
            )}
          </div>
          <button
            onClick={() => onArchive(row.id)}
            className="text-zinc-600 hover:text-amber-400 transition-colors p-1 flex-shrink-0"
            title="Archive"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>

        {row.next_action && (
          <div className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-2 py-1.5 ml-5">
            {row.next_action}
          </div>
        )}

        <div className="ml-5 flex items-center gap-2">
          <RelTime ts={row.last_touched} />
        </div>
      </div>
    </motion.div>
  )
}

// ── Desktop table row ────────────────────────────────────────────────────

function TableRow({
  row, selected, onSelect, onUpdate, onArchive, saving,
}: {
  row: StatusRow
  selected: boolean
  onSelect: (id: string, v: boolean) => void
  onUpdate: (id: string, patch: UpdatePayload) => void
  onArchive: (id: string) => void
  saving: boolean
}) {
  const p = row.priority ?? 3
  const cfg = PRIORITY_CFG[p] ?? PRIORITY_CFG[3]
  const isStale = row.last_touched
    ? isAfter(STALE_THRESHOLD, new Date(row.last_touched))
    : false

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: isStale ? 0.55 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`group border-l-2 ${cfg.row}
        ${selected ? 'bg-primary/5' : 'hover:bg-white/[0.025]'}
        ${saving ? 'opacity-70' : ''}
        transition-colors border-b border-zinc-800/40`}
    >
      {/* Checkbox */}
      <td className="w-8 pl-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelect(row.id, e.target.checked)}
          className="w-3.5 h-3.5 accent-primary rounded"
        />
      </td>

      {/* Priority */}
      <td className="w-14 px-2 py-2.5">
        <InlineSelect
          value={String(p) as unknown as NextActionBy}
          options={PRIORITY_OPTIONS.map(String) as unknown as NextActionBy[]}
          renderLabel={(v) => <PriorityChip p={parseInt(v as unknown as string)} />}
          onSave={(v) => onUpdate(row.id, { priority: parseInt(v as unknown as string) })}
        />
      </td>

      {/* Entity type + name */}
      <td className="px-2 py-2.5 max-w-[180px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <EntityIcon type={row.entity_type} />
          <div className="min-w-0 flex-1">
            <InlineText
              value={row.name}
              onSave={(v) => onUpdate(row.id, { name: v })}
              className="text-sm text-zinc-200 font-medium truncate"
              placeholder="(no name)"
            />
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-2 py-2.5 max-w-[120px]">
        <InlineText
          value={row.status}
          onSave={(v) => onUpdate(row.id, { status: v })}
          className="text-xs text-zinc-400"
          placeholder="no status"
        />
      </td>

      {/* Next action */}
      <td className="px-2 py-2.5">
        <InlineText
          value={row.next_action}
          multiline
          onSave={(v) => onUpdate(row.id, { next_action: v })}
          className="text-xs text-zinc-300 line-clamp-2"
          placeholder="no next action"
        />
      </td>

      {/* Owner */}
      <td className="w-24 px-2 py-2.5">
        <InlineSelect
          value={row.next_action_by as NextActionBy}
          options={NAB_OPTIONS}
          renderLabel={(v) => <NabChip nab={v} />}
          onSave={(v) => onUpdate(row.id, { next_action_by: v })}
        />
      </td>

      {/* Last touched */}
      <td className="w-28 px-2 py-2.5 hidden xl:table-cell">
        <RelTime ts={row.last_touched} />
      </td>

      {/* Actions */}
      <td className="w-10 pr-3 py-2.5">
        <button
          onClick={() => onArchive(row.id)}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-amber-400
            transition-all p-1 rounded"
          title="Archive row"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </td>
    </motion.tr>
  )
}

// ── Main page ────────────────────────────────────────────────────────────

export default function StatusBoardPage() {
  const [rows, setRows] = useState<StatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<Set<number>>(new Set())
  const [filterNab, setFilterNab] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)

  // Bulk priority dropdown
  const [bulkPriorityOpen, setBulkPriorityOpen] = useState(false)
  const bulkPriorityRef = useRef<HTMLDivElement>(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listRows({
        priority: filterPriority.size > 0 ? [...filterPriority].join(',') : undefined,
        next_action_by: filterNab.size > 0 ? [...filterNab].join(',') : undefined,
        entity_type: filterType.size > 0 ? [...filterType].join(',') : undefined,
        search: search || undefined,
        include_archived: showArchived,
        limit: 500,
      })
      setRows(data)
    } catch {
      toast.error('Failed to load status board')
    } finally {
      setLoading(false)
    }
  }, [filterPriority, filterNab, filterType, search, showArchived])

  // Debounced search load
  useEffect(() => {
    const t = setTimeout(loadRows, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [loadRows])

  // Close bulk priority dropdown on outside click
  useEffect(() => {
    if (!bulkPriorityOpen) return
    const handler = (e: MouseEvent) => {
      if (!bulkPriorityRef.current?.contains(e.target as Node)) setBulkPriorityOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bulkPriorityOpen])

  const togglePriorityFilter = (p: number) =>
    setFilterPriority(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleNabFilter = (v: string) =>
    setFilterNab(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n })
  const _toggleTypeFilter = (v: string) =>
    setFilterType(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n })

  const toggleSelect = useCallback((id: string, v: boolean) =>
    setSelected(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n }), [])

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map(r => r.id)))
    }
  }

  const handleUpdate = useCallback(async (id: string, patch: UpdatePayload) => {
    // Optimistic update
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, ...patch, last_touched: new Date().toISOString() } : r
    ))
    setSavingIds(s => new Set(s).add(id))
    try {
      const updated = await updateRow(id, patch)
      setRows(prev => prev.map(r => r.id === id ? updated : r))
    } catch {
      toast.error('Failed to save')
      loadRows()
    } finally {
      setSavingIds(s => { const n = new Set(s); n.delete(id); return n })
    }
  }, [loadRows])

  const handleArchive = useCallback(async (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      await archiveRow(id)
      toast.success('Archived')
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
    } catch {
      toast.error('Archive failed')
      loadRows()
    }
  }, [loadRows])

  const handleBulkArchive = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setRows(prev => prev.filter(r => !selected.has(r.id)))
    setSelected(new Set())
    try {
      const result = await bulkArchive(ids)
      toast.success(`Archived ${result.count} rows`)
    } catch {
      toast.error('Bulk archive failed')
      loadRows()
    }
  }

  const handleBulkPriority = async (p: number) => {
    const ids = [...selected]
    if (!ids.length) return
    setBulkPriorityOpen(false)
    setRows(prev => prev.map(r => selected.has(r.id) ? { ...r, priority: p } : r))
    try {
      await bulkPriority(ids, p)
      toast.success(`Updated priority on ${ids.length} rows`)
    } catch {
      toast.error('Bulk priority update failed')
      loadRows()
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterPriority(new Set())
    setFilterNab(new Set())
    setFilterType(new Set())
    setShowArchived(false)
  }

  const hasActiveFilters = search || filterPriority.size > 0 || filterNab.size > 0 ||
    filterType.size > 0 || showArchived

  // Stale counts for dashboard feel
  const staleCount = useMemo(() =>
    rows.filter(r => r.last_touched && isAfter(STALE_THRESHOLD, new Date(r.last_touched))).length
  , [rows])

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-white">Status Board</h1>
                  {!loading && (
                    <span className="text-xs text-zinc-600 font-mono">
                      {rows.length} rows
                    </span>
                  )}
                </div>
                {staleCount > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {staleCount} stale (not touched in 7d)
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadRows}
                disabled={loading}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800
                  transition-colors disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/80
                  text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New row</span>
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-40 sm:w-56 bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5
                  text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700
                  focus:ring-1 focus:ring-zinc-700/50 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Priority chips */}
            <div className="flex items-center gap-1">
              {PRIORITY_OPTIONS.map(p => {
                const cfg = PRIORITY_CFG[p]
                const active = filterPriority.has(p)
                return (
                  <button
                    key={p}
                    onClick={() => togglePriorityFilter(p)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px]
                      font-mono font-semibold tracking-wide transition-all
                      ${active ? cfg.chip : 'bg-zinc-900 text-zinc-600 border border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    P{p}
                  </button>
                )
              })}
            </div>

            {/* NAB chips */}
            <div className="flex items-center gap-1">
              {NAB_OPTIONS.map(nab => {
                const cfg = NAB_CFG[nab]
                const active = filterNab.has(nab)
                return (
                  <button
                    key={nab}
                    onClick={() => toggleNabFilter(nab)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all
                      ${active ? cfg.chip : 'bg-zinc-900 text-zinc-600 border border-zinc-800 hover:border-zinc-700'}`}
                  >
                    {nab === 'ecodiaos' ? 'OS' : nab.charAt(0).toUpperCase() + nab.slice(1)}
                  </button>
                )
              })}
            </div>

            {/* Archived toggle */}
            <button
              onClick={() => setShowArchived(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
                transition-all border
                ${showArchived
                  ? 'bg-zinc-700/60 text-zinc-300 border-zinc-600'
                  : 'bg-zinc-900 text-zinc-600 border-zinc-800 hover:border-zinc-700'}`}
            >
              <Archive className="w-3 h-3" />
              Archived
            </button>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 flex items-center gap-1
                  transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="sticky top-[109px] z-20 bg-zinc-900/95 backdrop-blur-md
              border-b border-zinc-700/60"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-medium">
                {selected.size} selected
              </span>
              <button
                onClick={handleBulkArchive}
                className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200
                  bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/40
                  px-3 py-1 rounded-lg transition-all"
              >
                <Archive className="w-3 h-3" />
                Archive selected
              </button>

              {/* Bulk priority */}
              <div ref={bulkPriorityRef} className="relative">
                <button
                  onClick={() => setBulkPriorityOpen(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200
                    bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700/40
                    px-3 py-1 rounded-lg transition-all"
                >
                  <Tag className="w-3 h-3" />
                  Set priority
                  <ChevronDown className="w-3 h-3" />
                </button>
                <AnimatePresence>
                  {bulkPriorityOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full left-0 mt-1 bg-zinc-900 border border-zinc-700/60
                        rounded-xl shadow-xl shadow-black/60 overflow-hidden z-50"
                    >
                      {PRIORITY_OPTIONS.map(p => (
                        <button
                          key={p}
                          onClick={() => handleBulkPriority(p)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs
                            hover:bg-white/8 transition-colors text-left"
                        >
                          <PriorityChip p={p} />
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Deselect all
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
            <CheckCheck className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No rows match the current filters.</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-xs text-primary hover:text-primary-light transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Mobile: card grid */}
        <div className="sm:hidden space-y-2">
          <AnimatePresence mode="popLayout">
            {rows.map(row => (
              <MobileCard
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onSelect={toggleSelect}
                onUpdate={handleUpdate}
                onArchive={handleArchive}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block">
          {rows.length > 0 && (
            <div className="rounded-xl border border-zinc-800/60 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-zinc-800/60">
                    <th className="w-8 pl-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.size === rows.length && rows.length > 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 accent-primary rounded"
                      />
                    </th>
                    <th className="w-14 px-2 py-2.5 text-left">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                        Pri
                      </span>
                    </th>
                    <th className="px-2 py-2.5 text-left">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide flex items-center gap-1">
                        <ArrowUpDown className="w-2.5 h-2.5" /> Name
                      </span>
                    </th>
                    <th className="px-2 py-2.5 text-left max-w-[120px]">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                        Status
                      </span>
                    </th>
                    <th className="px-2 py-2.5 text-left">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                        Next action
                      </span>
                    </th>
                    <th className="w-24 px-2 py-2.5 text-left">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                        Owner
                      </span>
                    </th>
                    <th className="w-28 px-2 py-2.5 text-left hidden xl:table-cell">
                      <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide">
                        Touched
                      </span>
                    </th>
                    <th className="w-10 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {rows.map(row => (
                      <TableRow
                        key={row.id}
                        row={row}
                        selected={selected.has(row.id)}
                        onSelect={toggleSelect}
                        onUpdate={handleUpdate}
                        onArchive={handleArchive}
                        saving={savingIds.has(row.id)}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Loading shimmer */}
        {loading && rows.length === 0 && (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-zinc-900/80 animate-pulse"
                style={{ opacity: 1 - i * 0.1 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* New row modal */}
      <AnimatePresence>
        {showNew && (
          <NewRowModal
            onClose={() => setShowNew(false)}
            onCreated={(row) => setRows(prev => [row, ...prev])}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
