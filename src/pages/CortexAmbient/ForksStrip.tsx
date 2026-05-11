import { useState } from 'react'
import { type ForkRow } from './useForks'
import { AMBIENT_PALETTE, forkStatusColor } from './palette'

interface ForksStripProps {
  forks: ForkRow[]
  layout?: 'horizontal' | 'vertical'
}

const RUNNING = new Set(['spawning', 'running', 'reporting'])

function shortId(id: string | null | undefined): string {
  if (!id) return '------'
  return String(id).slice(-6)
}

function formatAge(startedAt: string | null | undefined): string {
  if (!startedAt) return ''
  const t = new Date(startedAt).getTime()
  if (!Number.isFinite(t)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.floor(diffHr / 24)}d`
}

function sortForks(forks: ForkRow[]): ForkRow[] {
  const score = (f: ForkRow): number => {
    const s = String(f.status)
    if (s === 'running' || s === 'reporting') return 0
    if (s === 'spawning') return 1
    if (s === 'error' || s === 'aborted') return 2
    return 3
  }
  return [...forks].sort((a, b) => {
    const da = score(a)
    const db = score(b)
    if (da !== db) return da - db
    const aT = new Date(a.started_at || a.last_heartbeat || 0).getTime()
    const bT = new Date(b.started_at || b.last_heartbeat || 0).getTime()
    return bT - aT
  })
}

export function ForksStrip({ forks, layout = 'horizontal' }: ForksStripProps) {
  const sorted = sortForks(forks)

  if (sorted.length === 0) {
    return (
      <div
        className="px-4 py-3 text-[13px]"
        style={{
          color: AMBIENT_PALETTE.textDim,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          letterSpacing: '0.04em',
        }}
      >
        no forks running. quiet horizon.
      </div>
    )
  }

  if (layout === 'vertical') {
    return (
      <div className="flex flex-col gap-2 px-4">
        {sorted.map((f) => (
          <ForkCard key={f.fork_id} fork={f} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4">
      {sorted.map((f) => (
        <ForkCard key={f.fork_id} fork={f} />
      ))}
    </div>
  )
}

function ForkCard({ fork }: { fork: ForkRow }) {
  const [expanded, setExpanded] = useState(false)
  const statusStr = String(fork.status)
  const { color } = forkStatusColor(statusStr)
  const isRunning = RUNNING.has(statusStr)
  const parentId = fork.parent_fork_id ?? fork.parent_id ?? null
  const showParent = !!parentId && parentId !== fork.fork_id
  const hasBrief = !!fork.brief?.trim()

  const statusBg: Record<string, string> = {
    running: 'rgba(46,204,113,0.08)',
    reporting: 'rgba(46,204,113,0.08)',
    spawning: 'rgba(251,191,36,0.07)',
    error: 'rgba(248,113,113,0.08)',
    aborted: 'rgba(248,113,113,0.06)',
    done: 'rgba(255,255,255,0.03)',
    complete: 'rgba(255,255,255,0.03)',
  }

  return (
    <article
      className="ambient-fork-card w-full rounded-lg overflow-hidden"
      style={{
        background: statusBg[statusStr] ?? 'rgba(255,255,255,0.03)',
        border: `1px solid ${isRunning ? 'rgba(46,204,113,0.18)' : 'rgba(255,255,255,0.07)'}`,
        transition: 'border-color 200ms ease',
      }}
      role="article"
      aria-label={`fork ${shortId(fork.fork_id)} ${statusStr}`}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ cursor: hasBrief ? 'pointer' : 'default', background: 'transparent', border: 'none' }}
        aria-expanded={expanded}
      >
        {/* Status dot */}
        <span
          className="flex-shrink-0 inline-block"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
            boxShadow: isRunning ? `0 0 8px ${color}` : 'none',
            animation: isRunning ? 'ambient-fork-pulse 2.4s ease-in-out infinite' : 'none',
          }}
          aria-hidden
        />

        {/* Fork ID */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            color: AMBIENT_PALETTE.textDim,
            letterSpacing: '0.08em',
            flexShrink: 0,
          }}
        >
          {shortId(fork.fork_id)}
        </span>

        {/* Status badge */}
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color,
            opacity: 0.85,
            flexShrink: 0,
          }}
        >
          {statusStr}
        </span>

        {/* Brief preview — truncated in collapsed state */}
        {hasBrief && !expanded && (
          <span
            className="flex-1 min-w-0 truncate text-[13px]"
            style={{ color: AMBIENT_PALETTE.text, opacity: 0.7 }}
          >
            {fork.brief}
          </span>
        )}

        <span className="ml-auto flex items-center gap-3 flex-shrink-0">
          {/* Age */}
          <span
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 11,
              color: AMBIENT_PALETTE.textDim,
            }}
          >
            {formatAge(fork.started_at)}
          </span>

          {/* Expand chevron — only when there's content to expand */}
          {hasBrief && (
            <span
              aria-hidden
              style={{
                fontSize: 10,
                color: AMBIENT_PALETTE.textDim,
                opacity: 0.5,
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 180ms ease',
                display: 'inline-block',
              }}
            >
              ▾
            </span>
          )}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && hasBrief && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p
            className="text-[13.5px] leading-relaxed pt-3"
            style={{
              color: AMBIENT_PALETTE.text,
              fontFamily: "'Inter', system-ui, sans-serif",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {fork.brief}
          </p>

          {showParent && (
            <div
              className="mt-3 text-[10px] uppercase"
              style={{
                color: AMBIENT_PALETTE.textDim,
                letterSpacing: '0.18em',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              ↳ sub-fork of {shortId(parentId)}
            </div>
          )}

          {fork.last_heartbeat && (
            <div
              className="mt-1 text-[10px]"
              style={{
                color: AMBIENT_PALETTE.textDim,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                opacity: 0.6,
              }}
            >
              last heartbeat {new Date(fork.last_heartbeat).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes ambient-fork-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-fork-card [style*="ambient-fork-pulse"] { animation: none !important; opacity: 0.85 !important; }
        }
      `}</style>
    </article>
  )
}
