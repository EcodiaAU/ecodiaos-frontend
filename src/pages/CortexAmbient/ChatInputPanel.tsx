/**
 * ChatInputPanel - the focused input panel for typing to the OS.
 *
 * Round-3 bugfix, 2026-05-08, fork_mowu9a3g_f34229:
 *   - Bug 1 (400 "message is required"): the previous round was hand-rolling
 *     `api.post('/os-session/message', { content, priority })`, but the
 *     backend route at src/routes/osSession.js line 30 reads `req.body.message`
 *     and 400s when missing. Switched to the canonical `sendOSMessage()` from
 *     `@/api/osSession` which posts `{ message, mode }` and matches the shape
 *     CCStream uses. Also calls `addUserMessage(text)` first so the user
 *     bubble lands in the chat log immediately (matches CCStream pattern at
 *     line 2182). Without that the message disappeared from the input but
 *     never showed up as a user bubble.
 *   - Bug 3 (textarea doesn't auto-grow): the height was pinned by `rows={1}`
 *     and never re-measured. Added a useLayoutEffect that resets height to
 *     auto then to scrollHeight on every value change, capped at 30vh so
 *     long messages scroll inside the textarea instead of pushing the
 *     surrounding chat off-screen.
 *
 * Round-2 polish, 2026-05-08, fork_mowe5tuh_f2ddd3:
 *   - Real submit button (arrow-in-disc) instead of a tiny "send" text link.
 *   - Live "thinking" hairline under the input while OS is streaming.
 *   - Cmd+K affordance is always visible until first focus, then collapses.
 *   - Enter-glyph shown next to send button so the keyboard convention is
 *     readable at a glance.
 *
 * Bottom-anchored, narrow, glassy. Posts to /api/os-session/message.
 */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { sendOSMessage, abortOS, uploadAttachment } from '@/api/osSession'
import { useOSSessionStore } from '@/store/osSessionStore'

interface UploadedAttachment {
  url: string
  name: string
  type: string
  size: number
  extracted_text: string
}

interface PendingAttachment {
  localId: string
  name: string
  size: number
  type: string
  status: 'uploading' | 'done' | 'error'
  error?: string
  result?: UploadedAttachment
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

function buildEnrichedMessage(text: string, attachments: UploadedAttachment[]): string {
  if (attachments.length === 0) return text
  const blocks = attachments.map((a) => {
    const head = `<attachment name="${a.name}" type="${a.type}" size="${a.size}" url="${a.url}">`
    const body = a.extracted_text
      ? `\n${a.extracted_text}\n`
      : `\n(binary file — fetch from url to inspect)\n`
    return `${head}${body}</attachment>`
  })
  return `${text}\n\n${blocks.join('\n\n')}`.trim()
}

const PLACEHOLDERS = [
  'speak to ecodiaos',
  'what now',
  'next move',
  'tell it',
  'direct',
]

export function ChatInputPanel() {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [hasFocused, setHasFocused] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isStreaming = useOSSessionStore((s) => s.status === 'streaming')
  const addUserMessage = useOSSessionStore((s) => s.addUserMessage)

  const onAbort = async () => {
    if (aborting) return
    setAborting(true)
    try { await abortOS() } catch {}
    finally { setAborting(false) }
  }

  // Slow placeholder rotation for life
  useEffect(() => {
    const t = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length)
    }, 7000)
    return () => window.clearInterval(t)
  }, [])

  // Cmd/Ctrl+K focuses input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Auto-grow the textarea to fit content. useLayoutEffect (not useEffect) so
  // the resize lands in the same paint as the keystroke - prevents one-frame
  // flash where the textarea is at the old height before growing.
  // Capped at 30vh; beyond that the textarea scrolls internally.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = Math.round(window.innerHeight * 0.30)
    const next = Math.min(el.scrollHeight, max)
    el.style.height = next + 'px'
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [value])

  const uploadOne = async (file: File) => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setAttachments((prev) => [
      ...prev,
      { localId, name: file.name, size: file.size, type: file.type || 'application/octet-stream', status: 'uploading' },
    ])
    try {
      const dataUrl = await readFileAsBase64(file)
      const result = await uploadAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        base64: dataUrl,
      })
      setAttachments((prev) =>
        prev.map((a) => (a.localId === localId ? { ...a, status: 'done', result } : a)),
      )
    } catch (err: any) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.localId === localId
            ? { ...a, status: 'error', error: err?.message || 'upload failed' }
            : a,
        ),
      )
    }
  }

  const onFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
    for (const f of list) {
      // Fire-and-forget; uploads run in parallel.
      void uploadOne(f)
    }
  }

  const removeAttachment = (localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId))
  }

  const uploadsInFlight = attachments.some((a) => a.status === 'uploading')

  const onSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (sending || uploadsInFlight) return
    if (!value.trim() && attachments.length === 0) return
    setSending(true)
    const text = value
    const uploaded = attachments
      .filter((a): a is PendingAttachment & { result: UploadedAttachment } => a.status === 'done' && !!a.result)
      .map((a) => a.result)
    const enriched = buildEnrichedMessage(text, uploaded)
    setValue('')
    setAttachments([])
    addUserMessage(enriched)
    try {
      await sendOSMessage(enriched, 'direct')
    } catch (err) {
      setValue(text)
    } finally {
      setSending(false)
    }
  }

  const canSubmit =
    !sending && !uploadsInFlight && (value.trim().length > 0 || attachments.some((a) => a.status === 'done'))

  return (
    <form
      onSubmit={onSubmit}
      className="ambient-input w-full px-4 pb-2 pt-2"
      style={{
        // Round-4 (fork_moxykr7k_4cb6b2): sticky positioning lifted to the
        // parent ambient-bottom-stack wrapper in index.tsx so input + the
        // new StripRow share a single sticky context. Position here is just
        // relative-in-flow inside that wrapper.
        position: 'relative',
        zIndex: 20,
        background:
          'linear-gradient(180deg, rgba(6,7,10,0) 0%, rgba(6,7,10,0.86) 30%, rgba(6,7,10,0.96) 100%)',
      }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="relative rounded-md overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(15,18,24,0.55) 0%, rgba(8,10,14,0.78) 100%)',
            border: '1px solid rgba(255,178,122,0.22)',
            boxShadow: isStreaming
              ? '0 0 32px rgba(255,178,122,0.18), inset 0 0 18px rgba(255,178,122,0.08)'
              : '0 0 28px rgba(255,178,122,0.06), inset 0 0 14px rgba(255,178,122,0.04)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            transition: 'box-shadow 320ms ease-out',
          }}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {attachments.map((a) => (
                <AttachmentChip
                  key={a.localId}
                  attachment={a}
                  onRemove={() => removeAttachment(a.localId)}
                />
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-2.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            <AttachButton
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
            />
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setHasFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSubmit()
                }
              }}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              rows={1}
              className="flex-1 resize-none bg-transparent text-[14px] text-white placeholder:text-white/30 focus:outline-none"
              style={{ minHeight: '24px', maxHeight: '30vh', lineHeight: '1.45' }}
              disabled={sending}
            />
            {isStreaming && <StopButton aborting={aborting} onAbort={onAbort} />}
            <SubmitButton sending={sending} canSubmit={canSubmit} />
          </div>

          {/* Streaming hairline - subtle ember ribbon under the input while
              the OS is generating a reply. Visceral feedback the OS is alive. */}
          <StreamingRibbon active={isStreaming} />
        </div>

        {/* Affordance row. Cmd+K hint hides after first focus to reduce noise. */}
        <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] uppercase tracking-[0.2em] text-white/25 select-none">
          <span style={{ opacity: hasFocused ? 0.55 : 1, transition: 'opacity 360ms ease-out' }}>
            <Kbd>⌘K</Kbd> focus &middot; <Kbd>↵</Kbd> send &middot; <Kbd>⇧↵</Kbd> newline
          </span>
          <span><Kbd>⌃ .</Kbd> audio</span>
        </div>
      </div>
    </form>
  )
}

function StopButton({ aborting, onAbort }: { aborting: boolean; onAbort: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbort}
      disabled={aborting}
      aria-label="stop turn"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: '1px solid rgba(248,113,113,0.50)',
        background: 'radial-gradient(circle at 50% 40%, rgba(248,113,113,0.28) 0%, rgba(248,113,113,0.04) 70%)',
        color: aborting ? 'rgba(248,113,113,0.45)' : '#f87171',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: aborting ? 'default' : 'pointer',
        transition: 'all 200ms ease-out',
        boxShadow: '0 0 10px rgba(248,113,113,0.18)',
      }}
    >
      {aborting ? <SpinnerGlyph /> : <StopGlyph />}
    </button>
  )
}

function StopGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  )
}

function SubmitButton({ sending, canSubmit }: { sending: boolean; canSubmit: boolean }) {
  return (
    <button
      type="submit"
      disabled={!canSubmit}
      aria-label="send message"
      className="group relative flex items-center justify-center"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: canSubmit ? '1px solid rgba(255,178,122,0.55)' : '1px solid rgba(255,255,255,0.08)',
        background: canSubmit
          ? 'radial-gradient(circle at 50% 40%, rgba(255,178,122,0.42) 0%, rgba(255,178,122,0.04) 70%)'
          : 'transparent',
        color: canSubmit ? '#ffb27a' : 'rgba(255,255,255,0.18)',
        transition: 'all 200ms ease-out',
        cursor: canSubmit ? 'pointer' : 'default',
        boxShadow: canSubmit ? '0 0 10px rgba(255,178,122,0.22)' : 'none',
      }}
    >
      {sending ? (
        <SpinnerGlyph />
      ) : (
        <ArrowGlyph />
      )}
    </button>
  )
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13 L8 3" />
      <path d="M3.5 7.5 L8 3 L12.5 7.5" />
    </svg>
  )
}

function SpinnerGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round"
      style={{ animation: 'ambient-spin 0.9s linear infinite' }}>
      <circle cx="8" cy="8" r="5.4" opacity="0.25" />
      <path d="M8 2.6 A5.4 5.4 0 0 1 13.4 8" />
    </svg>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1 py-px rounded-sm border border-white/10 bg-white/5 mx-0.5"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", letterSpacing: '0.04em' }}>
      {children}
    </span>
  )
}

function StreamingRibbon({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
      style={{ opacity: active ? 1 : 0, transition: 'opacity 240ms ease-out' }}
    >
      <div
        style={{
          height: '1px',
          width: '40%',
          background: 'linear-gradient(90deg, rgba(255,178,122,0) 0%, rgba(255,178,122,0.95) 50%, rgba(255,178,122,0) 100%)',
          animation: 'ambient-ribbon 2.4s linear infinite',
          boxShadow: '0 0 6px rgba(255,178,122,0.7)',
        }}
      />
    </div>
  )
}

function AttachButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="attach file"
      title="attach file"
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'transparent',
        color: disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,178,122,0.85)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 180ms ease-out',
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 4 L5.5 9 a2 2 0 0 0 2.8 2.8 L13 7 a3.5 3.5 0 0 0 -5 -5 L3 7 a5 5 0 0 0 7 7 L14 10" />
      </svg>
    </button>
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment
  onRemove: () => void
}) {
  const isUploading = attachment.status === 'uploading'
  const isError = attachment.status === 'error'
  const result = attachment.result
  const hasExtraction = !!result?.extracted_text
  const borderColor = isError
    ? 'rgba(248,113,113,0.45)'
    : isUploading
    ? 'rgba(255,178,122,0.30)'
    : 'rgba(255,178,122,0.45)'

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px]"
      style={{
        background: 'rgba(255,178,122,0.06)',
        border: `1px solid ${borderColor}`,
        color: isError ? '#f87171' : 'rgba(255,255,255,0.88)',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: '0.02em',
        maxWidth: 280,
      }}
      title={
        isError
          ? `error: ${attachment.error}`
          : isUploading
          ? 'uploading…'
          : hasExtraction
          ? `${attachment.name} · text extracted`
          : attachment.name
      }
    >
      {isUploading ? (
        <SpinnerGlyph />
      ) : isError ? (
        <span aria-hidden style={{ color: '#f87171' }}>!</span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: hasExtraction ? '#5fe89d' : '#ffb27a',
            boxShadow: `0 0 4px ${hasExtraction ? '#5fe89d' : '#ffb27a'}`,
            display: 'inline-block',
          }}
        />
      )}
      <span className="truncate" style={{ maxWidth: 180 }}>
        {attachment.name}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
        {formatBytes(attachment.size)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="remove attachment"
        style={{
          marginLeft: 2,
          color: 'rgba(255,255,255,0.45)',
          cursor: 'pointer',
          padding: 0,
          background: 'transparent',
          border: 'none',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
