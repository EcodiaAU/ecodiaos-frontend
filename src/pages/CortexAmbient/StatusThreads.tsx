import { useState } from 'react'
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
  if (p === 1) return { label: 'P1', color: '#ffd9d9', bg: 'rgba(232,90,90,0.22)' }
  if (p === 2) return { label: 'P2', color: '#ffe7c2', bg: 'rgba(240,168,71,0.22)' }
  if (p === 3) return { label: 'P3', color: '#cdf6ee', bg: 'rgba(90,217,200,0.18)' }
  return { label: `P${p}`, color: AMBIENT_PALETTE.textDim, bg: 'rgba(120,130,148,0.14)' }
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
      className="ambient-status-threads flex flex-col gap-2 px-4"
      style={{ listStyle: 'none', margin: 0, padding: 0, paddingLeft: 16, paddingRight: 16 }}
    >
      {sorted.map((r, i) => (
        <StatusRowItem key={r.id ?? `${r.entity_type}-${i}`} row={r} />
      ))}
    </ul>
  )
}

function StatusRowItem({ row }: { row: StatusRow }) {
  const [expanded, setExpanded] = useState(false)
  const chip = priorityChip(row.priority)
  const accent = actionByColor(row.next_action_by)
  const hasDetail = !!(row.next_action || row.next_action_by || row.last_touched)

  return (
    <li
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ cursor: hasDetail ? 'pointer' : 'default', background: 'transparent', border: 'none' }}
        aria-expanded={expanded}
      >
        {/* Left accent bar */}
        <span
          aria-hidden
          style={{
            width: 3,
            height: 18,
            flexShrink: 0,
            background: accent,
            borderRadius: 2,
          }}
        />

        {/* Priority chip */}
        <span
          className="flex-shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: chip.bg,
            color: chip.color,
            letterSpacing: '0.06em',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          {chip.label}
        </span>

        {/* Name */}
        <span
          className="flex-1 min-w-0 text-[14px] leading-tight"
          style={{
            color: AMBIENT_PALETTE.text,
            fontFamily: "'Inter', system-ui, sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
          }}
        >
          {row.name}
        </span>

        {/* Next action preview in collapsed state */}
        {!expanded && row.next_action && (
          <span
            className="hidden sm:block flex-shrink truncate text-[12px] max-w-[200px]"
            style={{ color: AMBIENT_PALETTE.textDim }}
          >
            {row.next_action}
          </span>
        )}

        {/* Action-by badge */}
        {row.next_action_by && (
          <span
            className="flex-shrink-0 text-[9px] uppercase"
            style={{
              color: accent,
              letterSpacing: '0.18em',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            {row.next_action_by}
          </span>
        )}

        {/* Expand chevron */}
        {hasDetail && (
          <span
            aria-hidden
            style={{
              fontSize: 10,
              color: AMBIENT_PALETTE.textDim,
              opacity: 0.5,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 180ms ease',
              display: 'inline-block',
              flexShrink: 0,
            }}
          >
            ▾
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div
          className="px-4 pb-4 flex flex-col gap-2"
        >
          {row.next_action && (
            <div className="pt-3">
              <div
                className="text-[10px] uppercase mb-1"
                style={{
                  color: AMBIENT_PALETTE.textDim,
                  letterSpacing: '0.18em',
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  opacity: 0.6,
                }}
              >
                next action
              </div>
              <p
                className="text-[13.5px] leading-relaxed"
                style={{
                  color: AMBIENT_PALETTE.text,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                {row.next_action}
              </p>
            </div>
          )}

          {row.last_touched && (
            <div
              className="text-[10px]"
              style={{
                color: AMBIENT_PALETTE.textDim,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                opacity: 0.55,
              }}
            >
              last touched {new Date(row.last_touched).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
