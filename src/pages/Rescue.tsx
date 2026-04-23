import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Send, Square } from 'lucide-react'
import { useRescueStore } from '@/store/rescueStore'
import {
  sendRescueMessage,
  invokeRescue,
  abortRescue,
  resetRescue,
  getRescueStatus,
} from '@/api/rescue'

/**
 * Rescue — standalone chat surface for the ecodia-rescue process.
 *
 * Mirrors Cortex's quiet/spacious aesthetic. The only visual signal that
 * this isn't main OS is a single "rescue" label + a subtle amber accent
 * on the send button. Deliberate: they're the same *kind* of thing (a
 * CC session you chat with), they just have different jobs.
 */
export default function RescuePage() {
  const ready = useRescueStore(s => s.ready)
  const status = useRescueStore(s => s.status)
  const messages = useRescueStore(s => s.messages)
  const streamText = useRescueStore(s => s.streamText)
  const tools = useRescueStore(s => s.tools)
  const addUserMessage = useRescueStore(s => s.addUserMessage)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Sync ready/status from REST on mount so we don't rely purely on WS events.
  useEffect(() => {
    let cancelled = false
    getRescueStatus().then(s => {
      if (cancelled) return
      useRescueStore.getState().setReady(s.ready)
      useRescueStore.getState().setStatus(s.status)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages.length, streamText, tools.length])

  const isStreaming = status === 'streaming'
  const hasContent = messages.length > 0 || streamText || tools.length > 0

  const handleSend = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    addUserMessage(text)
    setInput('')
    try {
      await sendRescueMessage(text)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addUserMessage(`[send failed: ${msg}]`)
    } finally {
      setSending(false)
    }
  }

  const handleInvoke = async () => {
    if (sending) return
    setSending(true)
    addUserMessage('(auto-invoke with crisis brief)')
    try {
      await invokeRescue({ reason: 'manual_invocation_from_ui' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addUserMessage(`[invoke failed: ${msg}]`)
    } finally {
      setSending(false)
    }
  }

  const handleAbort = async () => {
    try { await abortRescue('user_abort') } catch {}
  }

  const handleReset = async () => {
    try {
      await resetRescue()
      useRescueStore.getState().reset()
    } catch {}
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea with content, matches Cortex.
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    requestAnimationFrame(() => {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    })
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-6 lg:px-10 pt-12 pb-32">
          {/* Empty state — quiet, one line, one affordance */}
          {!hasContent && (
            <div className="flex flex-col items-center pt-[20vh]">
              <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-on-surface-muted/40">
                rescue
              </span>
              <p className="mt-4 text-sm text-on-surface/50 text-center max-w-sm">
                Separate session. Narrow toolset. Use when main is stuck.
              </p>
              <button
                onClick={handleInvoke}
                disabled={!ready || sending}
                className="mt-6 text-[11px] font-mono text-amber-700 hover:text-amber-800 transition-colors disabled:opacity-30"
              >
                invoke with crisis brief →
              </button>
            </div>
          )}

          {/* Messages */}
          {messages.map(m => (
            <div key={m.id} className="mb-6">
              {m.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] text-sm text-on-surface bg-on-surface/[0.04] rounded-2xl px-4 py-2.5 whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : m.role === 'assistant' ? (
                <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <div className="text-[11px] font-mono text-on-surface-muted/50 italic">
                  {m.content}
                </div>
              )}
            </div>
          ))}

          {/* Streaming text */}
          {streamText && (
            <div className="mb-6 text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
              {streamText}
            </div>
          )}

          {/* Active tools — quiet inline list */}
          {tools.length > 0 && (
            <div className="mb-6 space-y-0.5">
              {tools.map(t => (
                <div key={t.id} className="text-[11px] font-mono text-on-surface-muted/50">
                  <span>{t.name}</span>
                  {t.completedAt && (
                    <span className={`ml-2 ${t.isError ? 'text-red-600/70' : 'text-emerald-700/70'}`}>
                      {t.isError ? 'error' : 'done'}
                    </span>
                  )}
                  {!t.completedAt && <span className="ml-2 italic">…</span>}
                </div>
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input — same shape as Cortex, amber accent on send */}
      <div className="w-full px-6 pb-10 pt-2 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 py-3" style={{ borderBottom: '1px solid #000' }}>
            <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-amber-700/70 pb-2">
              rescue
            </span>
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder={ready ? '' : 'offline'}
              disabled={!ready}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-on-surface placeholder-on-surface/30 outline-none leading-relaxed disabled:opacity-40"
              style={{ maxHeight: 200 }}
            />

            <div className="flex items-center gap-1">
              {isStreaming ? (
                <button
                  onClick={handleAbort}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-black text-white hover:bg-black/70 transition-colors"
                  title="Stop"
                >
                  <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                </button>
              ) : (
                <>
                  {hasContent && (
                    <button
                      onClick={handleReset}
                      className="flex h-7 w-7 items-center justify-center text-on-surface/40 hover:text-on-surface/80 transition-colors"
                      title="Reset — start fresh rescue conversation"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending || !ready}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-amber-700 hover:text-amber-800 transition-colors disabled:opacity-30"
                    title="Send"
                  >
                    <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
