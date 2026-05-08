/**
 * ChatInputPanel - the focused input panel for typing to the OS.
 *
 * Round-2 polish, 2026-05-08, fork_mowe5tuh_f2ddd3:
 *   - Real submit button (arrow-in-disc) instead of a tiny "send" text link.
 *   - Live "thinking" hairline under the input while OS is streaming.
 *   - Cmd+K affordance is always visible until first focus, then collapses.
 *   - Enter-glyph shown next to send button so the keyboard convention is
 *     readable at a glance.
 *   - On submit, the message text disappears immediately as before; on error
 *     the text restores; on success we never re-show it (the assistant has it).
 *
 * Bottom-anchored, narrow, glassy. Posts to /api/os-session/message.
 */
import React, { useState, useEffect, useRef } from 'react'
import api from '@/api/client'
import { useOSSessionStore } from '@/store/osSessionStore'

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
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [hasFocused, setHasFocused] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const isStreaming = useOSSessionStore((s) => s.status === 'streaming')

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

  const onSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!value.trim() || sending) return
    setSending(true)
    const text = value
    setValue('')
    try {
      // api client baseURL is already '/api'; do NOT double-prefix or every send 404s
      // (text would clear, request fail, then catch path restores it -> "disappear and reappear" bug).
      await api.post('/os-session/message', { content: text, priority: false })
    } catch (err) {
      // restore on error
      setValue(text)
    } finally {
      setSending(false)
    }
  }

  const canSubmit = !sending && value.trim().length > 0

  return (
    <form
      onSubmit={onSubmit}
      className="ambient-input w-full px-4 pb-4 pt-2 lg:static"
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        background:
          'linear-gradient(180deg, rgba(6,7,10,0) 0%, rgba(6,7,10,0.86) 30%, rgba(6,7,10,0.96) 100%)',
      }}
    >
      <div className="mx-auto max-w-3xl">
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
          <div className="flex items-end gap-2 px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#ffb27a]/80 pt-1.5 select-none">›</span>
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
              style={{ minHeight: '24px', maxHeight: '200px' }}
              disabled={sending}
            />
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
