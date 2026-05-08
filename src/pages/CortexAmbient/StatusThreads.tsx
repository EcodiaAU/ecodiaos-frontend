/**
 * StatusThreads — what is on the entity's mind.
 *
 * Round-3, fork_mowtlsvo_95bffd (manager fork_mowtf5s4_82c7f4).
 *
 * Read-only viewport into status_board. Dense rows, ~52px each.
 * Sort: priority asc, then last_touched desc.
 *
 * Spec §4.4.
 */
import type { StatusRow } from './useStatusBoard'
import { AMBIENT_PALETTE, actionByColor } from './palette'

interface StatusThreadsProps {
  rows: StatusRow[]
}

function priorityChip(priority: number | null | undefined): {
  label: string
  color: string
  bg: string
} {
  const p = priority ?? 5
  if (p === 1)
    return { label: 'P1', color: '#ffd9d9', bg: 'rgba(232,90,90,0.22)' }
  if (p === 2)
    return { label: 'P2', color: '#ffe7c2', bg: 'rgba(240,168,71,0.22)' }
  if (p === 3)
    return { label: 'P3', color: '#cdf6ee', bg: 'rgba(90,217,200,0.18)' }
  return {
    label: `P${p}`,
    color: AMBIENT_PALETTE.textDim,
    bg: 'rgba(120,130,148,0.14)',
  }
}

function nameColor(priority: number | null | undefined): string {
  const p = priority ?? 5
  if (p <= 2) return AMBIENT_PALETTE.coreGlow
  if (p === 3) return AMBIENT_PALETTE.emberSoft
  return AMBIENT_PALETTE.textDim
}

function sortRows(rows: StatusRow[]): StatusRow[] {
  return [...rows].sort((a, b) => {
    const pa = a.priority ?? 99
    const pb = b.priority ?? 99
    if (pa !== pb) return pa - pb
    const ta = new Date(a.last_touched || 0).getTime()
    const tb = new Date(b.last_touched || 0).getTime()
    return tb - ta
  })
}

export function StatusThreads({ rows }: StatusThreadsProps) {
  const sorted = sortRows(rows)

  if (sorted.length === 0) {
    return (
      <div
        className="px-4 py-6 text-[13px]"
        style={{
          color: AMBIENT_PALETTE.textDim,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: '0.04em',
        }}
      >
        no active threads. clear deck.
      </div>
    )
  }

  return (
    <ul
      className="ambient-status-threads flex flex-col"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {sorted.map((r, i) => (
        <StatusRowItem key={r.id ?? `${r.entity_type}-${i}`} row={r} />
      ))}
    </ul>
  )
}

function StatusRowItem({ row }: { row: StatusRow }) {
  const chip = priorityChip(row.priority)
  const accent = actionByColor(row.next_action_by)

  return (
    <li
      className="flex items-stretch gap-3 border-b px-4"
      style={{
        borderColor: 'rgba(255,255,255,0.05)',
        minHeight: 52,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      {/* left accent bar — who has the ball */}
      <div
        aria-hidden
        style={{
          width: 3,
          flexShrink: 0,
          background: accent,
          borderRadius: 2,
          alignSelf: 'stretch',
        }}
      />

      {/* center: name + next_action */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div
          className="truncate text-[15px] leading-tight"
          style={{
            color: nameColor(row.priority),
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {row.name}
        </div>
        {row.next_action ? (
          <div
            className="truncate text-[13px] leading-tight"
            style={{
              color: AMBIENT_PALETTE.textDim,
              marginTop: 2,
            }}
          >
            {row.next_action}
          </div>
        ) : null}
      </div>

      {/* right: priority + action_by */}
      <div className="flex flex-shrink-0 flex-col items-end justify-center gap-1">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: chip.bg,
            color: chip.color,
            letterSpacing: '0.06em',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
          aria-label={`priority ${chip.label}`}
        >
          {chip.label}
        </span>
        {row.next_action_by ? (
          <span
            className="text-[9px] uppercase"
            style={{
              color: accent,
              letterSpacing: '0.18em',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            {row.next_action_by}
          </span>
        ) : null}
      </div>
    </li>
  )
}
