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
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RotateCcw, Brain, ChevronDown,
  Mail, DollarSign, Zap, Activity,
  GitBranch, TrendingUp, Download,
  Paperclip, FileText, X, Trash2, Image as ImageIcon, Square,
} from 'lucide-react'
// SpatialLayer removed from input area to fix jitter
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidBlock } from '@/components/MermaidBlock'
import { MessageErrorBoundary } from '@/components/shared/MessageErrorBoundary'
import { useOSSessionStore, type OSSessionMessage, type LiveToolCall } from '@/store/osSessionStore'
import { sendOSMessage, restartOS, getOSStatus, recoverResponse, uploadAttachment, abortOS } from '@/api/osSession'
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
  const toolUses = chunks.filter(c => c.type === 'tool_use')
  const thinkingBlocks = chunks.filter(c => c.type === 'thinking')
  const displayText = textContent || message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 80, damping: 22, delay: 0.04 }}
      className="py-3 space-y-3"
    >
      {/* Thinking blocks — collapsible, green tint */}
      {thinkingBlocks.map((t, i) => (
        <ThinkingBlock key={`think-${i}`} content={t.content} />
      ))}

      {/* Tool badges — futuristic neural activity pills */}
      {toolUses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {toolUses.map((t, i) => {
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
                {/* Pulse dot */}
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
    </motion.div>
  )
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
 * Throttled streaming markdown — renders markdown at ~5fps (every 200ms)
 * instead of on every rAF flush (~30fps). This is the single biggest
 * performance win: ReactMarkdown parsing + remark-gfm is expensive and
 * the visual difference between 5fps and 30fps markdown rendering is
 * imperceptible during streaming (the text is growing, not reflowing).
 */
const StreamMarkdown = memo(function StreamMarkdown({ text }: { text: string }) {
  const [rendered, setRendered] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestText = useRef(text)
  latestText.current = text

  useEffect(() => {
    // Immediately render if this is the first text
    if (!rendered && text) { setRendered(text); return }

    // Throttle subsequent updates to 200ms
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setRendered(latestText.current)
      }, 200)
    }
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // On unmount or when text becomes empty, flush
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (!rendered) return null
  return (
    <MessageErrorBoundary fallbackText={rendered}>
      <div className="cortex-prose text-sm leading-[1.85] text-on-surface-variant">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url} components={MARKDOWN_COMPONENTS}>{rendered}</ReactMarkdown>
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

/** Live tool activity feed — shows what the OS is doing right now */
function LiveToolFeed({ tools }: { tools: LiveToolCall[] }) {
  // Tick every second to update elapsed timers on active tools
  const [, setTick] = useState(0)
  const hasActive = tools.some(t => !t.completedAt)
  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasActive])

  if (tools.length === 0) return null

  // Show the last 4 tools (most recent at bottom)
  const visible = tools.slice(-4)

  return (
    <div className="space-y-1">
      {visible.map((t) => {
        const accent = getToolAccent(t.name)
        const isActive = !t.completedAt
        const elapsed = isActive
          ? Math.round((Date.now() - t.startedAt) / 1000)
          : Math.round(((t.completedAt || t.startedAt) - t.startedAt) / 1000)

        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: isActive ? 1 : 0.45, x: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            className="flex items-center gap-2"
          >
            {/* Pulse dot — animated while active, static when done */}
            {isActive ? (
              <motion.div
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: accent.color, boxShadow: `0 0 6px ${accent.color}60` }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            ) : (
              <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent.color, opacity: 0.3 }} />
            )}
            <span className="text-[11px] font-mono tracking-wide" style={{ color: isActive ? `${accent.color}cc` : `${accent.color}66` }}>
              {friendlyToolName(t.name)}
            </span>
            <span className="text-[10px] font-mono text-on-surface-muted/20">
              {elapsed}s
            </span>
          </motion.div>
        )
      })}
      {tools.length > 4 && (
        <span className="text-[10px] font-mono text-on-surface-muted/20 pl-3.5">
          +{tools.length - 4} earlier
        </span>
      )}
    </div>
  )
}

function StreamingIndicator({ text, tools, thinking }: { text: string; tools: LiveToolCall[]; thinking: string }) {
  const activeTools = tools.filter(t => !t.completedAt)

  // Determine status label
  let statusLabel = 'thinking'
  if (activeTools.length > 0) statusLabel = `using ${friendlyToolName(activeTools[activeTools.length - 1].name)}`
  else if (text) statusLabel = 'working'
  else if (thinking) statusLabel = 'reasoning'

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
        </span>
        {tools.length > 0 && (
          <span className="text-[10px] text-on-surface-muted/15 font-mono ml-auto">
            {tools.filter(t => t.completedAt).length}/{tools.length} tools
          </span>
        )}
      </div>
    </motion.div>
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

  const handleSend = useCallback(async () => {
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

    addUserMessage(fullMessage)

    // Fire-and-forget: the backend returns { accepted: true } immediately.
    // The real response streams via WebSocket (text_delta, tool_use,
    // os-session:complete events). We only care about HTTP errors here
    // (network down, 400 validation, 500 server crash on accept).
    sendOSMessage(fullMessage).catch(() => {
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
  }, [input, addUserMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

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

          {status === 'streaming' && <StreamingIndicator text={streamText} tools={streamTools} thinking={streamThinking} />}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input area — sits near the bottom, no background, black underline */}
      <div className="w-full px-6 pb-10 pt-2 lg:px-10">
        <div className="mx-auto max-w-3xl">
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
