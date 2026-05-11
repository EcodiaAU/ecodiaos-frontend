/**
 * CortexAmbient - "the workshop".
 *
 * Round-3 redispatch (fork_mowtxg3d_302865). Replaces the round-1/2 R3F
 * orb-and-particles scene with the workshop layout from the validated spec
 * at ~/ecodiaos/drafts/cortex-ambient-design-spec-2026-05-08.md.
 *
 * Structure (single vertical scroll, same desktop and mobile):
 *
 *   HORIZON              breathing oscilloscope (sticky-top)
 *   IDENTITY-BAR         EcodiaOS / clock / audio toggle (sticky-under-horizon)
 *   CHAT                 the lead readable surface (own scroll)
 *   INPUT                sticky-bottom of chat
 *   HANDS / FORKS        list of running fork cards
 *   WORKING MEMORY       status_board priority rows
 *   FOOTER               DAO marks
 *
 * No three.js. No <Canvas>. No particle field. The horizon is the only
 * continuous-motion element on the page and it's bounded to a 60px band.
 *
 * Spec sections referenced inline. Worker C/D/E follow this scaffold for
 * live-data wiring, motion polish, and visual verify.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ChatLog } from './ChatLog'
import { ChatInputPanel } from './ChatInputPanel'
import { Horizon } from './Horizon'
import { PresenceHeader } from './PresenceHeader'
import { ForksStrip } from './ForksStrip'
import { StatusThreads } from './StatusThreads'
import { StripRow } from './StripRow'
import { Footer } from './Footer'
import { useStatusBoard } from './useStatusBoard'
import { useForks } from './useForks'
import { AMBIENT_PALETTE } from './palette'

interface SectionProps {
  label: string
  children: React.ReactNode
  /** mute the label visually when the body is empty / quiet */
  dim?: boolean
}

function Section({ label, children, dim = false }: SectionProps) {
  return (
    <section className="ambient-section" style={{ paddingTop: 20, paddingBottom: 4 }}>
      <div
        className="px-4"
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          color: AMBIENT_PALETTE.textDim,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          opacity: dim ? 0.5 : 0.85,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

export default function CortexAmbientPage() {
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [params] = useSearchParams()
  // Reserved for future legend/density toggle. Read but unused for now.
  void params

  const statusRows = useStatusBoard()
  const { forks, runningCount } = useForks()

  // Ctrl+. toggles audio-tray icon state (audio engine itself dropped this
  // round per spec §J; the toggle remains so the visual affordance is still
  // there for when audio comes back as a separate /listening-room route).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '.') {
        setAudioEnabled((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="ambient-root"
      style={{
        position: 'absolute',
        inset: 0,
        background: AMBIENT_PALETTE.base,
        color: AMBIENT_PALETTE.text,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Horizon runningForks={runningCount} />

      <PresenceHeader
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        forkCount={runningCount}
      />

      {/* CHAT — the lead surface. Own scroll, document feel.
          Round-4 (fork_moxykr7k_4cb6b2) Bug 1 fix: chat region is now
          a min-height container so the empty state reserves visible
          space and the input + strip-row don't collapse upward. The
          ChatLog itself ALSO carries a min-height (50vh capped) for the
          inner scroll surface. Both work together so first-paint reads
          as a real workshop, not a jammed accordion. */}
      <div
        className="ambient-chat-region"
        style={{
          paddingTop: 18,
          minHeight: 'min(62vh, 600px)',
        }}
      >
        <ChatLog />
      </div>

      {/* BOTTOM-STICKY REGION — input + condensed strip-row.
          Round-4 (fork_moxykr7k_4cb6b2): the input was already sticky-bottom
          on its own. We wrap input + new StripRow in a single sticky-bottom
          stack so BOTH stay pinned to viewport bottom on every screen size.
          Mobile: strip-row collapses to a single horizontally-scrollable line
          showing "hands · N forks" tags + "working memory · N" + top-priority
          row name. Desktop (>=1024px): both halves render inline.
          The full ForksStrip + StatusThreads sections still render below
          for users who scroll past the chat - this strip is at-a-glance
          summary, not a replacement. */}
      <div
        className="ambient-bottom-stack"
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 25,
        }}
      >
        <ChatInputPanel />
        <StripRow forks={forks} rows={statusRows} />
      </div>

      {/* HANDS / FORKS — what the entity is doing right now.
          Full detail. Sits below the sticky bottom-stack so users who
          scroll past the chat see the live cards. */}
      <Section label={`hands · ${forks.length} fork${forks.length === 1 ? '' : 's'}`} dim={forks.length === 0}>
        <ForksStrip forks={forks} layout="horizontal" />
      </Section>

      {/* WORKING MEMORY / STATUS_BOARD — what's on the entity's mind. */}
      <Section label={`working memory · ${statusRows.length} thread${statusRows.length === 1 ? '' : 's'}`} dim={statusRows.length === 0}>
        <StatusThreads rows={statusRows} />
      </Section>

      <Footer />

      {/* Page-local keyframes shared by chat input ribbon, stream dot,
          send-button spinner, cursor and "new" pill. Kept inline so the
          ambient surface is self-contained and these don't leak into the
          rest of the admin UI. */}
      <style>{`
        @keyframes ambient-pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50%      { opacity: 1.00; transform: scale(1.15); }
        }
        @keyframes ambient-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes ambient-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ambient-ribbon {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
        .ambient-chatlog-scroll::-webkit-scrollbar { width: 6px; }
        .ambient-chatlog-scroll::-webkit-scrollbar-track { background: transparent; }
        .ambient-chatlog-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,178,122,0.25);
          border-radius: 3px;
        }
        .ambient-chatlog-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,178,122,0.45);
        }
        /* Markdown rendering inside assistant bubbles. Tight, readable,
           ember-themed. Mirrors the cortex-prose surface used in the
           Cortex route but tuned darker for the ambient page. */
        .ambient-md p { margin: 0; }
        .ambient-md p + p { margin-top: 0.55em; }
        .ambient-md ul, .ambient-md ol { margin: 0.4em 0; padding-left: 1.2em; }
        .ambient-md li { margin: 0.15em 0; }
        .ambient-md li > p { margin: 0; }
        .ambient-md ul { list-style: disc; }
        .ambient-md ol { list-style: decimal; }
        .ambient-md strong { color: #ffe7d2; font-weight: 600; }
        .ambient-md em { color: rgba(255,255,255,0.78); font-style: italic; }
        .ambient-md a {
          color: #ffb27a;
          text-decoration: underline;
          text-underline-offset: 2px;
          text-decoration-color: rgba(255,178,122,0.45);
        }
        .ambient-md a:hover { text-decoration-color: #ffb27a; }
        .ambient-md h1, .ambient-md h2, .ambient-md h3 {
          color: #ffe7d2;
          font-weight: 600;
          line-height: 1.3;
          margin: 0.9em 0 0.35em;
        }
        .ambient-md h1 { font-size: 1.05em; }
        .ambient-md h2 { font-size: 1.0em; }
        .ambient-md h3 { font-size: 0.95em; color: rgba(255,231,210,0.85); }
        .ambient-md hr {
          border: none;
          height: 1px;
          background: rgba(255,178,122,0.15);
          margin: 1em 0;
        }
        .ambient-md blockquote {
          border-left: 2px solid rgba(255,178,122,0.35);
          padding-left: 0.8em;
          color: rgba(255,255,255,0.72);
          font-style: italic;
          margin: 0.5em 0;
        }
        .ambient-md code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.86em;
          background: rgba(255,178,122,0.10);
          color: #ffd5b3;
          padding: 1px 5px;
          border-radius: 4px;
          border: 1px solid rgba(255,178,122,0.12);
        }
        .ambient-md pre {
          margin: 0.55em 0;
          background: rgba(0,0,0,0.40);
          border: 1px solid rgba(255,178,122,0.12);
          border-radius: 6px;
          padding: 10px 12px;
          overflow-x: auto;
        }
        .ambient-md pre code {
          background: transparent;
          border: none;
          padding: 0;
          color: #e8dcc8;
          font-size: 0.84em;
          line-height: 1.55;
        }
        .ambient-md table {
          border-collapse: collapse;
          margin: 0.55em 0;
          font-size: 0.92em;
          width: 100%;
        }
        .ambient-md th, .ambient-md td {
          border: 1px solid rgba(255,178,122,0.15);
          padding: 5px 8px;
          text-align: left;
        }
        .ambient-md th { background: rgba(255,178,122,0.08); color: #ffe7d2; }
      `}</style>
    </div>
  )
}
