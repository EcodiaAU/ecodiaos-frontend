/**
 * ForksStrip — readable cards of what the entity is currently doing.
 *
 * Round-3, fork_mowtlsvo_95bffd (manager fork_mowtf5s4_82c7f4).
 *
 * Mobile: horizontal scroll-snap strip. Desktop: vertical list.
 * Each card: status pill + last-6-of-fork-id + age, brief preview, parent
 * indicator. No motion noise. Tap = no-op for round-3 (round-4 stretch).
 *
 * Spec §4.2.
 */
import { type ForkRow } from './useForks'
import { AMBIENT_PALETTE, forkStatusColor } from './palette'

interface ForksStripProps {
  forks: ForkRow[]
  layout?: 'horizontal' | 'vertical'
}

const RUNNING = new Set(['spawning', 'running', 'reporting'])

function shortId(id: string | null | undefined): string {
  if (!id) return '------'
  const cleaned = String(id)
  return cleaned.slice(-6)
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

function briefPreview(brief: string | null | undefined): string {
  if (!brief) return ''
  const trimmed = brief.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= 80) return trimmed
  return trimmed.slice(0, 79) + '…'
}

function sortForks(forks: ForkRow[]): ForkRow[] {
  // Running first (most recently started first), then everything else by ended_at desc.
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
          <ForkCard key={f.fork_id} fork={f} layout="vertical" />
        ))}
      </div>
    )
  }

  return (
    <div
      className="ambient-forks-strip flex gap-2 overflow-x-auto pb-2"
      style={{
        scrollSnapType: 'x mandatory',
        paddingLeft: 16,
        paddingRight: 16,
        // Hide ugly default scrollbar on touch surfaces; keep keyboard reachable.
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,178,122,0.18) transparent',
      }}
    >
      {sorted.map((f) => (
        <ForkCard key={f.fork_id} fork={f} layout="horizontal" />
      ))}
      <style>{`
        @keyframes ambient-fork-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ambient-fork-running-dot { animation: none !important; opacity: 0.85 !important; }
        }
      `}</style>
    </div>
  )
}

interface ForkCardProps {
  fork: ForkRow
  layout: 'horizontal' | 'vertical'
}

function ForkCard({ fork, layout }: ForkCardProps) {
  const statusStr = String(fork.status)
  const { color } = forkStatusColor(statusStr)
  const isRunning = RUNNING.has(statusStr)
  const parentId = fork.parent_fork_id ?? fork.parent_id ?? null
  const showParent = !!parentId && parentId !== fork.fork_id

  const baseStyle = {
    background:
      'linear-gradient(180deg, rgba(15,18,24,0.55) 0%, rgba(8,10,14,0.78) 100%)',
    border: `1px solid ${isRunning ? 'rgba(255,178,122,0.28)' : 'rgba(255,255,255,0.06)'}`,
    borderRadius: 6,
    padding: '10px 12px',
    color: AMBIENT_PALETTE.text,
    minHeight: 44,
  } as const

  const sizeStyle =
    layout === 'horizontal'
      ? { width: 240, minWidth: 240, scrollSnapAlign: 'start' as const, height: 96 }
      : { width: '100%', minHeight: 80 }

  return (
    <article
      className="ambient-fork-card flex flex-col justify-between"
      style={{ ...baseStyle, ...sizeStyle }}
      role="article"
      aria-label={`fork ${shortId(fork.fork_id)} ${statusStr}`}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span
          className={`ambient-fork-running-dot inline-block`}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
            boxShadow: isRunning ? `0 0 6px ${color}` : 'none',
            animation: isRunning ? 'ambient-fork-pulse 2.4s ease-in-out infinite' : 'none',
            opacity: isRunning ? 1 : 0.85,
          }}
          aria-hidden
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: AMBIENT_PALETTE.textDim,
            letterSpacing: '0.04em',
          }}
        >
          {shortId(fork.fork_id)}
        </span>
        <span
          className="ml-auto"
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            color: AMBIENT_PALETTE.textDim,
            fontSize: 11,
          }}
        >
          {formatAge(fork.started_at)}
        </span>
      </div>

      <div
        className="mt-1 flex-1 overflow-hidden text-[13px] leading-snug"
        style={{
          color: AMBIENT_PALETTE.text,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {briefPreview(fork.brief) || (
          <span style={{ color: AMBIENT_PALETTE.textDim }}>(no brief)</span>
        )}
      </div>

      {showParent && (
        <div
          className="mt-1 text-[10px] uppercase"
          style={{
            color: AMBIENT_PALETTE.textDim,
            letterSpacing: '0.18em',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          ↳ {shortId(parentId)}
        </div>
      )}
    </article>
  )
}
