/**
 * CortexAmbient - "the workshop".
 *
 * Phase 1 upgrade (fork_mp3mmr0r_cf0ea6): three-column CSS grid layout
 * + Panel component + right rail wired with live Forks + Threads panels.
 *
 * Layout (desktop >= 1280px):
 *   ROW 1 (60px)   HORIZON              full-width breathing oscilloscope
 *   ROW 2 (1fr)    LEFT RAIL (220px) | CHAT (flex-1) | RIGHT RAIL (280px)
 *
 * Chat column (flex column, overflow hidden):
 *   PresenceHeader → ChatLog (flex:1, own scroll) → ChatInputPanel → Footer
 *
 * Right rail panels (Phase 1):
 *   FORKS   — live fork cards (ForksStrip)
 *   THREADS — status_board rows (StatusThreads, Phase 2 will swap for useWorkingSet)
 *
 * Mobile (< 1280px): StripRow (.ambient-bottom-stack) visible, rails still render
 * but are narrow — Phase 3 will add responsive collapse.
 *
 * No three.js. No <Canvas>. No particle field.
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
import { Panel } from './Panel'
import { useStatusBoard } from './useStatusBoard'
import { useForks } from './useForks'
import { AMBIENT_PALETTE } from './palette'

export default function CortexAmbientPage() {
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [params] = useSearchParams()
  void params

  const statusRows = useStatusBoard()
  const { forks, runningCount } = useForks()

  // Ctrl+. toggles audio-tray icon state (audio engine itself is a future /listening-room route)
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
        display: 'grid',
        gridTemplateRows: '60px 1fr',
        gridTemplateColumns: '220px 1fr 280px',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* ── ROW 1: Horizon band — spans all three columns ──────────────────── */}
      <div style={{ gridColumn: '1 / -1', gridRow: 1 }}>
        <Horizon runningForks={runningCount} />
      </div>

      {/* ── ROW 2, COL 1: Left rail ─────────────────────────────────────────── */}
      <div
        data-rail="left"
        style={{
          gridRow: 2,
          gridColumn: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 6px',
          borderRight: '1px solid rgba(255,178,122,0.06)',
        }}
      >
        {/* Phase 3 will populate with nav / quick-action panels */}
        <div
          style={{
            fontSize: 9,
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: '0.2em',
            textAlign: 'center',
            padding: '16px 0',
            textTransform: 'uppercase',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          panels coming in phase 3
        </div>
      </div>

      {/* ── ROW 2, COL 2: Chat column ────────────────────────────────────────── */}
      <div
        style={{
          gridRow: 2,
          gridColumn: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <PresenceHeader
          audioEnabled={audioEnabled}
          onToggleAudio={() => setAudioEnabled((v) => !v)}
          forkCount={runningCount}
        />

        {/* ChatLog — flex:1, own internal scroll surface */}
        <div
          className="ambient-chat-region ambient-chatlog-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          <ChatLog />
        </div>

        {/* Input — sits at the bottom of the flex column naturally */}
        <ChatInputPanel />

        {/* StripRow — condensed summary, hidden on desktop (>= 1280px) */}
        <div className="ambient-bottom-stack">
          <StripRow forks={forks} rows={statusRows} />
        </div>

        <Footer />
      </div>

      {/* ── ROW 2, COL 3: Right rail ─────────────────────────────────────────── */}
      <div
        data-rail="right"
        style={{
          gridRow: 2,
          gridColumn: 3,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 6px',
          borderLeft: '1px solid rgba(255,178,122,0.06)',
        }}
      >
        {/* Panel 1: FORKS — live fork cards */}
        <Panel
          id="forks"
          label="FORKS"
          count={runningCount > 0 ? runningCount : forks.length}
          pulse={true}
          maxHeight={240}
          defaultCollapsed={false}
        >
          <ForksStrip forks={forks} layout="vertical" />
        </Panel>

        {/* Panel 2: THREADS — status_board rows (Phase 2 will replace with useWorkingSet) */}
        <Panel
          id="threads"
          label="THREADS"
          count={statusRows.length}
          pulse={true}
          maxHeight={200}
          defaultCollapsed={false}
        >
          <StatusThreads rows={statusRows} />
        </Panel>

        {/* Panels 3-6 (Observer/Perception/Inbox/Restarts) — Phase 2, not yet */}
      </div>

      {/* ── Page-local keyframes (self-contained, no leakage) ──────────────── */}
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
        @keyframes mic-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(239,68,68,0.20); }
          50%      { box-shadow: 0 0 18px rgba(239,68,68,0.50); }
        }
        @keyframes panel-pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }

        /* StripRow hidden on desktop — right rail provides the same info */
        @media (min-width: 1280px) {
          .ambient-bottom-stack { display: none !important; }
        }

        /* Scrollbar styling for rail columns and chat region */
        .ambient-chatlog-scroll::-webkit-scrollbar { width: 6px; }
        .ambient-chatlog-scroll::-webkit-scrollbar-track { background: transparent; }
        .ambient-chatlog-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,178,122,0.25);
          border-radius: 3px;
        }
        .ambient-chatlog-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,178,122,0.45);
        }

        /* Markdown rendering inside assistant bubbles */
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
