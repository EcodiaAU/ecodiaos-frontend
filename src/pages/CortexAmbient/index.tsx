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
          maxWidth: 880,
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
      <div style={{ maxWidth: 880, margin: '0 auto' }}>{children}</div>
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
      className="ambient-root min-h-screen w-full"
      style={{
        background: AMBIENT_PALETTE.base,
        color: AMBIENT_PALETTE.text,
        // Single page-level vertical scroll. Sub-regions can scroll within.
        overflowX: 'hidden',
      }}
    >
      <Horizon runningForks={runningCount} />

      <PresenceHeader
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        forkCount={runningCount}
      />

      {/* CHAT — the lead surface. Own scroll, document feel. */}
      <div className="ambient-chat-region" style={{ paddingTop: 18 }}>
        <ChatLog />
      </div>

      {/* INPUT — sticky-bottom of the chat region. */}
      <ChatInputPanel />

      {/* HANDS / FORKS — what the entity is doing right now. */}
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
      `}</style>
    </div>
  )
}
