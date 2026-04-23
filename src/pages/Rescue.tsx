import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Send, Square, Zap } from 'lucide-react'
import { useRescueStore } from '@/store/rescueStore'
import {
  sendRescueMessage,
  invokeRescue,
  abortRescue,
  getRescueStatus,
  getRescueBrief,
} from '@/api/rescue'

/**
 * Rescue — standalone chat surface for the ecodia-rescue process.
 *
 * Intentionally stark: monospace, dark, utilitarian. Signal that this is
 * NOT your main OS — it's a second coding-focused instance you bring in
 * when the main one is broken. No ambient chrome, no energy chips, no
 * queue UI. Just send, receive, stop.
 */
export default function RescuePage() {
  const ready = useRescueStore(s => s.ready)
  const status = useRescueStore(s => s.status)
  const messages = useRescueStore(s => s.messages)
  const streamText = useRescueStore(s => s.streamText)
  const streamThinking = useRescueStore(s => s.streamThinking)
  const tools = useRescueStore(s => s.tools)
  const addUserMessage = useRescueStore(s => s.addUserMessage)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [briefPreview, setBriefPreview] = useState<string | null>(null)
  const [showBrief, setShowBrief] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Poll /rescue/status on mount so we know ready state even if the WS
  // rescue:ready event fired before this page mounted.
  useEffect(() => {
    let cancelled = false
    getRescueStatus().then(s => {
      if (cancelled) return
      useRescueStore.getState().setReady(s.ready)
      useRescueStore.getState().setStatus(s.status)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages.length, streamText, tools.length])

  const isStreaming = status === 'streaming'

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

  const handleInvokeWithBrief = async () => {
    if (sending) return
    setSending(true)
    addUserMessage('[Auto-invoke with crisis brief]')
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

  const handlePreviewBrief = async () => {
    if (briefPreview) {
      setShowBrief(v => !v)
      return
    }
    try {
      const text = await getRescueBrief('preview')
      setBriefPreview(text)
      setShowBrief(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setBriefPreview(`[brief preview failed: ${msg}]`)
      setShowBrief(true)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0a0a0a] text-[#e8e8e8] font-mono">
      {/* Header — obvious this isn't main OS */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#1f1f1f]">
        <AlertTriangle className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
        <span className="text-[13px] tracking-wide text-amber-400">RESCUE</span>
        <span className="text-[11px] text-[#666]">ecodia-rescue · Sonnet 4.6 · narrow toolset</span>
        <div className="flex-1" />
        <span className="text-[11px] text-[#888]">
          {ready ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> ready · {status}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> offline
            </span>
          )}
        </span>
      </div>

      {/* Brief preview (toggleable) */}
      {showBrief && briefPreview && (
        <div className="border-b border-[#1f1f1f] bg-[#0f0f0f] max-h-[40vh] overflow-auto">
          <div className="px-6 py-3 text-[11px] whitespace-pre-wrap text-[#999]">
            {briefPreview}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-4 text-[13px] leading-relaxed">
          {messages.length === 0 && !streamText && (
            <div className="text-[#666] text-[12px] py-8">
              Rescue is {ready ? 'ready' : 'offline'}. Send a message, or click <span className="text-amber-400">Invoke</span> to fire an auto-composed crisis brief.
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className="flex gap-3">
              <span className={`flex-shrink-0 text-[10px] uppercase tracking-[0.15em] pt-1 ${
                m.role === 'user' ? 'text-[#666]' : m.role === 'system' ? 'text-[#555]' : 'text-amber-400/70'
              }`}>
                {m.role === 'user' ? 'tate' : m.role === 'system' ? 'sys' : 'rescue'}
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-words font-mono text-[13px] text-[#d8d8d8]">
                {m.content}
              </pre>
            </div>
          ))}

          {/* In-flight thinking */}
          {streamThinking && (
            <div className="flex gap-3 opacity-60">
              <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.15em] pt-1 text-[#555]">
                ...
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-words font-mono text-[12px] text-[#888] italic">
                {streamThinking}
              </pre>
            </div>
          )}

          {/* In-flight text */}
          {streamText && (
            <div className="flex gap-3">
              <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.15em] pt-1 text-amber-400/70">
                rescue
              </span>
              <pre className="flex-1 whitespace-pre-wrap break-words font-mono text-[13px] text-[#d8d8d8]">
                {streamText}
              </pre>
            </div>
          )}

          {/* Active tools */}
          {tools.length > 0 && (
            <div className="border-l-2 border-amber-400/30 pl-3 space-y-1">
              {tools.map(t => (
                <div key={t.id} className="text-[11px] text-[#888]">
                  <span className="text-amber-400/70">{t.name}</span>
                  {t.completedAt ? (
                    <span className={`ml-2 ${t.isError ? 'text-red-400' : 'text-emerald-400/70'}`}>
                      {t.isError ? 'error' : 'ok'}
                    </span>
                  ) : (
                    <span className="ml-2 text-[#555] italic">running…</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#1f1f1f] px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-end gap-3">
          <button
            onClick={handlePreviewBrief}
            className="text-[11px] px-2 py-1 rounded text-[#888] hover:text-amber-400 transition-colors"
            title="Preview what the crisis brief would contain"
          >
            {showBrief ? 'hide brief' : 'preview brief'}
          </button>

          <button
            onClick={handleInvokeWithBrief}
            disabled={sending || !ready}
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
            title="Send an auto-composed crisis brief"
          >
            <Zap className="h-3 w-3" strokeWidth={2} />
            invoke
          </button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={ready ? 'message rescue…' : 'rescue is offline'}
            disabled={!ready}
            rows={1}
            className="flex-1 resize-none bg-transparent border-b border-[#2a2a2a] focus:border-amber-400/50 outline-none text-[13px] py-2 px-1 placeholder-[#444] text-[#e8e8e8] disabled:opacity-40"
            style={{ maxHeight: 240 }}
          />

          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="flex h-7 w-7 items-center justify-center rounded bg-amber-400 text-black hover:bg-amber-300 transition-colors"
              title="Abort"
            >
              <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !ready}
              className="flex h-7 w-7 items-center justify-center rounded bg-amber-400 text-black hover:bg-amber-300 transition-colors disabled:opacity-40"
              title="Send"
            >
              <Send className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
