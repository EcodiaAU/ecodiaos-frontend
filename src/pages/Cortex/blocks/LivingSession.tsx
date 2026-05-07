/**
 * LivingSession — Factory sessions as living entities.
 *
 * Sessions are not terminal emulators or status cards. They are processes
 * being born, working, and completing.
 *
 * Birth: Emergence sequence — single point of light expanding into a lifeline
 * Living: Narrative distillation + pulse line showing effort
 * Completion: Crystallization — pulse freezes, thread shifts green, summary appears
 * Failure: Error as scar — thread turns red, Cortex auto-diagnoses
 *
 * Expand-on-interest: collapsed = narration + pulse
 * Hover/tap = structured activity log (Read path, Edit path, Bash command)
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Square, ChevronDown, ChevronUp,
  GitBranch, Rocket, DollarSign, Wrench,
  FileText, Terminal, MessageSquare, AlertCircle, Cpu, Monitor,
} from 'lucide-react'
import { useCortexStore } from '@/store/cortexStore'
import { getSessionLogs, stopSession } from '@/api/claudeCode'
import { distillOutput, type DistilledState, type ActivityEntry } from '@/lib/distillation'
import { formatRelative } from '@/lib/utils'
import type { CCSessionBlock as CCSessionBlockType } from '@/types/cortex'
import type { CCSessionLog } from '@/types/claudeCode'

// ─── Pipeline stages as left accent colors ───────────────────────────
const STAGE_COLORS: Record<string, string> = {
  queued: 'rgba(27, 122, 61, 0.15)',
  context: 'rgba(27, 122, 61, 0.15)',
  executing: 'rgba(0, 104, 122, 0.25)',
  testing: 'rgba(200, 145, 10, 0.3)',
  reviewing: 'rgba(46, 204, 113, 0.3)',
  awaiting_review: 'rgba(200, 145, 10, 0.35)',
  deploying: 'rgba(200, 145, 10, 0.25)',
  deployed: 'rgba(46, 204, 113, 0.3)',
  complete: 'rgba(46, 204, 113, 0.2)',
  failed: 'rgba(200, 145, 10, 0.3)',
  error: 'rgba(200, 145, 10, 0.35)',
}

// ─── Pulse Line — 60-segment histogram of output density ─────────────
function PulseLine({ histogram, frozen, error }: { histogram: number[]; frozen: boolean; error: boolean }) {
  const segments = histogram.length
  const barW = 100 / segments

  return (
    <div className="flex items-end h-3 gap-px w-full">
      {histogram.map((v, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          style={{
            width: `${barW}%`,
            minWidth: 1,
            backgroundColor: error
              ? `rgba(200, 145, 10, ${0.1 + v * 0.3})`
              : `rgba(0, 104, 122, ${0.06 + v * 0.2})`,
          }}
          animate={{
            height: `${Math.max(1, v * 12)}px`,
            opacity: frozen ? 0.3 : 0.6 + v * 0.4,
          }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        />
      ))}
    </div>
  )
}

// ─── Activity Log Entry ──────────────────────────────────────────────
const ACTIVITY_ICONS: Record<ActivityEntry['kind'], React.ReactNode> = {
  read: <FileText className="h-2.5 w-2.5" strokeWidth={1.5} />,
  edit: <Wrench className="h-2.5 w-2.5" strokeWidth={1.5} />,
  bash: <Terminal className="h-2.5 w-2.5" strokeWidth={1.5} />,
  thought: <MessageSquare className="h-2.5 w-2.5" strokeWidth={1.5} />,
  test: <Cpu className="h-2.5 w-2.5" strokeWidth={1.5} />,
  error: <AlertCircle className="h-2.5 w-2.5" strokeWidth={1.5} />,
  cost: <DollarSign className="h-2.5 w-2.5" strokeWidth={1.5} />,
  tool: <Wrench className="h-2.5 w-2.5" strokeWidth={1.5} />,
  system: <Monitor className="h-2.5 w-2.5" strokeWidth={1.5} />,
}

function ActivityLogEntry({ entry }: { entry: ActivityEntry }) {
  return (
    <div className={`flex items-start gap-2 text-[11px] leading-snug ${
      entry.kind === 'error' ? 'text-tertiary/60' :
      entry.kind === 'thought' ? 'text-on-surface-variant/70 italic' :
      'text-on-surface-muted/40 font-mono'
    }`}>
      <span className="flex-shrink-0 mt-0.5 text-on-surface-muted/30">{ACTIVITY_ICONS[entry.kind]}</span>
      <span className="truncate">{entry.content}</span>
    </div>
  )
}

// ─── Living Session Component ────────────────────────────────────────
export function LivingSession({ block }: { block: CCSessionBlockType }) {
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [born, setBorn] = useState(false)

  const session = useCortexStore(s => s.inlineSessions.get(block.sessionId))

  const { data: logs } = useQuery({
    queryKey: ['ccLogs', block.sessionId],
    queryFn: () => getSessionLogs(block.sessionId, { limit: 500 }),
    enabled: !!block.sessionId,
  })

  const stop = useMutation({ mutationFn: () => stopSession(block.sessionId) })

  const allChunks = useMemo(() => [
    ...(logs?.logs.map((l: CCSessionLog) => l.chunk) ?? []),
    ...(session?.output ?? []),
  ], [logs, session?.output])

  const distilled: DistilledState = useMemo(
    () => distillOutput(allChunks, session?.pipeline_stage ?? null),
    [allChunks, session?.pipeline_stage],
  )

  // Birth animation — delay appearance
  useEffect(() => {
    const t = setTimeout(() => setBorn(true), 200)
    return () => clearTimeout(t)
  }, [])

  // Auto-scroll log
  useEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [distilled.activities.length, expanded])

  const status = session?.status ?? 'initializing'
  const stage = session?.pipeline_stage ?? 'queued'
  const isActive = status === 'running' || status === 'initializing'
  const isComplete = status === 'complete' || stage === 'complete' || stage === 'deployed'
  const hasError = status === 'error' || stage === 'error' || stage === 'failed'
  const isAwaiting = status === 'awaiting_input'
  const accentColor = STAGE_COLORS[stage] ?? STAGE_COLORS.executing

  // ─── Awaiting Input: Three-Phase Escalation ───────────────────────
  // Pause (0-30s) → Glow (30-120s) → Surface (120s+)
  const [awaitPhase, setAwaitPhase] = useState<'pause' | 'glow' | 'surface'>('pause')
  const awaitStartRef = useRef<number>(0)
  const surfacedRef = useRef(false)

  useEffect(() => {
    if (!isAwaiting) {
      setAwaitPhase('pause')
      awaitStartRef.current = 0
      surfacedRef.current = false
      return
    }

    if (awaitStartRef.current === 0) awaitStartRef.current = Date.now()

    const tick = setInterval(() => {
      const elapsed = (Date.now() - awaitStartRef.current) / 1000
      if (elapsed >= 120 && !surfacedRef.current) {
        setAwaitPhase('surface')
        surfacedRef.current = true
        // Surface the question to Cortex — dispatch event so Cortex speaks it
        window.dispatchEvent(new CustomEvent('ecodia:session-awaiting-surface', {
          detail: {
            sessionId: block.sessionId,
            question: distilled.narrative,
            title: block.title,
          },
        }))
      } else if (elapsed >= 30) {
        setAwaitPhase('glow')
      }
    }, 1000)

    return () => clearInterval(tick)
  }, [isAwaiting, block.sessionId, block.title, distilled.narrative])

  const toggleExpand = useCallback(() => setExpanded(v => !v), [])

  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.3, originX: 0 }}
      animate={{
        opacity: born ? 1 : 0,
        scaleX: born ? 1 : 0.3,
      }}
      transition={{ type: 'spring', stiffness: 70, damping: 20, mass: 1.1 }}
      className="relative overflow-hidden rounded-2xl"
      style={{
        // Crystallized sessions settle to 70% opacity
        opacity: isComplete ? 0.7 : 1,
      }}
    >
      {/* Left accent bar — color shifts by pipeline stage */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        animate={{
          backgroundColor: accentColor,
          opacity: isComplete ? 0.5 : 1,
        }}
        transition={{ type: 'spring', stiffness: 60, damping: 18 }}
      />

      {/* Deploying pulse — amber radial glow at edges */}
      <AnimatePresence>
        {stage === 'deploying' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.03, 0.08, 0.03] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(200, 145, 10, 0.08), transparent 70%)' }}
          />
        )}
      </AnimatePresence>

      {/* Awaiting input — 3-phase escalating glow */}
      <AnimatePresence>
        {isAwaiting && awaitPhase === 'pause' && (
          <motion.div
            key="await-pause"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.02, 0.06, 0.02] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(200, 145, 10, 0.06), transparent 70%)' }}
          />
        )}
        {isAwaiting && awaitPhase === 'glow' && (
          <motion.div
            key="await-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.04, 0.12, 0.04] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(200, 145, 10, 0.12), transparent 65%)' }}
          />
        )}
        {isAwaiting && awaitPhase === 'surface' && (
          <motion.div
            key="await-surface"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.06, 0.18, 0.06] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(200, 145, 10, 0.18), transparent 60%)' }}
          />
        )}
      </AnimatePresence>

      <div className={`pl-4 ${isComplete ? 'bg-secondary/[0.03]' : hasError ? 'bg-tertiary/[0.03]' : 'glass'}`}>
        {/* Header — purpose + narration */}
        <button
          onClick={toggleExpand}
          className="flex w-full items-center gap-3 px-4 py-3 text-left group"
        >
          {/* Lifeline dot — status indicator */}
          <div className="relative flex-shrink-0">
            <motion.div
              className="h-2 w-2 rounded-full"
              animate={{
                backgroundColor: isComplete
                  ? 'rgba(46, 204, 113, 0.6)'
                  : hasError
                    ? 'rgba(200, 145, 10, 0.6)'
                    : isAwaiting
                      ? 'rgba(200, 145, 10, 0.5)'
                      : 'rgba(0, 104, 122, 0.5)',
                scale: isActive ? [1, 1.3, 1] : 1,
              }}
              transition={isActive ? { duration: 2, repeat: Infinity } : { type: 'spring', stiffness: 80, damping: 18 }}
            />
          </div>

          {/* Purpose + narrative */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-on-surface truncate leading-snug flex items-center gap-1.5">
              {block.title}
              {/* Notification dot for glow/surface phases */}
              {isAwaiting && awaitPhase !== 'pause' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, opacity: awaitPhase === 'surface' ? [0.6, 1, 0.6] : [0.4, 0.7, 0.4] }}
                  transition={awaitPhase === 'surface'
                    ? { duration: 1.2, repeat: Infinity }
                    : { duration: 2, repeat: Infinity }
                  }
                  className="inline-block h-1.5 w-1.5 rounded-full bg-tertiary/70 flex-shrink-0"
                />
              )}
            </p>
            <motion.p
              key={distilled.narrative}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
              className="text-[11px] text-on-surface-muted/50 mt-0.5 truncate font-mono"
            >
              {distilled.narrative}
            </motion.p>
          </div>

          {/* Metadata badges */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {session?.commit_sha && (
              <span className="flex items-center gap-1 text-[10px] text-secondary/50 font-mono">
                <GitBranch className="h-2.5 w-2.5" strokeWidth={1.5} />
                {session.commit_sha.slice(0, 7)}
              </span>
            )}
            {session?.deploy_status === 'deployed' && (
              <span className="flex items-center gap-1 text-[10px] text-tertiary/60 font-mono">
                <Rocket className="h-2.5 w-2.5" strokeWidth={1.5} />
              </span>
            )}
            {distilled.costUsd != null && distilled.costUsd > 0 && (
              <span className="text-[10px] text-on-surface-muted/55 font-mono">
                ${distilled.costUsd.toFixed(2)}
              </span>
            )}
            {session?.started_at && (
              <span className="text-[10px] text-on-surface-muted/55 font-mono">
                {formatRelative(session.started_at)}
              </span>
            )}

            {/* Stop button */}
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); stop.mutate() }}
                className="flex items-center gap-1 rounded-lg bg-tertiary/8 px-2 py-1 text-[10px] text-tertiary/70 hover:bg-tertiary/15 transition-colors"
              >
                <Square className="h-2.5 w-2.5" strokeWidth={2} /> Stop
              </button>
            )}

            <div className="text-on-surface-muted/45 group-hover:text-on-surface-muted/70 transition-colors">
              {expanded ? <ChevronUp className="h-3 w-3" strokeWidth={1.75} /> : <ChevronDown className="h-3 w-3" strokeWidth={1.75} />}
            </div>
          </div>
        </button>

        {/* Pulse line — always visible when collapsed */}
        {!expanded && (
          <div className="px-4 pb-3 -mt-1">
            <PulseLine
              histogram={distilled.pulseHistogram}
              frozen={isComplete || hasError}
              error={hasError}
            />
          </div>
        )}

        {/* Expanded: structured activity log */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 90, damping: 22 }}
              className="overflow-hidden"
            >
              <div className="border-t border-black/[0.04]">
                {/* Pulse line at top of expanded view */}
                <div className="px-4 pt-3 pb-2">
                  <PulseLine
                    histogram={distilled.pulseHistogram}
                    frozen={isComplete || hasError}
                    error={hasError}
                  />
                </div>

                {/* Activity log */}
                <div
                  ref={logRef}
                  className="max-h-[35vh] min-h-[40px] overflow-y-auto px-4 pb-4 space-y-1 scrollbar-thin"
                >
                  {distilled.activities.length === 0 && (
                    <div className="text-on-surface-muted/30 text-xs">
                      {isActive
                        ? <span className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary/30 animate-pulse" />
                            Working...
                          </span>
                        : hasError
                          ? <span className="text-tertiary/40">{distilled.error || 'Session failed.'}</span>
                          : <span>No activity recorded.</span>
                      }
                    </div>
                  )}

                  {distilled.activities.map((entry, i) => (
                    <ActivityLogEntry key={i} entry={entry} />
                  ))}

                  {isActive && distilled.activities.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 text-on-surface-muted/50">
                      <div className="h-1 w-1 rounded-full bg-secondary/40 animate-pulse" />
                      <span className="text-[9px] font-mono uppercase tracking-widest">live</span>
                    </div>
                  )}
                </div>

                {/* Completion summary — crystallized */}
                {isComplete && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.2 }}
                    className="px-4 pb-3 border-t border-black/[0.03]"
                  >
                    <div className="flex items-center gap-3 py-2">
                      <span className="text-[11px] font-mono text-secondary/50">
                        {distilled.filesEdited.length > 0 && `${distilled.filesEdited.length} files`}
                        {distilled.testsPassed > 0 && ` · ${distilled.testsPassed} passed`}
                        {distilled.costUsd != null && ` · $${distilled.costUsd.toFixed(2)}`}
                      </span>
                      {session?.commit_sha && (
                        <span className="text-[10px] font-mono text-secondary/40 bg-secondary/[0.06] px-2 py-0.5 rounded-lg">
                          {session.commit_sha.slice(0, 8)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
