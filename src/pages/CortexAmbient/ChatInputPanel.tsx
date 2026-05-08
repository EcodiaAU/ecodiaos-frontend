/**
 * ChatInputPanel - the focused input panel for typing to the OS.
 *
 * Bottom-anchored, narrow, glassy. Posts to /api/os-session/message.
 * Always visible because chatting IS the primary interaction. We use
 * a real frosted-glass surface (multi-layer blur + ember edge glow)
 * NOT a cheap CSS backdrop-filter alone.
 */
import React, { useState, useEffect, useRef } from 'react'
import api from '@/api/client'

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
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

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

  return (
    <form onSubmit={onSubmit} className="ambient-input pointer-events-auto absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="relative rounded-md"
          style={{
            background: 'linear-gradient(180deg, rgba(15,18,24,0.55) 0%, rgba(8,10,14,0.78) 100%)',
            border: '1px solid rgba(255,178,122,0.22)',
            boxShadow: '0 0 28px rgba(255,178,122,0.06), inset 0 0 14px rgba(255,178,122,0.04)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
          }}
        >
          <div className="flex items-end gap-2 px-3 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#ffb27a]/80 pt-1.5">›</span>
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
            <button
              type="submit"
              disabled={sending || !value.trim()}
              className="text-[10px] uppercase tracking-[0.22em] text-[#ffb27a] disabled:text-white/15 hover:text-white transition-colors px-2 py-1"
            >
              {sending ? '...' : 'send'}
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] uppercase tracking-[0.2em] text-white/25">
          <span>cmd+k focus · enter send · shift+enter newline</span>
          <span>ctrl+. audio</span>
        </div>
      </div>
    </form>
  )
}
