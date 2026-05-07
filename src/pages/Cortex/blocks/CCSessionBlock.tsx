/**
 * Inline CC session — ambient glass element in the Cortex stream.
 *
 * NOT a dark terminal. This is a native element of the light ambient OS.
 * Collapsible, shows what the Factory is doing as structured output,
 * and fades into the background when complete.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronUp, Square,
  Loader2, CheckCircle2, XCircle, Clock, DollarSign,
  GitBranch, Rocket, Wrench,
} from 'lucide-react'
import { useCortexStore } from '@/store/cortexStore'
import { getSessionLogs, stopSession } from '@/api/claudeCode'
import type { CCSessionBlock as CCSessionBlockType } from '@/types/cortex'
import type { CCSessionLog } from '@/types/claudeCode'
import { formatRelative } from '@/lib/utils'

// ─── Lightweight output parser ────────────────────────────────────────────────
// Only extracts assistant text + tool names. No full terminal emulation.

interface OutputLine {
  kind: 'text' | 'tool' | 'error' | 'cost'
  content: string
}

function extractJsonObjects(raw: string): unknown[] {
  const objects: unknown[] = []
  let depth = 0, start = -1
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (raw[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try { objects.push(JSON.parse(raw.slice(start, i + 1))) } catch { /* skip */ }
        start = -1
      }
    }
  }
  return objects
}

function parseOutput(chunks: string[]): OutputLine[] {
  const lines: OutputLine[] = []
  const raw = chunks.join('')
  const objects = extractJsonObjects(raw)

  if (objects.length > 0) {
    for (const obj of objects) {
      const msg = obj as Record<string, unknown>
      if (msg.type === 'system' || msg.type === 'rate_limit_event') continue

      if (msg.type === 'assistant') {
        const message = msg.message as Record<string, unknown> | undefined
        if (message?.content) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block.type === 'text' && typeof block.text === 'string') {
              const text = block.text.trim()
              if (text) lines.push({ kind: 'text', content: text })
            } else if (block.type === 'tool_use') {
              lines.push({ kind: 'tool', content: String(block.name || 'tool') })
            }
          }
        }
      }
      if (msg.type === 'result') {
        const result = typeof msg.result === 'string' ? msg.result.trim() : null
        if (result) lines.push({ kind: 'text', content: result })
        if (typeof msg.total_cost_usd === 'number') {
          lines.push({ kind: 'cost', content: `$${(msg.total_cost_usd as number).toFixed(4)}` })
        }
      }
    }
    if (lines.length > 0) return lines
  }

  // Fallback: plain text, skip noise
  const stripped = raw.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '')
  for (const line of stripped.split('\n')) {
    const t = line.trim()
    if (!t || /^[\s─═┌┐└┘│├┤┬┴┼]+$/.test(t) || /^\.{3,}$/.test(t)) continue
    if (t.match(/^(Error:|error:|ERR)/)) lines.push({ kind: 'error', content: t })
    else lines.push({ kind: 'text', content: t })
  }
  return lines
}

// ─── Pipeline dots ────────────────────────────────────────────────────────────

const STAGES = ['queued', 'context', 'executing', 'testing', 'reviewing', 'awaiting_review', 'deploying', 'complete'] as const

function PipelineDots({ stage }: { stage: string }) {
  const idx = STAGES.indexOf(stage as typeof STAGES[number])
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((_, i) => (
        <div key={i} className={`h-1 w-1 rounded-full transition-colors ${
          i < idx ? 'bg-secondary/50' : i === idx ? 'bg-primary/70' : 'bg-on-surface-muted/10'
        }`} />
      ))}
      <span className="ml-1.5 text-[9px] font-mono uppercase tracking-widest text-on-surface-muted/30">{stage}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CCSessionBlock({ block }: { block: CCSessionBlockType }) {
  const [expanded, setExpanded] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  const session = useCortexStore(s => s.inlineSessions.get(block.sessionId))

  const { data: logs } = useQuery({
    queryKey: ['ccLogs', block.sessionId],
    queryFn: () => getSessionLogs(block.sessionId, { limit: 10000 }),  // Full session trace
    enabled: !!block.sessionId,
  })

  const stop = useMutation({ mutationFn: () => stopSession(block.sessionId) })

  const allChunks = useMemo(() => [
    ...(logs?.logs.map((l: CCSessionLog) => l.chunk) ?? []),
    ...(session?.output ?? []),
  ], [logs, session?.output])

  const parsed = useMemo(() => parseOutput(allChunks), [allChunks])

  // Only show the last few lines as a summary when collapsed
  const summaryLines = parsed.slice(-3)
  const toolCount = parsed.filter(l => l.kind === 'tool').length

  useEffect(() => {
    if (expanded && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [parsed.length, expanded])

  const status = session?.status ?? 'initializing'
  const isActive = status === 'running' || status === 'initializing'
  const isComplete = status === 'complete'
  const hasError = status === 'error'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 80, damping: 20 }}
      className={`rounded-2xl overflow-hidden transition-colors ${
        isComplete ? 'bg-secondary/[0.04]' : hasError ? 'bg-error/[0.04]' : 'glass'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left group"
      >
        {/* Status icon */}
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/6 flex-shrink-0">
          {isActive
            ? <Loader2 className="h-3 w-3 animate-spin text-primary/60" strokeWidth={1.75} />
            : isComplete
              ? <CheckCircle2 className="h-3 w-3 text-secondary/70" strokeWidth={1.75} />
              : hasError
                ? <XCircle className="h-3 w-3 text-error/60" strokeWidth={1.75} />
                : <Wrench className="h-3 w-3 text-on-surface-muted/40" strokeWidth={1.75} />
          }
        </div>

        {/* Title + metadata */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface truncate">{block.title}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {session?.pipeline_stage && <PipelineDots stage={session.pipeline_stage} />}
            {toolCount > 0 && (
              <span className="text-[10px] font-mono text-on-surface-muted/30">{toolCount} tools</span>
            )}
            {session?.started_at && (
              <span className="flex items-center gap-1 text-[10px] text-on-surface-muted/30 font-mono">
                <Clock className="h-2.5 w-2.5" strokeWidth={1.5} />
                {formatRelative(session.started_at)}
              </span>
            )}
            {session?.cc_cost_usd != null && session.cc_cost_usd > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-on-surface-muted/30 font-mono">
                <DollarSign className="h-2.5 w-2.5" strokeWidth={1.5} />
                {session.cc_cost_usd.toFixed(4)}
              </span>
            )}
            {session?.commit_sha && (
              <span className="flex items-center gap-1 text-[10px] text-secondary/50 font-mono">
                <GitBranch className="h-2.5 w-2.5" strokeWidth={1.5} />
                {session.commit_sha.slice(0, 7)}
              </span>
            )}
            {session?.deploy_status === 'deployed' && (
              <span className="flex items-center gap-1 text-[10px] text-tertiary/60 font-mono">
                <Rocket className="h-2.5 w-2.5" strokeWidth={1.5} />
                deployed
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); stop.mutate() }}
              className="flex items-center gap-1 rounded-lg bg-error/8 px-2 py-1 text-[10px] text-error/70 hover:bg-error/15 transition-colors"
            >
              <Square className="h-2.5 w-2.5" strokeWidth={2} /> Stop
            </button>
          )}
          <div className="text-on-surface-muted/45 group-hover:text-on-surface-muted/70 transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.75} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />}
          </div>
        </div>
      </button>

      {/* Collapsed summary — show last few lines as ambient whisper */}
      {!expanded && summaryLines.length > 0 && (
        <div className="px-5 pb-3 -mt-1">
          <div className="space-y-0.5">
            {summaryLines.map((line, i) => (
              <p key={i} className={`text-[11px] leading-snug truncate ${
                line.kind === 'tool' ? 'text-on-surface-muted/55 font-mono' :
                line.kind === 'error' ? 'text-error/40' :
                line.kind === 'cost' ? 'text-on-surface-muted/50 font-mono' :
                'text-on-surface-muted/40'
              }`}>
                {line.kind === 'tool' ? `› ${line.content}` : line.content}
              </p>
            ))}
          </div>
          {isActive && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-primary/30 animate-pulse" />
              <span className="text-[9px] font-mono uppercase tracking-widest text-on-surface-muted/55">live</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded output — full log, still ambient (not dark terminal) */}
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
              <div
                ref={outputRef}
                className="max-h-[40vh] min-h-[60px] overflow-y-auto px-5 py-4 space-y-1.5 scrollbar-thin"
              >
                {parsed.map((line, i) => (
                  <div key={i} className={`text-xs leading-relaxed ${
                    line.kind === 'tool' ? 'text-on-surface-muted/30 font-mono' :
                    line.kind === 'error' ? 'text-error/60' :
                    line.kind === 'cost' ? 'text-on-surface-muted/55 font-mono' :
                    'text-on-surface-variant/80'
                  }`}>
                    {line.kind === 'tool'
                      ? <span className="inline-flex items-center gap-1.5"><Wrench className="h-2.5 w-2.5 inline" strokeWidth={1.5} />{line.content}</span>
                      : <span className="whitespace-pre-wrap break-words">{line.content}</span>
                    }
                  </div>
                ))}

                {parsed.length === 0 && (
                  <div className="text-on-surface-muted/30 text-xs">
                    {isActive
                      ? <span className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-primary/30 animate-pulse" />Working...</span>
                      : hasError
                        ? <span className="text-error/40">Session failed.</span>
                        : <span>No output.</span>
                    }
                  </div>
                )}

                {isActive && parsed.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-on-surface-muted/50">
                    <div className="h-1 w-1 rounded-full bg-secondary/40 animate-pulse" />
                    <span className="text-[9px] font-mono uppercase tracking-widest">live</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
