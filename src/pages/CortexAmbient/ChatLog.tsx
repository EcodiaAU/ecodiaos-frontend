/**
 * ChatLog - the 2D readable chat overlay above the input panel.
 *
 * Round-3 bugfix, 2026-05-08, fork_mowu9a3g_f34229:
 *   - Markdown rendering: messages were being rendered as plain pre-wrapped
 *     text. Now wrapped in ReactMarkdown (remarkGfm + rehypeRaw) so headings,
 *     lists, code blocks, links, bold all render. Mirrors the canonical
 *     setup in src/pages/Cortex/blocks/TextBlock.tsx and CCStream.tsx.
 *   - Doctrine-noise + model-XML scaffold tags stripped before render via
 *     stripDoctrineNoise (handles <now>, <doctrine_surface>, <forks_rollup>,
 *     <recent_doctrine>, <relevant_memory>, <restart_recovery>,
 *     <recent_exchanges>, <last_turn_breadcrumb>, <perception_summary>,
 *     <skills_surface> AND [APPLIED]/[NOT-APPLIED]/[BRIEF-CHECK WARN]/etc
 *     tag-prefix lines) plus a local STRIP_TAGS regex for model scaffold
 *     tags (analysis, thinking, scratchpad, reasoning, reflection, summary,
 *     aside, plan, inner_monologue) per
 *     ~/ecodiaos/patterns/frontend-strip-model-xml-tags.md and
 *     ~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md
 *
 * Round-2 polish, 2026-05-08, fork_mowe5tuh_f2ddd3.
 *
 * Round 1 rendered messages exclusively as 3D-Billboard text drifting up
 * a beam. That looks ambient but is functionally unreadable: you cannot
 * actually consume an assistant reply at length when the text is floating
 * in WebGL space. The 3D ChatBeam is preserved as ambience (recent message
 * cards drifting up the conductor's beam) but THIS panel is the lead
 * readable surface.
 *
 * Design rules:
 *   - Coexists with the 3D scene without occluding the conductor presence.
 *   - Top-edge fades into the scene (no hard rectangle border).
 *   - Auto-scrolls to the bottom on new messages, UNLESS the user has
 *     scrolled up - in which case a "new" pill appears so they can jump
 *     back to live.
 *   - Streams the live assistant turn token-by-token in the assistant
 *     slot when status === 'streaming'.
 *   - Newest at bottom (chat convention). Inverted-stack from the 3D beam
 *     (which renders newest at base, oldest at top) on purpose - the two
 *     surfaces serve different functions.
 *   - No emoji, no tagline, no wordmark. Typography carries the brand.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useOSSessionStore } from '@/store/osSessionStore'
import { stripDoctrineNoise } from '@/utils/stripDoctrineNoise'

const MAX_RENDERED = 30 // hard cap on what we render in this panel

// Model XML scaffold tags that occasionally leak into rendered text. Per
// ~/ecodiaos/patterns/frontend-strip-model-xml-tags.md - strip the tags but
// keep the inner content (the model's reasoning is sometimes load-bearing,
// just shouldn't show up as `<analysis>foo</analysis>` literal text).
const STRIP_TAGS = ['analysis', 'thinking', 'scratchpad', 'reasoning', 'reflection', 'summary', 'aside', 'plan', 'inner_monologue']
const STRIP_TAGS_RE = new RegExp(`</?(?:${STRIP_TAGS.join('|')})\\b[^>]*>`, 'gi')

function cleanForRender(raw: string): string {
  if (!raw) return ''
  // 1. system-injection blocks + tag-prefix lines (multi-line aware, fence-safe).
  const a = stripDoctrineNoise(raw)
  // 2. model-XML scaffold tags - strip only the tag pair, keep inner text.
  return a.replace(STRIP_TAGS_RE, '')
}

export function ChatLog() {
  const messages = useOSSessionStore((s) => s.messages)
  const status = useOSSessionStore((s) => s.status)
  const streamText = useOSSessionStore((s) => s.streamText)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [hasNew, setHasNew] = useState(false)

  const recent = useMemo(() => messages.slice(-MAX_RENDERED), [messages])

  // Detect manual scroll-up; if user scrolls up, we stop auto-pinning.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = distFromBottom < 24
      setStickToBottom(atBottom)
      if (atBottom) setHasNew(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to bottom on message changes / live streaming, IF still pinned.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight
      setHasNew(false)
    } else {
      // Only mark new if a fresh message added (not just stream tick).
      setHasNew(true)
    }
  }, [recent.length, stickToBottom])

  // Stream-tick auto-scroll without flipping hasNew on every chunk.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottom) return
    el.scrollTop = el.scrollHeight
  }, [streamText, stickToBottom])

  const isStreaming = status === 'streaming'
  const isError = status === 'error'

  // If empty and idle, render nothing (the input panel carries the moment).
  if (recent.length === 0 && !isStreaming && !isError) return null

  return (
    <div className="ambient-chatlog relative w-full px-4">
      <div className="mx-auto max-w-3xl relative">
        {/* Scroll surface — flows in document layout, not fixed-overlay */}
        <div
          ref={scrollRef}
          className="ambient-chatlog-scroll"
          style={{
            minHeight: 'min(48vh, 360px)',
            maxHeight: 'min(60vh, 600px)',
            overflowY: 'auto',
            background: 'linear-gradient(180deg, rgba(8,10,14,0.55) 0%, rgba(6,7,10,0.78) 100%)',
            borderRadius: 6,
            border: '1px solid rgba(255,178,122,0.10)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,178,122,0.25) transparent',
          }}
        >
          <div className="px-5 py-4 space-y-4">
            {recent.map((m) => (
              <Bubble key={m.id} role={m.role} content={m.content} />
            ))}
            {isStreaming && (
              <Bubble role="assistant" content={streamText} streaming />
            )}
            {isError && recent[recent.length - 1]?.role === 'user' && (
              <ErrorLine />
            )}
          </div>
        </div>

        {/* Floating "new" pill when user has scrolled up */}
        {hasNew && !stickToBottom && (
          <button
            onClick={() => {
              const el = scrollRef.current
              if (el) el.scrollTop = el.scrollHeight
              setStickToBottom(true)
              setHasNew(false)
            }}
            className="absolute right-3 -top-3 rounded-full px-3 py-1 text-[9px] uppercase tracking-[0.22em] text-[#06070a] font-medium shadow-lg"
            style={{
              background: '#ffb27a',
              boxShadow: '0 0 12px rgba(255,178,122,0.55)',
            }}
          >
            new ↓
          </button>
        )}
      </div>
    </div>
  )
}

interface BubbleProps {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

function Bubble({ role, content, streaming = false }: BubbleProps) {
  const isUser = role === 'user'
  const cleaned = useMemo(() => cleanForRender(content), [content])

  // User messages stay as plain text (mono, preserves whitespace) so pasted
  // logs / commands render verbatim. Assistant messages render markdown.
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className="text-[9px] uppercase tracking-[0.28em]"
          style={{ color: isUser ? '#f0a847' : '#ffb27a' }}
        >
          {isUser ? 'tate' : 'ecodiaos'}
        </span>
        {streaming && <StreamDot />}
      </div>
      {isUser ? (
        <div
          className="text-[13.5px] leading-[1.55] whitespace-pre-wrap break-words"
          style={{
            color: 'rgba(232,236,242,0.92)',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {cleaned}
          {streaming && <Cursor />}
        </div>
      ) : (
        <div
          className="ambient-md text-[13.5px] leading-[1.6] break-words"
          style={{
            color: 'rgba(255,255,255,0.97)',
            fontFamily: "'Inter', system-ui, sans-serif",
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {cleaned ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              urlTransform={(url) => url}
            >
              {cleaned}
            </ReactMarkdown>
          ) : streaming ? (
            <Cursor />
          ) : null}
          {streaming && cleaned ? <Cursor /> : null}
        </div>
      )}
    </div>
  )
}

function StreamDot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: '#ffb27a',
        boxShadow: '0 0 6px rgba(255,178,122,0.85)',
        animation: 'ambient-pulse 1.1s ease-in-out infinite',
      }}
    />
  )
}

function Cursor() {
  return (
    <span
      className="inline-block align-middle"
      style={{
        width: '2px',
        height: '0.95em',
        marginLeft: '1px',
        background: '#ffb27a',
        boxShadow: '0 0 5px rgba(255,178,122,0.8)',
        animation: 'ambient-cursor 0.95s steps(2) infinite',
        verticalAlign: '-2px',
      }}
    />
  )
}

function ErrorLine() {
  return (
    <div className="text-[12px] uppercase tracking-[0.18em] text-[#e85a5a]">
      stream interrupted - retry the message
    </div>
  )
}
