/**
 * ForksPill + ForksDrawer — ambient view of parallel OS sub-sessions.
 *
 * Tate's directive: "way to track multiple tracks running concurrently … make
 * sure the central one isn't being overloaded with context or getting
 * distracted, just handling goals, positions, results, next steps".
 *
 * This panel is the user-facing answer to that. It shows live forks (and a
 * short tail of recently-finished ones) with their current position string,
 * tool count, token usage, and a manual abort. The conductor's chat stream is
 * NEVER cluttered with fork transcripts — those live here only.
 *
 * Style mirrors QueuePill / QueueDrawer (same project, ambient green).
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Square, X, Activity, Brain } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForksStore, selectActiveForks, selectRecentForks, type ForkSnapshot } from '@/store/forksStore'
import { listForks, abortFork } from '@/api/osSession'

// ── Pill ────────────────────────────────────────────────────────────────────
export function ForksPill({ onClick, drawerOpen }: { onClick: () => void; drawerOpen: boolean }) {
  // Bootstrap from REST so the pill shows up correctly on initial load even
  // before the first WS event arrives. WS keeps it live thereafter, so polling
  // is just an idle backstop.
  const setAll = useForksStore((s) => s.setAll)
  const { data } = useQuery({
    queryKey: ['os-forks'],
    queryFn: listForks,
    refetchInterval: drawerOpen ? false : 60_000,
    staleTime: 30_000,
    retry: 1,
  })
  useEffect(() => {
    if (data?.live) setAll(data.live)
  }, [data, setAll])

  const forks = useForksStore((s) => s.forks)
  const active = useMemo(() => selectActiveForks(forks), [forks])
  const count = active.length

  if (count === 0) return null

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onClick={onClick}
      className="relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono"
      style={{
        background: 'rgba(212,175,55,0.15)',
        border: '1px solid rgba(251,191,36,0.32)',
        color: '#FBBF24',
      }}
      aria-label={`${count} forks running`}
    >
      <GitBranch className="h-3 w-3 flex-shrink-0" strokeWidth={1.75} />
      <span>{count} fork{count === 1 ? '' : 's'} live</span>
      {/* Subtle running-pulse — drawing the eye to active parallelism. */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: 'rgba(212,175,55,0.10)' }}
        animate={{ opacity: [0.0, 0.6, 0.0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.button>
  )
}

// ── Drawer row ──────────────────────────────────────────────────────────────
function ForkRow({ fork, onAfterAbort }: { fork: ForkSnapshot; onAfterAbort: () => void }) {
  const [aborting, setAborting] = useState(false)
  const isActive = fork.status === 'spawning' || fork.status === 'running' || fork.status === 'reporting'

  const ageSec = useMemo(() => {
    if (!fork.started_at) return 0
    const ended = fork.ended_at ? new Date(fork.ended_at).getTime() : Date.now()
    return Math.max(0, Math.round((ended - new Date(fork.started_at).getTime()) / 1000))
  }, [fork.started_at, fork.ended_at])

  async function handleAbort() {
    if (aborting) return
    setAborting(true)
    try {
      await abortFork(fork.fork_id)
    } finally {
      setAborting(false)
      onAfterAbort()
    }
  }

  const statusColor =
    fork.status === 'done'    ? '#2ECC71' :
    fork.status === 'error'   ? '#F87171' :
    fork.status === 'aborted' ? '#FBBF24' :
                                '#F59E0B'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-xl px-3 py-2.5 text-[12px] font-mono"
      style={{
        background: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isActive ? 'rgba(251,191,36,0.30)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex h-2 w-2 rounded-full flex-shrink-0"
            style={{
              background: statusColor,
              boxShadow: isActive ? `0 0 6px ${statusColor}` : 'none',
            }}
          />
          <span className="truncate" style={{ color: '#e8dfd0' }}>
            {fork.fork_id}
          </span>
          <span className="text-[10px]" style={{ color: '#a89e8e' }}>
            [{fork.status}]
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px]" style={{ color: '#a89e8e' }}>
            {ageSec}s · {fork.tool_calls} tool{fork.tool_calls === 1 ? '' : 's'} · {fork.tokens_input + fork.tokens_output} tok
          </span>
          {isActive && (
            <button
              onClick={handleAbort}
              disabled={aborting}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] hover:bg-red-900/20 disabled:opacity-40"
              style={{ color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}
              title="Abort fork"
            >
              <Square className="h-2.5 w-2.5" strokeWidth={2} />
              {aborting ? 'aborting…' : 'abort'}
            </button>
          )}
        </div>
      </div>

      {/* Brief — what the fork is doing */}
      <div className="mt-1.5 text-[11px]" style={{ color: '#a89e8e' }}>
        <span style={{ color: '#6b6560' }}>brief:</span> {fork.brief.length > 200 ? fork.brief.slice(0, 200) + '…' : fork.brief}
      </div>

      {/* Position — current state. The "ambient signal" Tate asked for. */}
      {fork.position && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11px]" style={{ color: '#c8bfb0' }}>
          <Activity className="h-3 w-3 flex-shrink-0 mt-[2px]" strokeWidth={1.75} style={{ color: statusColor }} />
          <span className="truncate">{fork.position}</span>
        </div>
      )}

      {/* Final result — only on done */}
      {fork.status === 'done' && fork.result && (
        <div className="mt-2 rounded-md px-2 py-1.5 text-[11px]" style={{ background: 'rgba(27,122,61,0.18)', color: '#5FE89D' }}>
          <div className="text-[9px] uppercase tracking-wide opacity-70">report</div>
          <div className="mt-0.5 leading-relaxed">{fork.result}</div>
          {fork.next_step && (
            <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: 'rgba(46,204,113,0.25)' }}>
              <span className="text-[9px] uppercase tracking-wide opacity-70">next step</span>
              <div className="mt-0.5">{fork.next_step}</div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {(fork.status === 'error' || fork.status === 'aborted') && fork.abort_reason && (
        <div className="mt-2 text-[11px]" style={{ color: '#F87171' }}>
          {fork.status === 'aborted' ? 'aborted' : 'error'}: {fork.abort_reason}
        </div>
      )}
    </motion.div>
  )
}

// ── Drawer ──────────────────────────────────────────────────────────────────
export function ForksDrawer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const forks = useForksStore((s) => s.forks)
  const active = useMemo(() => selectActiveForks(forks), [forks])
  const recent = useMemo(() => selectRecentForks(forks), [forks])

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['os-forks'] })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,0.18)' }}
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
        className="relative h-full w-[420px] max-w-[92vw] overflow-y-auto shadow-2xl"
        style={{ background: '#1a1c1a' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Parallel forks"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b" style={{ background: '#1a1c1a', borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" strokeWidth={1.75} style={{ color: '#FBBF24' }} />
            <span className="text-[13px] font-medium" style={{ color: '#e8dfd0' }}>
              Parallel forks
            </span>
            <span className="text-[10px] font-mono" style={{ color: '#a89e8e' }}>
              {active.length} live · {recent.length} recent
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} style={{ color: '#a89e8e' }} />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-2.5">
          {active.length === 0 && recent.length === 0 && (
            <div className="text-[12px] py-8 text-center" style={{ color: '#a89e8e' }}>
              No forks running. Spawn one with{' '}
              <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'rgba(255,255,255,0.08)', color: '#5FE89D' }}>
                POST /api/os-session/fork
              </code>
            </div>
          )}

          {active.length > 0 && (
            <>
              <div className="px-1 text-[10px] uppercase tracking-wider" style={{ color: '#a89e8e' }}>
                Live
              </div>
              <AnimatePresence>
                {active.map((f) => (
                  <ForkRow key={f.fork_id} fork={f} onAfterAbort={refresh} />
                ))}
              </AnimatePresence>
            </>
          )}

          {recent.length > 0 && (
            <>
              <div className="mt-3 px-1 text-[10px] uppercase tracking-wider" style={{ color: '#a89e8e' }}>
                Recently finished
              </div>
              <AnimatePresence>
                {recent.map((f) => (
                  <ForkRow key={f.fork_id} fork={f} onAfterAbort={refresh} />
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}
