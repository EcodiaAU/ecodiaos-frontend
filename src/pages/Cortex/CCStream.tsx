/**
 * CCStream — The Ambient Intelligence Surface.
 *
 * Green + gold. Futuristic. Alive.
 *
 * Tables render like holographic data grids.
 * Code blocks glow like terminal readouts.
 * Tool badges pulse like neural activity.
 * Links shimmer like gold filaments.
 *
 * The system speaks. You observe. Occasionally you approve.
 */
import { useState, useRef, useEffect, useCallback, useMemo, useId, memo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RotateCcw, Brain, ChevronDown,
  Mail, DollarSign, Zap, Activity,
  GitBranch, TrendingUp, Download,
  Paperclip, FileText, X, Trash2, Image as ImageIcon, Square,
  Inbox, ChevronRight,
  AlertTriangle, Wifi, WifiOff, Loader2,
} from 'lucide-react'
// SpatialLayer removed from input area to fix jitter
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from '@/components/MermaidBlock'
import { MessageErrorBoundary } from '@/components/shared/MessageErrorBoundary'
import { useOSSessionStore, type OSSessionMessage, type LiveToolCall, type TurnTelemetry, type InlineBannerEntry } from '@/store/osSessionStore'
import { useConnectionStore } from '@/store/connectionStore'
import { sendOSMessage, restartOS, getOSStatus, recoverResponse, uploadAttachment, abortOS } from '@/api/osSession'
import { listPending, cancelMessage, promoteMessage, updateMessage } from '@/api/messageQueue'
import type { QueuedMessage } from '@/api/messageQueue'
import { getGmailStats } from '@/api/gmail'
import { getFinanceSummary } from '@/api/finance'
import { getActionStats } from '@/api/actions'
import { getMomentum } from '@/api/momentum'
import type { AttachedFile } from '@/types/cortex'

// ─── File helpers ────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readFileAsAttachment(file: File): Promise<AttachedFile> {
  const id = crypto.randomUUID()
  // Read all files as data URL (base64) — images, PDFs, binaries all get a dataUrl
  // which we can later upload to Supabase Storage. Text files get text for inline display.
  if (file.type.startsWith('text/') || file.name.match(/\.(md|txt|csv|json|ts|tsx|js|jsx|py|go|rs|sh|yaml|yml|toml|sql|html|css|xml)$/i)) {
    const text = await file.text()
    return { id, name: file.name, type: file.type || 'text/plain', size: file.size, text }
  }
  // Everything else (images, PDFs, docs, etc.) — read as data URL for upload
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target!.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  return { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl }
}

// ─── Attachment chip ─────────────────────────────────────────────────

function AttachmentChip({ file, onRemove }: { file: AttachedFile; onRemove: () => void }) {
  if (file.dataUrl) {
    return (
      <div className="group relative flex-shrink-0">
        <img src={file.dataUrl} alt={file.name} className="h-14 w-14 rounded-xl object-cover" style={{ border: '1px solid rgba(27,122,61,0.12)' }} />
        <button onClick={onRemove} className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-on-surface text-surface shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <X className="h-2.5 w-2.5" strokeWidth={2.5} />
        </button>
      </div>
    )
  }
  return (
    <div className="group flex items-center gap-2 rounded-xl px-3 py-2 flex-shrink-0" style={{ border: '1px solid rgba(27,122,61,0.10)', background: 'rgba(27,122,61,0.03)' }}>
      <FileText className="h-4 w-4 flex-shrink-0" style={{ color: '#1B7A3D' }} strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="max-w-[120px] truncate text-xs font-medium text-on-surface">{file.name}</p>
        <p className="text-[10px] text-on-surface-muted/50">{formatBytes(file.size)}</p>
      </div>
      <button onClick={onRemove} className="ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-on-surface-muted/40 hover:text-error transition-colors">
        <X className="h-3 w-3" strokeWidth={2} />
      </button>
    </div>
  )
}

// ─── Ghost prompts ──────────────────────────────────────────────────


// ─── Chromatic Vitals — green+gold ambient data ─────────────────────

function ChromaticVital({ icon: Icon, value, label, color, glowColor, delay = 0 }: {
  icon: typeof Mail
  value: string | number
  label: string
  color: string
  glowColor: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 80, damping: 20, delay }}
      className="group relative flex items-center gap-2.5 rounded-2xl px-4 py-2.5 holo-border"
      style={{
        background: `linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.40))`,
        boxShadow: `0 8px 24px -8px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.4)`,
        border: '1px solid rgba(255,255,255,0.50)',
        borderTopColor: 'rgba(255,255,255,0.70)',
      }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{
        background: `linear-gradient(135deg, ${color}20, ${color}08)`,
        boxShadow: `0 0 12px ${color}15`,
      }}>
        <Icon className="h-3.5 w-3.5" style={{ color }} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold font-mono tabular-nums" style={{ color: '#151716' }}>
          {value}
        </p>
        <p className="text-[10px] uppercase tracking-[0.08em] text-on-surface-muted/40 font-mono">{label}</p>
      </div>
    </motion.div>
  )
}

function AmbientVitals() {
  const { data: gmail } = useQuery({ queryKey: ['vitals-gmail'], queryFn: getGmailStats, staleTime: 30_000, retry: 1 })
  const { data: finance } = useQuery({ queryKey: ['vitals-finance'], queryFn: getFinanceSummary, staleTime: 30_000, retry: 1 })
  const { data: actions } = useQuery({ queryKey: ['vitals-actions'], queryFn: getActionStats, staleTime: 30_000, retry: 1 })
  const { data: momentum } = useQuery({ queryKey: ['vitals-momentum'], queryFn: getMomentum, staleTime: 30_000, retry: 1 })

  const fmtCurrency = (cents: number) => {
    const abs = Math.abs(cents / 100)
    return `$${abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(0)}`
  }

  // Green + gold palette for all vitals
  const GRN = '#1B7A3D'
  const GRN_GLOW = 'rgba(27,122,61,0.14)'
  const GLD = '#D97706'
  const GLD_GLOW = 'rgba(217,119,6,0.14)'
  const EMR = '#059669'
  const EMR_GLOW = 'rgba(5,150,105,0.12)'

  const vitals = useMemo(() => {
    const items: Array<{ icon: typeof Mail; value: string; label: string; color: string; glow: string }> = []

    if (gmail) {
      if (gmail.unread > 0) items.push({ icon: Mail, value: String(gmail.unread), label: 'unread', color: GRN, glow: GRN_GLOW })
      if (gmail.urgent > 0) items.push({ icon: Zap, value: String(gmail.urgent), label: 'urgent', color: GLD, glow: GLD_GLOW })
    }

    if (finance) {
      const rev = finance.income
      if (rev) items.push({ icon: DollarSign, value: fmtCurrency(rev), label: 'income', color: EMR, glow: EMR_GLOW })
    }

    if (actions) {
      if (actions.pending > 0) items.push({ icon: Activity, value: String(actions.pending), label: 'pending', color: GLD, glow: GLD_GLOW })
    }

    if (momentum) {
      const { summary, health } = momentum
      if (summary.sessions7d > 0) items.push({
        icon: GitBranch, value: `${summary.complete}/${summary.sessions7d}`, label: 'sessions', color: GRN, glow: GRN_GLOW
      })
      if (summary.successRate != null) items.push({
        icon: TrendingUp, value: `${Math.round(summary.successRate * 100)}%`, label: 'success', color: EMR, glow: EMR_GLOW
      })
      if (health?.ecodiaos?.activeCCSessions) items.push({
        icon: Brain, value: String(health.ecodiaos.activeCCSessions), label: 'active CC', color: GRN, glow: GRN_GLOW
      })
    }

    return items
  }, [gmail, finance, actions, momentum])

  if (vitals.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.6 }}
      className="flex flex-wrap gap-2.5 justify-center py-3"
    >
      {vitals.map((v, i) => (
        <ChromaticVital key={v.label} icon={v.icon} value={v.value} label={v.label} color={v.color} glowColor={v.glow} delay={i * 0.06} />
      ))}
    </motion.div>
  )
}

// ─── Action Proposals — gold accent, the system's decisions ─────────

function PendingActionsBanner() {
  const { data: actions } = useQuery({ queryKey: ['vitals-actions'], queryFn: getActionStats, staleTime: 30_000, retry: 1 })

  if (!actions || actions.pending === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 80, damping: 22, delay: 0.4 }}
      className="flex items-center gap-3 rounded-2xl px-5 py-3 mx-auto max-w-md"
      style={{
        background: 'linear-gradient(135deg, rgba(217,119,6,0.06), rgba(251,191,36,0.03))',
        border: '1px solid rgba(217,119,6,0.12)',
        boxShadow: '0 4px 20px -4px rgba(217,119,6,0.10)',
      }}
    >
      <motion.div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: '#F59E0B', boxShadow: '0 0 8px rgba(245,158,11,0.4)' }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="text-xs text-on-surface-variant">
        {actions.pending} action{actions.pending > 1 ? 's' : ''} waiting
        {actions.urgent > 0 && <span className="ml-1 font-medium" style={{ color: '#D97706' }}>&middot; {actions.urgent} urgent</span>}
      </span>
      <span className="text-[10px] text-on-surface-muted/25 ml-auto font-mono">ask cortex</span>
    </motion.div>
  )
}

// ─── Stream chunk parser ────────────────────────────────────────────

interface ParsedChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'unknown'
  content: string
  toolName?: string
}

function parseStreamChunks(chunks: string[]): ParsedChunk[] {
  const parsed: ParsedChunk[] = []
  for (const chunk of chunks) {
    try {
      const obj = JSON.parse(chunk)
      if (obj.type === 'assistant' && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === 'text') parsed.push({ type: 'text', content: block.text })
          if (block.type === 'tool_use') parsed.push({ type: 'tool_use', content: `Using ${block.name}`, toolName: block.name })
          if (block.type === 'thinking') parsed.push({ type: 'thinking', content: block.thinking || block.text || '' })
        }
      }
      if (obj.type === 'content_block_start' && obj.content_block) {
        if (obj.content_block.type === 'tool_use') {
          parsed.push({ type: 'tool_use', content: `Using ${obj.content_block.name}`, toolName: obj.content_block.name })
        }
      }
    } catch {
      if (chunk.trim()) parsed.push({ type: 'unknown', content: chunk.trim() })
    }
  }
  return parsed
}

// ─── Tool badges — green+gold neural activity indicators ────────────
// Every tool gets a green or gold accent — never blue.
// The tool name renders like a system identifier: monospace, glowing.

const TOOL_ACCENT: Record<string, { color: string; glow: string }> = {
  gmail:    { color: '#1B7A3D', glow: 'rgba(27,122,61,0.10)' },
  calendar: { color: '#D97706', glow: 'rgba(217,119,6,0.10)' },
  db:       { color: '#059669', glow: 'rgba(5,150,105,0.10)' },
  shell:    { color: '#D97706', glow: 'rgba(217,119,6,0.10)' },
  pm2:      { color: '#B45309', glow: 'rgba(180,83,9,0.10)' },
  linkedin: { color: '#1B7A3D', glow: 'rgba(27,122,61,0.10)' },
  drive:    { color: '#059669', glow: 'rgba(5,150,105,0.10)' },
  xero:     { color: '#D97706', glow: 'rgba(217,119,6,0.10)' },
  meta:     { color: '#1B7A3D', glow: 'rgba(27,122,61,0.10)' },
  vercel:   { color: '#059669', glow: 'rgba(5,150,105,0.10)' },
}

function getToolAccent(name?: string) {
  if (!name) return { color: '#1B7A3D', glow: 'rgba(27,122,61,0.08)' }
  const key = Object.keys(TOOL_ACCENT).find(k => name.toLowerCase().includes(k))
  return key ? TOOL_ACCENT[key] : { color: '#1B7A3D', glow: 'rgba(27,122,61,0.08)' }
}

// ─── API base URL ────────────────────────────────────────────────────

function getApiBase() {
  return (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'https://api.admin.ecodia.au'
}

// ─── Download button — rendered when OS outputs a download:// link ───
// Usage in OS response: [⬇ Download invoice.pdf](download:///api/files/invoice.pdf)

function DownloadButton({ href, label }: { href: string; label: string }) {
  const [downloading, setDownloading] = useState(false)
  const [done, setDone] = useState(false)

  const url = href.startsWith('http') ? href : `${getApiBase()}${href.startsWith('/') ? '' : '/'}${href}`
  const fileName = label.replace(/^[⬇↓\s]+/, '').trim() || url.split('/').pop() || 'file'

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fileName
      a.click()
      URL.revokeObjectURL(a.href)
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <motion.button
      onClick={handleDownload}
      disabled={downloading}
      whileTap={{ scale: 0.96 }}
      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium my-1"
      style={{
        background: done
          ? 'linear-gradient(135deg, rgba(5,150,105,0.10), rgba(46,204,113,0.06))'
          : 'linear-gradient(135deg, rgba(27,122,61,0.08), rgba(46,204,113,0.04))',
        border: `1px solid ${done ? 'rgba(5,150,105,0.20)' : 'rgba(27,122,61,0.15)'}`,
        color: done ? '#059669' : '#1B7A3D',
      }}
    >
      {downloading ? (
        <motion.div
          className="h-3.5 w-3.5 rounded-full border-2"
          style={{ borderColor: '#1B7A3D', borderTopColor: 'transparent' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      ) : (
        <Download className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
      )}
      <span>{done ? 'Downloaded' : fileName}</span>
    </motion.button>
  )
}

// ─── Custom ReactMarkdown renderers ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MARKDOWN_COMPONENTS: Components = {
  a({ href, children }) {
    const label = typeof children === 'string' ? children : ''
    if (href?.startsWith('download://')) {
      return <DownloadButton href={href.replace('download://', '')} label={label} />
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary/80 underline underline-offset-2 hover:text-primary transition-colors">{children}</a>
  },
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || '')
    const codeStr = String(children).replace(/\n$/, '')
    if (match?.[1] === 'mermaid') return <MermaidBlock code={codeStr} />
    if (match?.[1] === 'html' && codeStr.includes('<')) {
      return (
        <div className="my-3 rounded-xl overflow-hidden border border-white/[0.08]" style={{ background: '#1a1a1a' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]" style={{ background: '#2a2a2a' }}>
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
              <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
            </div>
            <span className="font-mono text-[10px] text-white/30 ml-2 flex-1">Preview</span>
          </div>
          <iframe
            srcDoc={codeStr}
            sandbox="allow-same-origin"
            className="w-full border-0"
            style={{ minHeight: '400px', maxHeight: '80vh', background: '#fff' }}
            onLoad={(e) => {
              const frame = e.target as HTMLIFrameElement
              if (frame.contentDocument?.body) {
                frame.style.height = Math.min(frame.contentDocument.body.scrollHeight + 20, window.innerHeight * 0.8) + 'px'
              }
            }}
          />
        </div>
      )
    }
    return <code className={className}>{children}</code>
  },
}

// ─── Message renderers ──────────────────────────────────────────────

function UserMessage({ message }: { message: OSSessionMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 90, damping: 22 }}
      className="py-3"
    >
      <div className="rounded-2xl px-5 py-3.5" style={{
        background: 'linear-gradient(135deg, rgba(27,122,61,0.05), rgba(46,204,113,0.03))',
        border: '1px solid rgba(27,122,61,0.08)',
        boxShadow: '0 2px 12px -4px rgba(27,122,61,0.06)',
      }}>
        <p className="text-sm leading-relaxed text-on-surface font-medium">{message.content}</p>
      </div>
    </motion.div>
  )
}

function AssistantMessage({ message }: { message: OSSessionMessage }) {
  const chunks = message.chunks ? parseStreamChunks(message.chunks) : []
  const textContent = chunks.filter(c => c.type === 'text').map(c => c.content).join('\n\n')
  // Legacy tool extraction (pre-persistence messages) — name-only pills.
  const legacyChunkTools = chunks.filter(c => c.type === 'tool_use')
  const hasPersistedTools = !!(message.tools && message.tools.length > 0)
  const thinkingBlocks = chunks.filter(c => c.type === 'thinking')
  const thinkingFromMessage = !thinkingBlocks.length && message.thinking
    ? [{ type: 'thinking' as const, content: message.thinking }]
    : thinkingBlocks
  const displayText = textContent || message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 80, damping: 22, delay: 0.04 }}
      className="py-3 space-y-3"
    >
      {/* Thinking blocks — collapsible, green tint */}
      {thinkingFromMessage.map((t, i) => (
        <ThinkingBlock key={`think-${i}`} content={t.content} />
      ))}

      {/* Persisted tools — full input + result, expandable. Stacked rows, not
          flex-wrap pills, so the one-line input summary is readable and long
          bash commands don't squish. */}
      {hasPersistedTools && (
        <div className="flex flex-col gap-1.5">
          {message.tools!.map((t, i) => (
            <PersistedToolBlock key={`ptool-${i}`} tool={t} delay={i * 0.03} />
          ))}
        </div>
      )}

      {/* Legacy tool badges — only for older messages that pre-date tool
          persistence. Kept as flex-wrap pills since we only have the name. */}
      {!hasPersistedTools && legacyChunkTools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {legacyChunkTools.map((t, i) => {
            const accent = getToolAccent(t.toolName)
            return (
              <motion.div
                key={`tool-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 18, delay: i * 0.03 }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                style={{
                  background: `linear-gradient(135deg, ${accent.color}08, ${accent.color}04)`,
                  border: `1px solid ${accent.color}15`,
                  boxShadow: `0 2px 8px -2px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
                }}
              >
                <motion.div
                  className="h-1 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accent.color, boxShadow: `0 0 4px ${accent.color}60` }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="text-[11px] font-mono tracking-wide" style={{ color: `${accent.color}cc` }}>
                  {t.toolName || t.content}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Response text — futuristic markdown rendering. Wrapped in a local
          ErrorBoundary so one bad message (malformed code fence, huge blob,
          pathological table) can't crash the whole Cortex route. */}
      {displayText && (
        <MessageErrorBoundary fallbackText={displayText}>
          <div className="cortex-prose text-sm leading-[1.85] text-on-surface-variant">
            <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url} components={MARKDOWN_COMPONENTS}>{displayText}</ReactMarkdown>
          </div>
        </MessageErrorBoundary>
      )}

      {/* Pinnacle P1 per-turn telemetry — tokens, duration, model, cache hits.
          Null-safe: older messages finalised before turn_complete was wired
          will simply not render this row. */}
      {message.telemetry && <TurnTelemetryRow t={message.telemetry} />}
    </motion.div>
  )
}

/**
 * PersistedToolBlock — one tool-call row inside a finalised assistant message.
 * Shows the tool name + a prettified one-line input summary on the headline;
 * expands to reveal the full input JSON + tool result. Honours the stored
 * status (done / error) from the P1 lifecycle so failures are obvious.
 */
function PersistedToolBlock({ tool, delay }: { tool: LiveToolCall; delay: number }) {
  const [expanded, setExpanded] = useState(false)
  const accent = getToolAccent(tool.name)
  const isError = tool.status === 'error' || tool.isError
  const dotColor = isError ? '#C25B48' : accent.color
  const textColor = isError ? '#C25B48cc' : `${accent.color}cc`
  const border = isError ? 'rgba(194,91,72,0.22)' : `${accent.color}15`
  const bg = isError
    ? 'linear-gradient(135deg, rgba(194,91,72,0.05), rgba(194,91,72,0.02))'
    : `linear-gradient(135deg, ${accent.color}08, ${accent.color}04)`

  const summary = toolSummaryLine(tool.name, tool.input)
  const resultSummary = toolResultSummary(tool.result)
  // Expandable when we have anything richer than the summary to reveal.
  const hasDetail =
    (tool.input != null && String(tool.input).length > 0) ||
    (tool.result != null && String(tool.result).length > 0)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 100, damping: 18, delay }}
      layout
      className="rounded-xl overflow-hidden"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setExpanded(v => !v)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        {isError ? (
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-1" style={{ color: dotColor }} strokeWidth={2} />
        ) : (
          <div
            className="h-1 w-1 rounded-full flex-shrink-0 mt-[7px]"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 4px ${dotColor}60` }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] font-mono tracking-wide font-semibold" style={{ color: textColor }}>
              {friendlyToolName(tool.name)}
            </span>
            {summary && (
              <span
                className="text-[11px] font-mono truncate"
                style={{ color: 'rgba(21,23,22,0.85)' }}
              >
                {summary}
              </span>
            )}
          </div>
          {!expanded && resultSummary && (
            <div
              className="mt-1 text-[11px] font-mono truncate flex items-center gap-1.5"
              style={{ color: 'rgba(21,23,22,0.62)' }}
            >
              <span style={{ color: 'rgba(21,23,22,0.35)' }}>→</span>
              <span className="truncate">{resultSummary}</span>
            </div>
          )}
        </div>
        {hasDetail && (
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="mt-1 flex-shrink-0"
          >
            <ChevronRight
              className="h-3 w-3"
              style={{ color: 'rgba(21,23,22,0.50)' }}
              strokeWidth={2}
            />
          </motion.div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            className="overflow-hidden"
          >
            <div
              className="border-t px-3 py-2.5 space-y-2.5"
              style={{ borderColor: border }}
            >
              {tool.input != null && String(tool.input).length > 0 && (
                <div>
                  <div
                    className="text-[10px] font-mono uppercase tracking-wider mb-1.5 font-semibold"
                    style={{ color: 'rgba(21,23,22,0.55)' }}
                  >
                    input
                  </div>
                  <pre
                    className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-words m-0"
                    style={{
                      background: 'rgba(0,0,0,0.045)',
                      color: '#151716',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(0,0,0,0.05)',
                    }}
                  >{formatToolInputForDisplay(tool.input)}</pre>
                </div>
              )}
              {tool.result != null && String(tool.result).length > 0 && (
                <div>
                  <div
                    className="text-[10px] font-mono uppercase tracking-wider mb-1.5 font-semibold"
                    style={{ color: isError ? '#C25B48' : 'rgba(21,23,22,0.55)' }}
                  >
                    {isError ? 'error' : 'result'}
                  </div>
                  <pre
                    className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-words m-0 max-h-64 overflow-y-auto"
                    style={{
                      background: isError ? 'rgba(194,91,72,0.06)' : 'rgba(0,0,0,0.045)',
                      color: '#151716',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isError ? 'rgba(194,91,72,0.15)' : 'rgba(0,0,0,0.05)'}`,
                    }}
                  >{tool.result}</pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Pretty-print a raw tool input for the expanded panel. JSON gets 2-space
 *  indent; plain strings pass through. */
function formatToolInputForDisplay(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return JSON.stringify(parsed, null, 2)
    } catch { return raw }
  }
  try { return JSON.stringify(raw, null, 2) } catch { return String(raw) }
}

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.length > 120 ? content.slice(0, 120) + '...' : content

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(27,122,61,0.04), rgba(46,204,113,0.02))',
        border: '1px solid rgba(27,122,61,0.08)',
        boxShadow: '0 2px 12px -4px rgba(27,122,61,0.06)',
      }}
      layout
    >
      <button onClick={() => setExpanded(!expanded)} className="flex items-start gap-2.5 px-4 py-3 w-full text-left">
        <Brain className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: '#2ECC71' }} strokeWidth={1.75} />
        <span className="text-xs text-on-surface-muted/50 leading-relaxed flex-1">{expanded ? content : preview}</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
          <ChevronDown className="h-3 w-3 text-on-surface-muted/25 flex-shrink-0 mt-0.5" strokeWidth={2} />
        </motion.div>
      </button>
    </motion.div>
  )
}

// ─── Streaming indicator — green + gold breathing ───────────────────

/**
 * Streaming markdown — renders on every text update. No throttle.
 *
 * Previously throttled to 200ms to reduce ReactMarkdown parsing overhead,
 * but: (a) modern ReactMarkdown + remark-gfm parses a ~1KB delta in <5ms,
 * (b) the store already rAF-batches deltas at ~60Hz, (c) the throttle
 * added up to 200ms of "waiting to see the text I'm told just arrived"
 * latency on top of the 20ms coalescer. The perceptible difference
 * between throttled and unthrottled streaming is enormous — unthrottled
 * feels like typing; throttled feels like chunks arriving.
 *
 * memo() keeps this a pure text-in, render-out component so React can skip
 * the whole subtree if the text hasn't changed.
 */
const StreamMarkdown = memo(function StreamMarkdown({ text }: { text: string }) {
  if (!text) return null
  return (
    <MessageErrorBoundary fallbackText={text}>
      <div className="cortex-prose text-sm leading-[1.85] text-on-surface-variant">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url} components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
      </div>
    </MessageErrorBoundary>
  )
})

const STREAM_DOTS = [
  { color: '#1B7A3D', delay: 0 },
  { color: '#2ECC71', delay: 0.15 },
  { color: '#D97706', delay: 0.3 },
] as const

/** Friendly tool name — strip mcp__ prefix and server name for readability */
function friendlyToolName(raw: string) {
  // mcp__neo4j__graph_query → graph_query
  // mcp__supabase_supabase__query → query
  const parts = raw.replace(/^mcp__/, '').split('__')
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

/**
 * Parse the raw input into a plain object (best-effort). Tool inputs come in
 * as either a JSON-stringified object or a plain string depending on where in
 * the lifecycle they were captured.
 */
function parseToolInput(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

/**
 * Truncate a single-line string for summary display. Preserves the head and
 * tail so file paths / long commands still show the meaningful ends.
 */
function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const side = Math.floor((max - 1) / 2)
  return `${s.slice(0, side)}…${s.slice(-side)}`
}

/**
 * Tool summary — a short, prettified one-line description of what the tool
 * was asked to do. The full raw input is still shown on expand; this is just
 * the readable headline that replaces the bare tool name.
 *
 * Returns null when no useful summary is available — callers should fall back
 * to the friendly tool name alone in that case.
 */
function toolSummaryLine(rawName: string, rawInput: unknown): string | null {
  const input = parseToolInput(rawInput)
  const name = friendlyToolName(rawName)
  if (input == null) return null

  // Plain-string inputs: show a truncated form.
  if (typeof input === 'string') return truncateMiddle(input.replace(/\s+/g, ' ').trim(), 80)
  if (typeof input !== 'object') return String(input)

  const i = input as Record<string, unknown>
  const s = (k: string): string | null => {
    const v = i[k]
    return typeof v === 'string' ? v : null
  }

  // Bash — `$ <command>` head-truncated to 80 chars so the whole visible line
  // is the command itself, not the field names around it.
  if (name === 'Bash' && s('command')) {
    return `$ ${truncateMiddle(s('command')!.replace(/\s+/g, ' ').trim(), 78)}`
  }
  // File operations.
  if ((name === 'Read' || name === 'Write') && s('file_path')) {
    return s('file_path')!
  }
  if (name === 'Edit' && s('file_path')) {
    const old = s('old_string')
    return old
      ? `${s('file_path')} — ${truncateMiddle(old.replace(/\s+/g, ' ').trim(), 40)}`
      : s('file_path')!
  }
  // Search / glob.
  if (name === 'Glob' && s('pattern')) return s('pattern')!
  if (name === 'Grep' && s('pattern')) {
    const path = s('path')
    return path ? `${s('pattern')} in ${path}` : s('pattern')!
  }
  // Neo4j / Cypher / graph queries.
  if ((name === 'graph_query' || name === 'cypher' || name === 'query') && (s('query') || s('cypher'))) {
    const q = (s('query') || s('cypher'))!.replace(/\s+/g, ' ').trim()
    return truncateMiddle(q, 80)
  }
  // Web fetches.
  if (name === 'WebFetch' && s('url')) return s('url')!
  if (name === 'WebSearch' && s('query')) return s('query')!

  // Generic fallback: show the first string-valued field with its key.
  for (const [k, v] of Object.entries(i)) {
    if (typeof v === 'string' && v.length > 0) {
      return `${k}: ${truncateMiddle(v.replace(/\s+/g, ' ').trim(), 70)}`
    }
  }
  // Last-ditch: stringify the whole object, truncated.
  try { return truncateMiddle(JSON.stringify(input), 80) } catch { return null }
}

/**
 * Result summary — a compact one-line description of the tool's output for
 * the collapsed pill. Long outputs get truncated; the full result is shown
 * when the pill is expanded.
 */
function toolResultSummary(result: string | undefined | null): string | null {
  if (!result) return null
  const compact = result.replace(/\s+/g, ' ').trim()
  if (!compact) return null
  // Try to parse as JSON so we can collapse it onto one line if it's a small
  // object — otherwise treat as plain text.
  try {
    const parsed = JSON.parse(result)
    if (parsed && typeof parsed === 'object') {
      const flat = JSON.stringify(parsed)
      return truncateMiddle(flat, 80)
    }
  } catch { /* fall through to plain-text handling */ }
  return truncateMiddle(compact, 80)
}

/**
 * Live tool activity feed — shows what the OS is doing right now.
 * Pinnacle P1: renders the full tool lifecycle — 'preparing' (input
 * streaming in), 'running' (tool called, awaiting result), 'done', and
 * 'error' — sourced from the backend's four-event tool_use lifecycle.
 * Pre-P1 tools (single tool_use event) fall back to !completedAt sensing.
 */
function LiveToolFeed({ tools }: { tools: LiveToolCall[] }) {
  // Tick every second to update elapsed timers on active tools
  const [, setTick] = useState(0)
  const hasActive = tools.some(t => (t.status ? (t.status === 'preparing' || t.status === 'running') : !t.completedAt))
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasActive])

  if (tools.length === 0) return null

  // Show ALL tools so the dialogue is fully transparent about what's happening.
  // Hiding earlier tools behind a "+N earlier" pill made long turns look frozen
  // even though work was visibly continuing.
  const visible = tools

  return (
    <div className="space-y-1">
      {visible.map((t) => (
        <ToolLifecyclePill key={t.id} tool={t} />
      ))}
    </div>
  )
}

/**
 * ToolLifecyclePill — one tool's lifecycle: preparing → running → done/error.
 * Dot animation and colour reflect current status; text colour dims when
 * complete. Name uses `friendlyToolName` (strips mcp__server__ prefix).
 * When the tool's input has arrived, also shows a prettified one-line summary
 * (e.g. `Bash · $ git status`) so you can see *what* is being done, not just
 * *which* tool.
 */
function ToolLifecyclePill({ tool: t }: { tool: LiveToolCall }) {
  // Derive status from explicit field (Pinnacle P1) or from completedAt (legacy).
  const status = t.status ?? (t.completedAt ? 'done' : 'running')
  const isActive = status === 'preparing' || status === 'running'
  const accent = getToolAccent(t.name)
  const errorColor = '#C25B48'

  const elapsed = isActive
    ? Math.round((Date.now() - t.startedAt) / 1000)
    : Math.round(((t.completedAt || t.startedAt) - t.startedAt) / 1000)

  // Colour: tool accent for preparing/running/done, explicit red for error.
  const dotColor = status === 'error' ? errorColor : accent.color
  const textColor = status === 'error'
    ? `${errorColor}cc`
    : isActive ? `${accent.color}cc` : `${accent.color}66`
  const summaryColor = status === 'error'
    ? `${errorColor}cc`
    : isActive ? 'rgba(21,23,22,0.80)' : 'rgba(21,23,22,0.55)'
  const elapsedOpacity = status === 'error' ? 'text-on-surface-muted/25' : 'text-on-surface-muted/20'

  // Status suffix — surfaces 'preparing' so the pre-input state is visible.
  // No suffix for 'running' and 'done' (clean) or 'error' (handled by icon).
  const statusSuffix = status === 'preparing' ? ' · preparing' : null

  // Prettified summary of the input (e.g. `$ git status` for Bash). Only once
  // the input has arrived — during 'preparing' it's intentionally absent.
  const summary = status === 'preparing' ? null : toolSummaryLine(t.name, t.input)

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: isActive ? 1 : 0.55, x: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className="flex items-center gap-2 min-w-0"
    >
      {/* Dot — pulses while active, static when terminal */}
      {isActive ? (
        <motion.div
          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}60` }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : status === 'error' ? (
        <AlertTriangle className="h-3 w-3 flex-shrink-0" style={{ color: errorColor }} strokeWidth={2} />
      ) : (
        <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor, opacity: 0.3 }} />
      )}
      <span className="text-[11px] font-mono tracking-wide flex-shrink-0" style={{ color: textColor }}>
        {friendlyToolName(t.name)}
        {statusSuffix && <span className="opacity-70">{statusSuffix}</span>}
      </span>
      {summary && (
        <span
          className="text-[11px] font-mono truncate min-w-0"
          style={{ color: summaryColor }}
          title={summary}
        >
          · {summary}
        </span>
      )}
      <span className={`text-[10px] font-mono flex-shrink-0 ml-auto ${elapsedOpacity}`}>
        {elapsed}s
      </span>
    </motion.div>
  )
}

/**
 * ThinkingIndicator — pre-first-token pulse that appears on
 * assistant_message_starting and clears on the first text_delta or
 * tool_use_starting. Fills the silent gap between send and first output
 * that previously looked like a hung UI.
 */
function ThinkingIndicator({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="thinking-pre"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          className="flex items-center gap-2 py-2 px-3 rounded-xl self-start"
          style={{
            background: 'linear-gradient(135deg, rgba(27,122,61,0.05), rgba(46,204,113,0.02))',
            border: '1px solid rgba(27,122,61,0.10)',
          }}
        >
          {STREAM_DOTS.map((dot, i) => (
            <motion.div
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dot.color, boxShadow: `0 0 6px ${dot.color}50` }}
              animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.3, 0.9, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: dot.delay, ease: 'easeInOut' }}
            />
          ))}
          <span className="text-[11px] font-mono tracking-wide text-on-surface-muted/50 ml-1">
            thinking
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * TurnTelemetryRow — renders per-turn telemetry captured from turn_complete.
 * Tokens, cache-hit %, duration, model. Hover-reveal the full breakdown.
 */
function TurnTelemetryRow({ t }: { t: TurnTelemetry }) {
  const [expanded, setExpanded] = useState(false)
  const totalIn = t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens
  const cacheHitPct = totalIn > 0 ? Math.round((t.cacheReadTokens / totalIn) * 100) : 0
  const durSec = (t.durationMs / 1000).toFixed(1)
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const modelShort = t.model
    .replace(/^claude-/, '')
    .replace(/-20\d{6}$/, '')
    .replace(/^(opus|sonnet|haiku)-?/, (m) => m)

  return (
    <motion.button
      onClick={() => setExpanded(v => !v)}
      whileHover={{ opacity: 0.95 }}
      className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 rounded-lg text-[10px] font-mono tracking-wide cursor-pointer select-none"
      style={{
        color: 'rgba(27,122,61,0.55)',
        background: 'rgba(27,122,61,0.025)',
        border: '1px solid rgba(27,122,61,0.06)',
      }}
    >
      <span>{fmt(t.inputTokens)}→{fmt(t.outputTokens)}</span>
      <span>·</span>
      <span>{durSec}s</span>
      <span>·</span>
      <span>{modelShort}</span>
      {cacheHitPct > 0 && (
        <>
          <span>·</span>
          <span>{cacheHitPct}% cached</span>
        </>
      )}
      {expanded && (
        <>
          <span className="w-full" aria-hidden="true" />
          <span className="opacity-70">in {t.inputTokens}</span>
          <span className="opacity-70">cache-r {t.cacheReadTokens}</span>
          <span className="opacity-70">cache-w {t.cacheWriteTokens}</span>
          <span className="opacity-70">out {t.outputTokens}</span>
          {t.stopReason && <span className="opacity-70">stop:{t.stopReason}</span>}
        </>
      )}
    </motion.button>
  )
}

/**
 * InlineBanner — transient in-stream notice for compaction start/end and
 * session events (session_resumed / recovered / etc). Non-blocking — fades
 * in and out. Auto-dismiss handled by the parent stack.
 */
function InlineBanner({ banner }: { banner: InlineBannerEntry }) {
  const isEnd = banner.kind === 'compaction' && banner.detail === 'end'
  const label =
    banner.kind === 'compaction'
      ? (banner.detail === 'start' ? 'Compacting context…' : 'Compaction complete')
      : friendlyEventLabel(banner.detail)
  // Error-class session events (session errors, aborts, failures) need coral
  // so they stand out from info-class events like "session resumed".
  const isError = banner.kind === 'session_event' && isErrorSubtype(banner.detail)
  const accent = isError ? '#C25B48'
                 : isEnd ? '#1B7A3D'
                 : '#D97706'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -2, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 140, damping: 22 }}
      className="flex items-center gap-2 py-1.5 px-3 rounded-xl text-[11px] font-mono tracking-wide self-start"
      style={{
        background: `linear-gradient(135deg, ${accent}0a, ${accent}04)`,
        border: `1px solid ${accent}20`,
        color: `${accent}dd`,
      }}
    >
      {banner.kind === 'compaction' && !isEnd && (
        <motion.div
          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}70` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {isEnd && (
        <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent, opacity: 0.5 }} />
      )}
      {banner.kind === 'session_event' && (
        <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent, opacity: 0.7 }} />
      )}
      <span>{label}</span>
    </motion.div>
  )
}

function friendlyEventLabel(subtype: string): string {
  // Map SDK system subtypes to human copy. Unknown subtypes fall through to
  // the raw string so nothing goes silent on us.
  switch (subtype) {
    case 'session_resumed':    return 'Session resumed'
    case 'session_recovered':  return 'Session recovered'
    case 'session_restarted':  return 'Session restarted'
    case 'init':               return 'Session ready'
    case 'error':              return 'Session error'
    case 'aborted':            return 'Session aborted'
    case 'failed':             return 'Session failed'
    default:                   return subtype
  }
}

function isErrorSubtype(subtype: string): boolean {
  return /^(error|aborted|failed|timeout|exhausted|rejected)/i.test(subtype)
}

/**
 * InlineBannerStack — renders the transient banner queue. Auto-dismisses
 * each entry after 4s (compaction end / session events) or keeps it until
 * replaced (compaction start — dismissed by the matching end event).
 */
function InlineBannerStack() {
  const banners = useOSSessionStore(s => s.inlineBanners)
  const dismiss = useOSSessionStore(s => s.dismissInlineBanner)

  useEffect(() => {
    // Auto-dismiss terminal banners after 4s.
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const b of banners) {
      const isTransient =
        (b.kind === 'compaction' && b.detail === 'end') ||
        b.kind === 'session_event'
      if (isTransient) {
        timers.push(setTimeout(() => dismiss(b.id), 4000))
      }
    }
    return () => { for (const t of timers) clearTimeout(t) }
  }, [banners, dismiss])

  // Also: when a compaction 'start' banner has a matching 'end' in the list,
  // drop the start (the end conveys the outcome).
  useEffect(() => {
    const hasEnd = banners.some(b => b.kind === 'compaction' && b.detail === 'end')
    if (hasEnd) {
      const starts = banners.filter(b => b.kind === 'compaction' && b.detail === 'start')
      for (const s of starts) dismiss(s.id)
    }
  }, [banners, dismiss])

  if (banners.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5 my-2">
      <AnimatePresence mode="popLayout">
        {banners.map(b => <InlineBanner key={b.id} banner={b} />)}
      </AnimatePresence>
    </div>
  )
}

/**
 * ConnectionStateIndicator — always-visible pill in the chrome showing the
 * underlying WS state. Subscribes to useConnectionStore so it displays the
 * correct state regardless of when it mounts (CustomEvent-only would miss the
 * `connected` fired before this component is in the tree).
 */
function ConnectionStateIndicator() {
  const state = useConnectionStore(s => s.state)

  // Connected and quiet — show a minimal dot, don't clutter.
  if (state === 'connected') {
    return (
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: '#1B7A3D', boxShadow: '0 0 4px rgba(27,122,61,0.45)' }}
        title="Connected"
        aria-label="Connected"
      />
    )
  }

  // All other states — visible pill with icon + label.
  const cfg = (() => {
    switch (state) {
      case 'connecting':
        return { label: 'Connecting…', color: '#D97706', Icon: Loader2, spin: true }
      case 'reconnecting':
        return { label: 'Reconnecting…', color: '#D97706', Icon: Loader2, spin: true }
      case 'catching_up':
        return { label: 'Catching up…', color: '#D97706', Icon: Loader2, spin: true }
      case 'backend_alive':
        return { label: 'Stream down (backend working)', color: '#D97706', Icon: Wifi, spin: false }
      case 'disconnected':
      default:
        return { label: 'Disconnected', color: '#C25B48', Icon: WifiOff, spin: false }
    }
  })()

  const { label, color, Icon, spin } = cfg
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wide"
      style={{
        background: `${color}0f`,
        border: `1px solid ${color}26`,
        color: `${color}dd`,
      }}
      title={label}
      aria-label={label}
    >
      <Icon className={`h-2.5 w-2.5 ${spin ? 'animate-spin' : ''}`} strokeWidth={2} />
      <span>{label}</span>
    </div>
  )
}

/**
 * HandoverIndicator — subtle visible signal when the OS's context is
 * being reset (auto-handover at token threshold, or whatever else pushes
 * through a 'handover' state). Without this the session silently loses
 * continuity and Tate notices only because the OS suddenly has no idea
 * what it was doing.
 */
function HandoverIndicator({ handover }: { handover: ReturnType<typeof useOSSessionStore.getState>['handover'] }) {
  if (!handover) return null
  const label = handover.phase === 'preparing' ? 'Writing handover brief…'
              : handover.phase === 'warming'   ? 'Warming fresh session with brief…'
              : handover.phase === 'complete'  ? 'Context refreshed — continuing'
              : handover.phase === 'failed'    ? `Handover failed: ${handover.error || 'unknown'}`
              : handover.phase === 'cancelled' ? `Handover cancelled: ${handover.error || 'too_short'}`
              : null
  if (!label) return null
  const accent = handover.phase === 'failed' ? '#D97706' : '#1B7A3D'
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ type: 'spring', stiffness: 140, damping: 22 }}
        className="flex items-center gap-2 py-2 px-3 rounded-xl text-[11px] font-mono tracking-wide"
        style={{
          background: `linear-gradient(135deg, ${accent}0a, ${accent}04)`,
          border: `1px solid ${accent}20`,
          color: `${accent}dd`,
        }}
      >
        <motion.div
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 6px ${accent}70` }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span>{label}</span>
      </motion.div>
    </AnimatePresence>
  )
}

function StreamingIndicator({ text, tools, thinking }: { text: string; tools: LiveToolCall[]; thinking: string }) {
  const activeTools = tools.filter(t => !t.completedAt)
  const liveness = useOSSessionStore(s => s.liveness)
  // Tick every 1s so the elapsed counter advances smoothly between the 5s
  // liveness heartbeats from the backend. Without this we'd jump 0→5→10 and
  // "proof of life" would look as frozen as no-ticker.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Determine status label
  let statusLabel = 'thinking'
  if (activeTools.length > 0) statusLabel = `using ${friendlyToolName(activeTools[activeTools.length - 1].name)}`
  else if (text) statusLabel = 'working'
  else if (thinking) statusLabel = 'reasoning'

  // Liveness-backed elapsed timer + stale detector. The backend emits a tick
  // every 5s; if we haven't seen one in >20s the OS is probably wedged — surface
  // that instead of pretending it's still working.
  const now = Date.now()
  const livenessAgeMs = liveness ? now - liveness.receivedAt : null
  const livenessStale = livenessAgeMs !== null && livenessAgeMs > 20_000
  const elapsedSec = liveness
    ? liveness.elapsedSec + Math.round((livenessAgeMs ?? 0) / 1000)
    : null
  const toolDetail = liveness?.phase === 'tool' && liveness.detail
    ? `${friendlyToolName(liveness.detail.name)} · ${liveness.detail.runningSec}s`
    : null

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-3 space-y-3">
      {/* Thinking preview — show first/last line of thinking if no text yet */}
      {thinking && !text && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(27,122,61,0.03)', border: '1px solid rgba(27,122,61,0.06)' }}
        >
          <Brain className="h-3 w-3 mt-0.5 flex-shrink-0" style={{ color: '#2ECC71' }} strokeWidth={1.75} />
          <span className="text-[11px] text-on-surface-muted/40 leading-relaxed line-clamp-2 font-mono">
            {thinking.length > 200 ? '...' + thinking.slice(-200) : thinking}
          </span>
        </motion.div>
      )}

      {/* Live tool activity feed */}
      <LiveToolFeed tools={tools} />

      {/* Streaming text */}
      <StreamMarkdown text={text} />

      {/* Status bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {STREAM_DOTS.map((dot, i) => (
            <motion.div
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dot.color, boxShadow: `0 0 6px ${dot.color}50` }}
              animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.3, 0.9, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: dot.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <span className="text-[11px] text-on-surface-muted/30 font-mono tracking-wider">
          {statusLabel}
          {elapsedSec !== null && (
            <span className={livenessStale ? 'text-on-surface-muted/15 ml-2' : 'text-on-surface-muted/20 ml-2'}>
              · {elapsedSec}s
            </span>
          )}
          {toolDetail && (
            <span className={livenessStale ? 'text-on-surface-muted/15 ml-2' : 'text-on-surface-muted/20 ml-2'}>
              · {toolDetail}
            </span>
          )}
        </span>
        {livenessStale && (
          <span className="text-[10px] font-mono" style={{ color: '#C25B48' }}>
            quiet {Math.round((livenessAgeMs ?? 0) / 1000)}s
          </span>
        )}
        {tools.length > 0 && (
          <span className="text-[10px] text-on-surface-muted/15 font-mono ml-auto">
            {tools.filter(t => t.completedAt).length}/{tools.length} tools
          </span>
        )}
      </div>
    </motion.div>
  )
}

// ─── Message Queue helpers + components ─────────────────────────────

function formatMsgAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SendModeToggle({
  mode,
  onChange,
}: {
  mode: 'direct' | 'queue'
  onChange: (m: 'direct' | 'queue') => void
}) {
  return (
    <div
      className="flex items-center rounded-lg overflow-hidden flex-shrink-0"
      style={{ border: '1px solid rgba(0,0,0,0.08)' }}
    >
      <button
        onClick={() => onChange('direct')}
        className="px-2.5 py-1 text-[10px] font-mono transition-all"
        style={
          mode === 'direct'
            ? { background: '#000', color: '#fff' }
            : { color: 'rgba(0,0,0,0.35)' }
        }
      >
        Send
      </button>
      <button
        onClick={() => onChange('queue')}
        className="px-2.5 py-1 text-[10px] font-mono transition-all"
        style={
          mode === 'queue'
            ? { background: '#1B7A3D', color: '#fff' }
            : { color: 'rgba(0,0,0,0.35)' }
        }
      >
        Queue
      </button>
    </div>
  )
}

function QueuePill({ onClick, drawerOpen }: { onClick: () => void; drawerOpen: boolean }) {
  // WS events (message_queue:*) drive live refresh — polling is a fallback
  // only. Pause polling entirely while the drawer is open (the drawer has its
  // own query under the same key and will refresh faster), and back off to
  // 2m when closed since WS keeps us honest.
  const { data } = useQuery({
    queryKey: ['message-queue'],
    queryFn: listPending,
    refetchInterval: drawerOpen ? false : 120_000,
    staleTime: 60_000,
    retry: 1,
  })
  const count = data?.length ?? 0
  const prevCountRef = useRef(count)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (count > prevCountRef.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 1500)
      prevCountRef.current = count
      return () => clearTimeout(t)
    }
    prevCountRef.current = count
  }, [count])

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
        background: 'rgba(27,122,61,0.08)',
        border: '1px solid rgba(27,122,61,0.18)',
        color: '#1B7A3D',
      }}
    >
      {pulse && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'rgba(27,122,61,0.15)' }}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.7 }}
        />
      )}
      <Inbox className="h-3 w-3 flex-shrink-0" strokeWidth={1.75} />
      <span>{count} queued</span>
    </motion.button>
  )
}

function QueueMessageRow({
  msg,
  onRefetch,
}: {
  msg: QueuedMessage
  onRefetch: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(msg.body)
  const [editMaxAge, setEditMaxAge] = useState(msg.max_age_hours)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [promoting, setPromoting] = useState(false)

  // Auto-reset confirm state after 3s
  useEffect(() => {
    if (!confirmCancel) return
    const t = setTimeout(() => setConfirmCancel(false), 3000)
    return () => clearTimeout(t)
  }, [confirmCancel])

  async function handleSave() {
    // Guard the edit form client-side so we don't PATCH with a blank / NaN /
    // absurd max_age. Backend clamps [1, 168] too, but rejecting early keeps
    // the row visually consistent with what was typed.
    const trimmedBody = editBody.trim()
    if (!trimmedBody) return
    const ageNum = Number(editMaxAge)
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 168) return

    setSaving(true)
    try {
      await updateMessage(msg.id, { body: trimmedBody, max_age_hours: Math.round(ageNum) })
      setEditing(false)
      onRefetch()
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  // Derived validity flag so the Save button can dim + disable without the
  // user submitting a blocked request.
  const ageNum = Number(editMaxAge)
  const saveValid = editBody.trim().length > 0 &&
    Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 168

  async function handleCancel() {
    if (!confirmCancel) {
      setConfirmCancel(true)
      return
    }
    try {
      await cancelMessage(msg.id)
      onRefetch()
    } catch {
      // silent
    }
  }

  async function handlePromote() {
    setPromoting(true)
    try {
      await promoteMessage(msg.id)
      onRefetch()
    } catch {
      // silent
    } finally {
      setPromoting(false)
    }
  }

  const hasContext =
    msg.context_at_queue &&
    (msg.context_at_queue.current_work || msg.context_at_queue.active_plan)

  return (
    <div
      className="py-4 px-5"
      style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl px-3 py-2.5 text-sm leading-relaxed bg-transparent outline-none"
            style={{ border: '1px solid rgba(27,122,61,0.22)', color: '#151716' }}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-on-surface-muted/40 font-mono">max age (hrs)</label>
            <input
              type="number"
              min={1}
              max={168}
              value={editMaxAge}
              onChange={e => setEditMaxAge(Number(e.target.value))}
              className="w-16 rounded-md px-2 py-1 text-xs text-center bg-transparent outline-none"
              style={{ border: '1px solid rgba(0,0,0,0.10)' }}
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving || !saveValid}
              className="text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ color: '#1B7A3D' }}
              title={saveValid ? undefined : 'Body required; max age must be between 1 and 168 hours'}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setEditBody(msg.body)
                setEditMaxAge(msg.max_age_hours)
              }}
              className="text-xs text-on-surface-muted/40 hover:text-on-surface-muted/60 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p
          className="text-sm leading-relaxed text-on-surface cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => setEditing(true)}
        >
          {msg.body}
        </p>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px] text-on-surface-muted/35 font-mono">
        <span>{formatMsgAge(msg.queued_at)}</span>
        {msg.max_age_hours && !editing && (
          <span>· max {msg.max_age_hours}h</span>
        )}
      </div>

      {hasContext && (
        <div className="mt-2">
          <button
            onClick={() => setContextExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-on-surface-muted/30 hover:text-on-surface-muted/50 font-mono transition-colors"
          >
            <motion.div
              animate={{ rotate: contextExpanded ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <ChevronRight className="h-2.5 w-2.5" strokeWidth={2} />
            </motion.div>
            context at queue time
          </button>
          <AnimatePresence>
            {contextExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                className="overflow-hidden mt-1.5"
              >
                <div
                  className="rounded-xl px-3 py-2.5 text-[11px] font-mono text-on-surface-muted/50 leading-relaxed space-y-1"
                  style={{
                    background: 'rgba(0,0,0,0.025)',
                    border: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
                  {msg.context_at_queue?.current_work && (
                    <p>
                      <span className="text-on-surface-muted/25">work:</span>{' '}
                      {msg.context_at_queue.current_work}
                    </p>
                  )}
                  {msg.context_at_queue?.active_plan && (
                    <p>
                      <span className="text-on-surface-muted/25">plan:</span>{' '}
                      {msg.context_at_queue.active_plan}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {!editing && (
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-on-surface-muted/40 hover:text-on-surface-muted/60 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleCancel}
            className={`text-[11px] transition-colors ${
              confirmCancel
                ? 'font-medium'
                : 'text-on-surface-muted/40 hover:text-on-surface-muted/60'
            }`}
            style={confirmCancel ? { color: '#C25B48' } : undefined}
          >
            {confirmCancel ? 'Confirm cancel' : 'Cancel'}
          </button>
          <button
            onClick={handlePromote}
            disabled={promoting}
            className="text-[11px] font-medium transition-opacity hover:opacity-70 disabled:opacity-40 ml-auto"
            style={{ color: '#1B7A3D' }}
          >
            {promoting ? 'Sending…' : 'Send now'}
          </button>
        </div>
      )}
    </div>
  )
}

function QueueDrawer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  // WS invalidation is the primary refresh path; the poll below is a safety
  // net in case the socket drops. 30s is plenty — mutations show instantly.
  // Pause polling when the tab is hidden so we don't hammer the backend from
  // a background tab the user isn't looking at (and isn't getting re-rendered).
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['message-queue'],
    queryFn: listPending,
    refetchInterval: (query) => {
      if (typeof document !== 'undefined' && document.hidden) return false
      return query.state.error ? false : 30_000
    },
    refetchIntervalInBackground: false,
    staleTime: 20_000,
    retry: 1,
  })

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sorted = [...messages].sort(
    (a, b) => new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime(),
  )

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['message-queue'] })
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.06)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="fixed top-0 right-0 bottom-0 z-40 flex flex-col overflow-hidden w-full sm:w-[40vw] sm:max-w-[480px]"
        style={{
          background: '#F9F9F9',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '-8px 0 32px -8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4" style={{ color: '#1B7A3D' }} strokeWidth={1.75} />
            <span className="text-sm font-medium text-on-surface">Queue</span>
            {messages.length > 0 && (
              <span className="text-[11px] font-mono text-on-surface-muted/35 ml-0.5">
                {messages.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-muted/40 hover:text-on-surface-muted/70 transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-xs text-on-surface-muted/30 font-mono">loading…</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Inbox className="h-8 w-8 text-on-surface-muted/15" strokeWidth={1.25} />
              <span className="text-xs text-on-surface-muted/30 font-mono">no queued messages</span>
            </div>
          ) : (
            <div>
              {sorted.map(msg => (
                <QueueMessageRow key={msg.id} msg={msg} onRefetch={handleRefetch} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}

// ─── Main CCStream ──────────────────────────────────────────────────

/** How many messages to show initially. Click "show earlier" to load more. */
const VISIBLE_BATCH = 30

export default function CCStream() {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputId = useId()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const allMessages = useOSSessionStore(s => s.messages)
  const status = useOSSessionStore(s => s.status)
  const streamText = useOSSessionStore(s => s.streamText)
  const streamTools = useOSSessionStore(s => s.streamTools)
  const streamThinking = useOSSessionStore(s => s.streamThinking)
  const addUserMessage = useOSSessionStore(s => s.addUserMessage)
  const handover = useOSSessionStore(s => s.handover)
  // Pinnacle P1: surface the pre-token "thinking" pulse during the gap
  // between assistant_message_starting and first text/tool event.
  const assistantTurnStarting = useOSSessionStore(s => s.assistantTurnStarting)

  // ─── Message queue state ────────────────────────────────────────────
  const [sendMode, setSendMode] = useState<'direct' | 'queue'>(() => {
    try {
      return (localStorage.getItem('eos.send_mode') as 'direct' | 'queue') || 'direct'
    } catch {
      return 'direct'
    }
  })
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false)
  const [queuedFlash, setQueuedFlash] = useState(false)
  const queryClient = useQueryClient()

  const handleSendModeChange = useCallback((mode: 'direct' | 'queue') => {
    setSendMode(mode)
    try {
      localStorage.setItem('eos.send_mode', mode)
    } catch {
      // storage unavailable
    }
  }, [])

  // Global Cmd/Ctrl+Shift+Q toggles the queue drawer.
  // Shift avoids the macOS Cmd+Q quit shortcut that the browser can't
  // reliably intercept. If the user is mid-edit in an input/textarea we
  // still allow the toggle — it's a navigation action, not a text one.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault()
        setQueueDrawerOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Only render the most recent `visibleCount` messages
  const messages = useMemo(() => {
    if (allMessages.length <= visibleCount) return allMessages
    return allMessages.slice(-visibleCount)
  }, [allMessages, visibleCount])
  const hasEarlier = allMessages.length > visibleCount


  // File handlers
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment))
    setAttachments(prev => [...prev, ...parsed])
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
    if (!imageItems.length) return
    e.preventDefault()
    const files = imageItems.map(i => i.getAsFile()).filter(Boolean) as File[]
    await handleFiles(files)
  }, [handleFiles])

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUp.current = distFromBottom > 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll on new messages or status changes — NOT on every streamText delta.
  // For streaming text, we use a separate throttled scroll below.
  useEffect(() => {
    if (!userScrolledUp.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, status])

  // Throttled auto-scroll during streaming — keeps up with text without
  // queuing dozens of smooth-scroll animations per second.
  const streamScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (status === 'streaming') {
      streamScrollTimer.current = setInterval(() => {
        if (!userScrolledUp.current) {
          chatEndRef.current?.scrollIntoView({ behavior: 'instant' })
        }
      }, 250) // 4x/sec is plenty smooth for following text
    } else {
      if (streamScrollTimer.current) {
        clearInterval(streamScrollTimer.current)
        streamScrollTimer.current = null
      }
    }
    return () => {
      if (streamScrollTimer.current) clearInterval(streamScrollTimer.current)
    }
  }, [status])

  // Safety net: poll backend status while streaming. If the WS `os-session:complete`
  // event is missed (connection blip, race condition), the frontend would stay stuck
  // in "streaming" forever. This catches that case by checking every 5s.
  //
  // Also: hard wall-clock timeout (15 min). Even if the backend is genuinely
  // thinking, the user should never see "thinking..." for longer than this —
  // finalize whatever we have and let them retry rather than spinner-forever.
  useEffect(() => {
    if (status !== 'streaming') return
    const STREAM_HARD_TIMEOUT_MS = 15 * 60 * 1000
    const streamStart = Date.now()
    const poll = setInterval(async () => {
      // Hard wall-clock gate first — no network call needed to enforce this.
      if (Date.now() - streamStart > STREAM_HARD_TIMEOUT_MS) {
        const store = useOSSessionStore.getState()
        if (store.status === 'streaming') {
          store.finalizeResponse()
        }
        return
      }
      try {
        const backendStatus = await getOSStatus()
        if (!backendStatus.active) {
          // Backend finished but we didn't get the WS complete event
          const store = useOSSessionStore.getState()
          if (store.status === 'streaming') {
            store.finalizeResponse()
          }
        }
      } catch { /* network error — don't finalize, keep waiting */ }
    }, 5000)
    return () => clearInterval(poll)
  }, [status])

  // Always scroll down when the user sends a new message
  const prevMessageCount = useRef(messages.length)
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg?.role === 'user') {
        userScrolledUp.current = false
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
    prevMessageCount.current = messages.length
  }, [messages])

  useEffect(() => { inputRef.current?.focus() }, [])

  // ─── Recovery: reconnect after tab close mid-turn ─────────────────
  // On mount, check if we had an in-flight request (lastUserMessageAt set).
  // If the last message is from the user with no assistant response, recover.
  useEffect(() => {
    const store = useOSSessionStore.getState()
    if (store.recoveryAttempted) return
    const { lastUserMessageAt, messages: msgs, streamText: existingStream, streamChunks: existingChunks } = store

    // Case 1: We have persisted streamChunks from a tab close mid-stream.
    // The WS is gone but we have partial data. Check backend status.
    // Case 2: Last message is user with no response — backend may have completed.
    const lastMsg = msgs[msgs.length - 1]
    const needsRecovery = lastUserMessageAt || (existingChunks.length > 0 && existingStream)
      || (lastMsg?.role === 'user' && msgs.filter(m => m.role === 'assistant').length < msgs.filter(m => m.role === 'user').length)

    if (!needsRecovery) return

    store.setRecoveryAttempted()

    // If we have partial stream data, show it immediately while we check backend
    if (existingStream && store.status !== 'streaming') {
      store.setStatus('streaming')
    }

    // Check backend status and recover
    ;(async () => {
      try {
        const backendStatus = await getOSStatus()

        if (backendStatus.active) {
          // Backend is still working — set streaming status, WS will pick up from here
          store.setStatus('streaming')
          return
        }

        // Backend finished (or idle). Try to recover the missed response.
        const sinceTs = lastUserMessageAt || lastMsg?.timestamp?.toISOString?.() || undefined
        const recovery = await recoverResponse(sinceTs ? String(sinceTs) : undefined)

        if (recovery.found && recovery.text) {
          // Clear any partial stream state first
          if (store.streamChunks.length > 0 || store.streamText) {
            // We have partial data — the recovered response is the complete version
            useOSSessionStore.setState({ streamChunks: [], streamText: '' })
          }
          store.injectRecoveredResponse(recovery.text, recovery.chunks)
        } else if (existingChunks.length > 0 || existingStream) {
          // No backend recovery but we have partial stream data — finalize what we have
          store.finalizeResponse()
        } else {
          // Nothing to recover — reset to idle
          store.setStatus('idle')
        }
      } catch {
        // Recovery failed — finalize any partial data we have
        if (existingChunks.length > 0 || existingStream) {
          store.finalizeResponse()
        } else {
          store.setStatus('idle')
        }
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async (modeOverride?: 'direct' | 'queue') => {
    const effectiveMode = modeOverride ?? sendMode
    const text = input.trim()
    if (!text && !attachments.length) return

    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // Upload every attachment to Supabase Storage and append only a compact
    // reference (name, type, size, public URL) to the message. The OS reads the
    // file in its own time via the URL — we never dump file contents into chat.
    const uploadedRefs: { label: string; name: string; type: string; size: number; url: string }[] = []
    const failedRefs: { name: string; size: number; type: string; reason: string }[] = []

    for (const a of currentAttachments) {
      try {
        const uploaded = await uploadAttachment(
          a.text != null
            ? { name: a.name, type: a.type, text: a.text }
            : { name: a.name, type: a.type, base64: a.dataUrl || '' }
        )
        uploadedRefs.push({
          label: a.type.startsWith('image/') ? 'Image' : 'File',
          name: uploaded.name,
          type: uploaded.type,
          size: uploaded.size,
          url: uploaded.url,
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error'
        failedRefs.push({ name: a.name, size: a.size, type: a.type, reason })
      }
    }

    let fullMessage = text
    if (uploadedRefs.length) {
      const lines = uploadedRefs.map(r =>
        `- [${r.label}] ${r.name} (${formatBytes(r.size)}, ${r.type}) → ${r.url}`
      )
      fullMessage = `${fullMessage}${fullMessage ? '\n\n' : ''}Attached files (fetch in your own time, do not assume contents):\n${lines.join('\n')}`
    }
    if (failedRefs.length) {
      const lines = failedRefs.map(r => `- ${r.name} (${formatBytes(r.size)}, ${r.type}) — upload failed: ${r.reason}`)
      fullMessage = `${fullMessage}${fullMessage ? '\n\n' : ''}Attachments that failed to upload:\n${lines.join('\n')}`
    }
    fullMessage = fullMessage.trim() || `[Attached ${currentAttachments.map(a => a.name).join(', ')}]`

    if (effectiveMode === 'queue') {
      // Queue mode: POST with mode='queue', show flash, refresh pill count.
      // Message does NOT appear in chat until it is promoted/delivered.
      sendOSMessage(fullMessage, 'queue').then(() => {
        setQueuedFlash(true)
        setTimeout(() => setQueuedFlash(false), 2000)
        queryClient.invalidateQueries({ queryKey: ['message-queue'] })
      }).catch(() => {
        // silent — queue request failed
      })
    } else {
      // Direct mode: existing behaviour — show in chat immediately, stream response.
      addUserMessage(fullMessage)

      // Fire-and-forget: the backend returns { accepted: true } immediately.
      // The real response streams via WebSocket (text_delta, tool_use,
      // os-session:complete events). We only care about HTTP errors here
      // (network down, 400 validation, 500 server crash on accept).
      sendOSMessage(fullMessage, 'direct').catch(() => {
        // HTTP POST itself failed — server unreachable or rejected the message.
        // This is different from a long-running session timing out.
        const store = useOSSessionStore.getState()
        if (store.status === 'streaming' && !store.streamText) {
          store.finalizeResponse()
          store.setStatus('error')
          useOSSessionStore.setState(s => ({
            messages: [...s.messages, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: 'Could not reach the server. Check your connection.',
              timestamp: new Date(),
            }],
          }))
        }
      })
    }
  }, [input, sendMode, attachments, addUserMessage, queryClient])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return // newline — existing behaviour
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+Enter = force the OPPOSITE of the current toggle (one-off override)
        handleSend(sendMode === 'direct' ? 'queue' : 'direct')
      } else {
        handleSend()
      }
    }
  }, [handleSend, sendMode])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Resize textarea without layout thrash: use requestAnimationFrame
    // to batch the height reset and measurement into one frame
    const el = e.target
    requestAnimationFrame(() => {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    })
  }, [])

  const handleAbort = useCallback(async () => {
    try {
      await abortOS()
    } catch {}
    // Force frontend to complete even if backend call fails
    const store = useOSSessionStore.getState()
    if (store.status === 'streaming') {
      store.finalizeResponse()
    }
  }, [])

  const handleRestart = useCallback(async () => {
    await restartOS()
    useOSSessionStore.getState().clearMessages()
  }, [])

  const hasMessages = messages.length > 0

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
      onDrop={async e => { e.preventDefault(); setIsDragging(false); await handleFiles(e.dataTransfer.files) }}
    >
      {/* Top-right chrome cluster — stacks horizontally so neither the queue
          pill nor the connection state indicator covers the other. Connection
          indicator sits further left (subtle, always-on), queue pill hugs the
          right edge (actionable, click-to-open). */}
      <div className="absolute top-3 right-4 z-40 flex items-center gap-2">
        {/* Pinnacle P1 — always-visible connection state chip. */}
        <div className="pointer-events-none">
          <ConnectionStateIndicator />
        </div>
        {/* Message queue pill — hidden when empty. */}
        <div className="pointer-events-auto">
          <AnimatePresence>
            <QueuePill onClick={() => setQueueDrawerOpen(true)} drawerOpen={queueDrawerOpen} />
          </AnimatePresence>
        </div>
      </div>

      {/* Queue drawer */}
      <AnimatePresence>
        {queueDrawerOpen && <QueueDrawer onClose={() => setQueueDrawerOpen(false)} />}
      </AnimatePresence>

      {/* Drop overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-4 rounded-3xl border-2 border-dashed" style={{ borderColor: 'rgba(27,122,61,0.35)', background: 'rgba(27,122,61,0.02)' }} />
            <div className="relative flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(27,122,61,0.08)' }}>
                <ImageIcon className="h-6 w-6" style={{ color: '#1B7A3D' }} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-on-surface">Drop to attach</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          {/* Ambient welcome — green + gold presence */}
          {!hasMessages && status !== 'streaming' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 60, damping: 20 }}
              className="flex flex-col items-center pt-[15vh] pb-4"
            >
              <span className="text-label-md font-mono uppercase tracking-[0.3em] text-on-surface-muted/25">
                Ambient Intelligence
              </span>
              <h1 className="mt-3 font-display text-display-lg font-light text-on-surface">
                Eco<span className="bg-gradient-to-r from-primary to-gold-bright bg-clip-text text-transparent font-normal">dia</span>OS
              </h1>

              {/* The Breath — green + gold */}
              <div className="mt-8 mb-6 flex items-center gap-2.5">
                {[
                  { color: '#1B7A3D', shadow: 'rgba(27,122,61,0.5)', delay: 0 },
                  { color: '#2ECC71', shadow: 'rgba(46,204,113,0.4)', delay: 0.25 },
                  { color: '#F59E0B', shadow: 'rgba(245,158,11,0.4)', delay: 0.5 },
                ].map((b, i) => (
                  <motion.div
                    key={i}
                    className="rounded-full"
                    style={{ backgroundColor: b.color, width: 3, height: 3, boxShadow: `0 0 8px ${b.shadow}` }}
                    animate={{ scale: [1, 2, 1], opacity: [0.3, 0.9, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, delay: b.delay, ease: 'easeInOut' }}
                  />
                ))}
              </div>

              <AmbientVitals />
              <div className="mt-3 w-full">
                <PendingActionsBanner />
              </div>
            </motion.div>
          )}

          {/* Conversation stream */}
          {hasMessages && (
            <div className="pb-32 pt-8 space-y-1">
              {hasEarlier && (
                <button
                  onClick={() => setVisibleCount(c => c + VISIBLE_BATCH)}
                  className="w-full text-center py-2 text-xs text-on-surface-muted/30 hover:text-on-surface-muted/50 transition-colors font-mono"
                >
                  show {Math.min(VISIBLE_BATCH, allMessages.length - visibleCount)} earlier messages
                </button>
              )}
              <AnimatePresence initial={false}>
                {messages.map(msg =>
                  msg.role === 'user'
                    ? <UserMessage key={msg.id} message={msg} />
                    : <AssistantMessage key={msg.id} message={msg} />
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Pinnacle P1 inline surfaces — banners (compaction, session events)
              and the pre-token thinking pulse. Both sit in the stream flow so
              they scroll with the conversation, not pinned chrome. */}
          <InlineBannerStack />
          <ThinkingIndicator visible={status === 'streaming' && assistantTurnStarting && !streamText && !streamThinking && streamTools.length === 0} />

          {status === 'streaming' && <StreamingIndicator text={streamText} tools={streamTools} thinking={streamThinking} />}
          <HandoverIndicator handover={handover} />
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input area — sits near the bottom, no background, black underline */}
      <div className="w-full px-6 pb-10 pt-2 lg:px-10">
        <div className="mx-auto max-w-3xl relative">
          {/* Queued confirmation flash */}
          <AnimatePresence>
            {queuedFlash && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-mono pointer-events-none whitespace-nowrap"
                style={{
                  background: 'rgba(27,122,61,0.10)',
                  border: '1px solid rgba(27,122,61,0.20)',
                  color: '#1B7A3D',
                }}
              >
                Queued
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment chips */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-2 flex flex-wrap gap-2 px-1 pb-1">
                  {attachments.map(a => (
                    <AttachmentChip key={a.id} file={a} onRemove={() => setAttachments(prev => prev.filter(f => f.id !== a.id))} />
                  ))}
                  {attachments.length > 1 && (
                    <button onClick={() => setAttachments([])} className="flex items-center gap-1 self-end rounded-lg px-2 py-1 text-[10px] text-on-surface/50 hover:text-error transition-colors">
                      <Trash2 className="h-3 w-3" strokeWidth={1.75} /> Clear all
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interrupt strip */}
          <AnimatePresence>
            {status === 'streaming' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-1"
              >
                <div className="flex items-center gap-2 px-1 pb-1">
                  <motion.div
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-amber-500"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[10px] font-mono text-on-surface/50 tracking-wide">
                    interrupt mode
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row — no background, single black bottom border */}
          <div className="flex items-end gap-3 py-3" style={{ borderBottom: '1px solid #000' }}>
            {/* Paperclip — pure black */}
            <label htmlFor={fileInputId} className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center text-black hover:opacity-60 transition-opacity">
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
            </label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.sh,.yaml,.yml,.toml,.sql,.html,.css,.xml,.doc,.docx,.xls,.xlsx"
              className="sr-only"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder=""
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-on-surface placeholder-on-surface/30 outline-none leading-relaxed"
              style={{ maxHeight: 200 }}
            />

            <SendModeToggle mode={sendMode} onChange={handleSendModeChange} />

            <div className="flex items-center gap-1">
              <AnimatePresence mode="wait">
                {status === 'streaming' ? (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    onClick={handleAbort}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-black text-white hover:bg-black/70 transition-colors"
                    title="Stop"
                  >
                    <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                  </motion.button>
                ) : messages.length > 0 ? (
                  <motion.button
                    key="restart"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    onClick={handleRestart}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-black hover:opacity-60 transition-opacity"
                    title="New session"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
