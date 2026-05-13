/**
 * CortexAmbient - "the workshop".
 *
 * Phase 1 upgrade (fork_mp3mmr0r_cf0ea6): three-column CSS grid layout
 * + Panel component + right rail wired with live Forks + Threads panels.
 *
 * Phase 2 upgrade (fork_mp3ndv83_63898a): right rail extended to 400px with
 * 6 live panels — Forks, Working Set, Observer Signals, Perception Bus,
 * Pending Restarts, Inbox. Full hacker-monitor visual aesthetic: no truncation,
 * monospaced columns, phosphor glows, tabular-nums, border flash on event arrival.
 *
 * Layout (desktop >= 1280px):
 *   ROW 1 (60px)   HORIZON              full-width breathing oscilloscope
 *   ROW 2 (1fr)    LEFT RAIL (220px) | CHAT (flex-1) | RIGHT RAIL (400px)
 *
 * Right rail panels (Phase 2):
 *   FORKS      — live fork cards (ForksStrip)
 *   THREADS    — conductor working_set rows (useWorkingSet)
 *   OBSERVER   — observer trio signals (useObserverSignals)
 *   PERCEPTION — application-events.jsonl stream (usePerceptionBus)
 *   RESTARTS   — pending_restart_requests (useRestartRequests)
 *   INBOX      — email inbox unread counts (useInboxCounts)
 *
 * No three.js. No <Canvas>. No particle field.
 */
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ChatLog } from './ChatLog'
import { ChatInputPanel } from './ChatInputPanel'
import { Horizon } from './Horizon'
import { PresenceHeader } from './PresenceHeader'
import { ForksStrip } from './ForksStrip'
import { StripRow } from './StripRow'
import { Footer } from './Footer'
import { Panel } from './Panel'
import { useStatusBoard } from './useStatusBoard'
import { useForks } from './useForks'
import { useWorkingSet } from './useWorkingSet'
import { useObserverSignals } from './useObserverSignals'
import { usePerceptionBus } from './usePerceptionBus'
import { useRestartRequests } from './useRestartRequests'
import { useInboxCounts } from './useInboxCounts'
import { useOpsMetrics } from './useOpsMetrics'
import { AMBIENT_PALETTE } from './palette'

// ── Age formatting ──────────────────────────────────────────────────────────
function formatAge(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const seconds = (Date.now() - new Date(isoString).getTime()) / 1000
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

// ── Shared style primitives ─────────────────────────────────────────────────
const MONO_FONT = "'JetBrains Mono', 'SF Mono', Consolas, ui-monospace, monospace"
const SANS_FONT = "'Inter', system-ui, sans-serif"

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '7px 12px',
  borderBottom: '1px solid rgba(255,178,122,0.04)',
}
const TEXT_PRIMARY: React.CSSProperties = {
  color: 'rgba(255,255,255,0.88)',
  fontFamily: SANS_FONT,
  fontSize: 12,
  lineHeight: 1.5,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
}
const TEXT_DIM: React.CSSProperties = {
  color: 'rgba(255,255,255,0.40)',
  fontFamily: SANS_FONT,
  fontSize: 11,
}
const MONO_CELL: React.CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
  color: 'rgba(255,255,255,0.45)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}
const TABULAR: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
}

// ── Status dot colors ────────────────────────────────────────────────────────
const THREAD_STATUS_COLOR: Record<string, string> = {
  active: '#ffb27a',
  blocked: '#6366f1',
  parked: 'rgba(255,255,255,0.2)',
}

// ── Observer source colors ───────────────────────────────────────────────────
const OBSERVER_COLOR: Record<string, string> = {
  coherence: '#ffb27a',
  actionAudit: '#6366f1',
  attentionEcon: '#22c55e',
  attention: '#22c55e',
}
const OBSERVER_LABEL: Record<string, string> = {
  coherence: 'coherence·',
  actionAudit: 'actionAudit·',
  attentionEcon: 'attentionEcon·',
  attention: 'attention·',
}

// ── Perception type icons ────────────────────────────────────────────────────
const PERCEPTION_ICON: Record<string, string> = {
  fork: '⑂',
  fork_spawn: '⑂',
  email: '✉',
  cron: '⏱',
  fs: '📁',
  pattern_applied: '✓',
  pattern_not_applied: '✗',
  hook_fire: '⚡',
}

// ── Flash-on-change hook ─────────────────────────────────────────────────────
// Returns a CSS class name that flashes the element's border on data change.
function useFlash(value: unknown): boolean {
  const [flashing, setFlashing] = useState(false)
  const prevRef = useRef<string>(JSON.stringify(value))

  useEffect(() => {
    const next = JSON.stringify(value)
    if (next !== prevRef.current) {
      prevRef.current = next
      setFlashing(true)
      const t = setTimeout(() => setFlashing(false), 300)
      return () => clearTimeout(t)
    }
  }, [value])

  return flashing
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CortexAmbientPage() {
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [params] = useSearchParams()
  void params

  const statusRows = useStatusBoard()
  const { forks, runningCount } = useForks()

  // Phase 2 hooks
  const { threads, activeCount, blockedCount } = useWorkingSet()
  const { signals, unackedCount } = useObserverSignals()
  const { events: perceptionEvents, source: perceptionSource } = usePerceptionBus()
  const { requests: restartRequests, count: restartCount } = useRestartRequests()
  const { tate: inboxTate, code: inboxCode, total: inboxTotal } = useInboxCounts()

  // Phase 3: left rail metrics
  const opsMetrics = useOpsMetrics()

  // Flash states
  const observerFlash = useFlash(signals)
  const perceptionFlash = useFlash(perceptionEvents)
  const restartFlash = useFlash(restartRequests)
  const inboxFlash = useFlash(inboxTotal)

  // Ctrl+. toggles audio-tray icon state
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '.') setAudioEnabled((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Inbox urgency: total > 0 and oldest is stale (age ends with h or d)
  const inboxIsUrgent = (() => {
    const age = inboxTate.oldestAge ?? inboxCode.oldestAge
    if (!age) return false
    return age.endsWith('h') || age.endsWith('d')
  })()

  // Urgency dot color for inbox age
  function inboxAgeDot(age: string | null): string {
    if (!age) return 'rgba(255,255,255,0.15)'
    if (age.endsWith('d')) return '#ef4444'   // red — days old
    if (age.endsWith('h') && parseInt(age) >= 4) return '#f59e0b' // amber — hours
    return '#22c55e'  // green — fresh
  }

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
        gridTemplateColumns: '220px 1fr 400px',
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
        {/* ─────────────────────────────────────────────────────── */}
        {/* Panel 7: ENERGY BUDGET — weekly token gauge per account  */}
        {/* ─────────────────────────────────────────────────────── */}
        {(() => {
          const ea = opsMetrics.energy_by_account
          const pctPct = Math.round(ea.pct_used * 100)
          const fmtTok = (n: number) =>
            n >= 1e9
              ? `${(n / 1e9).toFixed(1)}B`
              : n >= 1e6
              ? `${(n / 1e6).toFixed(0)}M`
              : `${n.toLocaleString()}`
          return (
            <Panel
              id="energy"
              label="ENERGY"
              count={`${pctPct}% used`}
              pulse={false}
              maxHeight={230}
              defaultCollapsed={false}
            >
              <div style={{ padding: '10px 12px 8px' }}>
                {/* total gauge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ ...MONO_CELL, fontSize: 10 }}>WEEKLY BUDGET</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)' }}>
                    {pctPct}%
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,178,122,0.08)', overflow: 'hidden', marginBottom: 12 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, pctPct)}%`,
                      background: 'linear-gradient(90deg, #ffb27a, #ff6a10)',
                      borderRadius: 3,
                      transition: 'width 600ms ease',
                    }}
                  />
                </div>
                {/* per-account rows */}
                {ea.accounts.length === 0 ? (
                  <div style={{ ...MONO_CELL, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                    no usage data yet
                  </div>
                ) : (
                  ea.accounts.map((acc) => {
                    const ap = Math.round(acc.pct_of_budget * 100)
                    return (
                      <div key={acc.provider} style={{ marginBottom: 9 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                            {acc.label}
                          </span>
                          <span style={{ ...MONO_CELL, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>
                            {ap}% · {fmtTok(acc.total_tokens)} tok
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,178,122,0.08)', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, ap)}%`,
                              background: 'linear-gradient(90deg, #ffb27a, #ff6a10)',
                              borderRadius: 2,
                              transition: 'width 600ms ease',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
                <div style={{ marginTop: 6, ...MONO_CELL, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  {fmtTok(ea.total_tokens_this_week)} / 20B tok this week
                </div>
              </div>
            </Panel>
          )
        })()}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Panel 8: COST PER TURN — 24h SVG sparkline              */}
        {/* ─────────────────────────────────────────────────────── */}
        {(() => {
          const ch = opsMetrics.cost_hourly
          const avgLabel = opsMetrics.cost_per_turn_usd_24h != null
            ? `$${opsMetrics.cost_per_turn_usd_24h.toFixed(4)}/turn`
            : 'no data'
          const weekTotal = opsMetrics.cost_usd_this_week
          const weekLabel = weekTotal > 0 ? `$${weekTotal.toFixed(2)} this week` : ''

          // SVG sparkline geometry
          const W = 196, H = 46
          const maxVal = Math.max(...ch.map((b) => b.cost_usd), 0.000001)
          const pts = ch.length > 1
            ? ch.map((b, i) => {
                const x = (i / (ch.length - 1)) * W
                const y = H - 4 - (b.cost_usd / maxVal) * (H - 8)
                return `${x.toFixed(1)},${y.toFixed(1)}`
              }).join(' ')
            : `0,${H - 4} ${W},${H - 4}` // flat line fallback

          // Hour labels: 00, 06, 12, 18, now
          const now = new Date()
          const hourLabels = [
            `${String(new Date(now.getTime() - 18 * 3600000).getHours()).padStart(2,'0')}h`,
            `${String(new Date(now.getTime() - 12 * 3600000).getHours()).padStart(2,'0')}h`,
            `${String(new Date(now.getTime() - 6 * 3600000).getHours()).padStart(2,'0')}h`,
            'now',
          ]

          return (
            <Panel
              id="cost"
              label="COST"
              count={avgLabel}
              pulse={false}
              maxHeight={160}
              defaultCollapsed={false}
            >
              <div style={{ padding: '8px 12px 10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 12, color: 'rgba(255,255,255,0.82)', fontVariantNumeric: 'tabular-nums' }}>
                    {avgLabel}
                  </span>
                  {weekLabel && (
                    <span style={{ ...MONO_CELL, fontSize: 10 }}>{weekLabel}</span>
                  )}
                </div>
                {/* sparkline */}
                <svg
                  width={W}
                  height={H}
                  viewBox={`0 0 ${W} ${H}`}
                  style={{ display: 'block', overflow: 'visible' }}
                >
                  {/* zero baseline */}
                  <line
                    x1={0} y1={H - 4} x2={W} y2={H - 4}
                    stroke="rgba(255,178,122,0.08)"
                    strokeWidth={1}
                  />
                  {/* cost area fill */}
                  {ch.length > 1 && (
                    <polyline
                      points={`0,${H - 4} ${pts} ${W},${H - 4}`}
                      fill="rgba(255,178,122,0.07)"
                      stroke="none"
                    />
                  )}
                  {/* cost line */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="#ff9a4a"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
                {/* x-axis labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {hourLabels.map((l) => (
                    <span key={l} style={{ ...MONO_CELL, fontSize: 9 }}>{l}</span>
                  ))}
                </div>
              </div>
            </Panel>
          )
        })()}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Panel 9: CACHE HIT RATIO — SVG donut                   */}
        {/* ─────────────────────────────────────────────────────── */}
        {(() => {
          const ratio24 = opsMetrics.cache_hit_ratio_24h
          const ratioWk = opsMetrics.cache_hit_ratio_week
          const displayRatio = ratio24 ?? ratioWk ?? null
          const pct = displayRatio != null ? Math.round(displayRatio * 100) : null

          // Donut geometry: r=19 centered in 56x56
          const r = 19, cx = 28, cy = 28, sw = 8
          const circ = 2 * Math.PI * r
          const dashArr = displayRatio != null
            ? `${(displayRatio * circ).toFixed(2)} ${circ.toFixed(2)}`
            : `0 ${circ.toFixed(2)}`

          return (
            <Panel
              id="cache"
              label="CACHE"
              count={pct != null ? `${pct}% hits` : 'no data'}
              pulse={false}
              maxHeight={120}
              defaultCollapsed={false}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 12px',
                }}
              >
                {/* donut */}
                <svg width={56} height={56} viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
                  {/* background ring */}
                  <circle
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke="rgba(255,178,122,0.08)"
                    strokeWidth={sw}
                  />
                  {/* hit ring */}
                  {displayRatio != null && displayRatio > 0 && (
                    <circle
                      cx={cx} cy={cy} r={r}
                      fill="none"
                      stroke="#ffb27a"
                      strokeWidth={sw}
                      strokeDasharray={dashArr}
                      strokeDashoffset={0}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${cx} ${cy})`}
                    />
                  )}
                  {/* center pct label */}
                  <text
                    x={cx} y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontFamily="'JetBrains Mono', ui-monospace, monospace"
                    fill={pct != null ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.2)'}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {pct != null ? `${pct}%` : '—'}
                  </text>
                </svg>
                {/* legend */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ ...MONO_CELL, fontSize: 10 }}>24h</span>
                    <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.82)' }}>
                      {ratio24 != null ? `${Math.round(ratio24 * 100)}%` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ ...MONO_CELL, fontSize: 10 }}>week</span>
                    <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.82)' }}>
                      {ratioWk != null ? `${Math.round(ratioWk * 100)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </Panel>
          )
        })()}

        {/* ─────────────────────────────────────────────────────── */}
        {/* Panel 10: STATUS BOARD STRIP — P1-P5 histogram          */}
        {/* ─────────────────────────────────────────────────────── */}
        {(() => {
          const sp = opsMetrics.status_priorities
          const total = opsMetrics.status_total
          const rows: Array<{ key: keyof typeof sp; label: string; color: string }> = [
            { key: 'P1', label: 'P1', color: '#ef4444' },
            { key: 'P2', label: 'P2', color: '#f97316' },
            { key: 'P3', label: 'P3', color: '#ffb27a' },
            { key: 'P4', label: 'P4', color: 'rgba(255,255,255,0.40)' },
            { key: 'P5', label: 'P5', color: 'rgba(255,255,255,0.25)' },
          ]
          const maxCount = Math.max(...rows.map((r) => sp[r.key]), 1)

          return (
            <Panel
              id="board"
              label="BOARD"
              count={`${total} active`}
              pulse={false}
              maxHeight={200}
              defaultCollapsed={true}
            >
              <div style={{ padding: '8px 12px 10px' }}>
                {rows.map(({ key, label, color }) => {
                  const cnt = sp[key]
                  const barPct = Math.round((cnt / maxCount) * 100)
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '22px 8px 1fr 28px',
                        gap: 6,
                        alignItems: 'center',
                        marginBottom: 7,
                      }}
                    >
                      {/* label */}
                      <span style={{ fontFamily: MONO_FONT, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                        {label}
                      </span>
                      {/* dot */}
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: color,
                          boxShadow: cnt > 0 && key === 'P1' ? `0 0 6px ${color}` : 'none',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      {/* bar */}
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,178,122,0.06)', overflow: 'hidden' }}>
                        {cnt > 0 && (
                          <div
                            style={{
                              height: '100%',
                              width: `${barPct}%`,
                              background: color,
                              borderRadius: 2,
                              opacity: 0.7,
                              transition: 'width 400ms ease',
                            }}
                          />
                        )}
                      </div>
                      {/* count */}
                      <span
                        style={{
                          fontFamily: MONO_FONT,
                          fontSize: 11,
                          fontVariantNumeric: 'tabular-nums',
                          color: cnt > 0 ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.2)',
                          textAlign: 'right',
                        }}
                      >
                        {cnt}
                      </span>
                    </div>
                  )
                })}
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255,178,122,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ ...MONO_CELL, fontSize: 10 }}>TOTAL</span>
                  <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.75)' }}>
                    {total}
                  </span>
                </div>
              </div>
            </Panel>
          )
        })()}
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

        <div
          className="ambient-chat-region ambient-chatlog-scroll"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        >
          <ChatLog />
        </div>

        <ChatInputPanel />

        <div className="ambient-bottom-stack">
          <StripRow forks={forks} rows={statusRows} />
        </div>

        <Footer />
      </div>

      {/* ── ROW 2, COL 3: Right rail (400px) ────────────────────────────────── */}
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

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 1: FORKS — live fork cards                                    */}
        {/* ─────────────────────────────────────────────────────────────────── */}
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

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 2: THREADS — conductor working_set                            */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <Panel
          id="threads"
          label="THREADS"
          count={`${activeCount}a ${blockedCount}b`}
          pulse={threads.length > 0}
          maxHeight={220}
          defaultCollapsed={false}
        >
          {threads.length === 0 ? (
            <div style={{ ...ROW, ...TEXT_DIM }}>no active threads</div>
          ) : (
            threads.map((t) => (
              <div key={t.id} style={ROW}>
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flexShrink: 0,
                    marginTop: 4,
                    background: THREAD_STATUS_COLOR[t.status] ?? 'rgba(255,255,255,0.2)',
                    boxShadow: t.status === 'active'
                      ? '0 0 6px rgba(255,178,122,0.5)'
                      : t.status === 'blocked'
                        ? '0 0 6px rgba(99,102,241,0.5)'
                        : 'none',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TEXT_PRIMARY, marginBottom: 2 }}>{t.topic}</div>
                  {t.blocking_on && (
                    <div style={{ ...MONO_CELL, color: '#6366f1' }}>
                      blocked: {t.blocking_on}
                    </div>
                  )}
                </div>
                <span style={{ ...MONO_CELL, ...TABULAR, marginTop: 2 }}>
                  {formatAge(t.last_touched_at)}
                </span>
              </div>
            ))
          )}
        </Panel>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 3: OBSERVER — observer trio signals                           */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            transition: 'box-shadow 200ms ease',
            boxShadow: observerFlash && unackedCount > 0
              ? '0 0 0 1px rgba(255,178,122,0.6)'
              : 'none',
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <Panel
            id="observer"
            label="OBSERVER"
            count={unackedCount > 0 ? `${unackedCount} unack` : `${signals.length}`}
            pulse={unackedCount > 0}
            maxHeight={240}
            defaultCollapsed={true}
          >
            {signals.length === 0 ? (
              <div style={{ ...ROW, ...TEXT_DIM, fontFamily: MONO_FONT }}>
                <span style={{ color: '#22c55e', marginRight: 6 }}>●</span>
                no active signals
              </div>
            ) : (
              signals.map((s) => (
                <div
                  key={s.id}
                  style={{
                    ...ROW,
                    background: !s.acknowledged
                      ? 'rgba(99,102,241,0.04)'
                      : 'transparent',
                  }}
                >
                  {/* Source dot + label */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 4, paddingTop: 2 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: OBSERVER_COLOR[s.observer_name] ?? 'rgba(255,255,255,0.3)',
                        boxShadow: `0 0 5px ${OBSERVER_COLOR[s.observer_name] ?? 'rgba(255,255,255,0.3)'}`,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span
                        style={{
                          fontFamily: MONO_FONT,
                          fontSize: 10,
                          color: OBSERVER_COLOR[s.observer_name] ?? 'rgba(255,255,255,0.45)',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {OBSERVER_LABEL[s.observer_name] ?? `${s.observer_name}·`}
                      </span>
                      <span style={{ ...MONO_CELL, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                        {s.signal_kind}
                      </span>
                    </div>
                    {/* Full message text — no truncation */}
                    <div
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.82)',
                        lineHeight: 1.55,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {s.message}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
                    {s.confidence != null && (
                      <span style={{ ...MONO_CELL, ...TABULAR, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                        {s.confidence.toFixed(2)}
                      </span>
                    )}
                    <span style={{ ...MONO_CELL, ...TABULAR, fontSize: 10 }}>
                      {formatAge(s.created_at)}
                    </span>
                    {!s.acknowledged && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: '#6366f1',
                          boxShadow: '0 0 4px rgba(99,102,241,0.7)',
                        }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 4: PERCEPTION — scrolling event log                          */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            transition: 'box-shadow 200ms ease',
            boxShadow: perceptionFlash
              ? '0 0 0 1px rgba(255,178,122,0.45)'
              : 'none',
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <Panel
            id="perception"
            label={
              perceptionSource === 'jsonl_unavailable'
                ? 'PERCEPTION'
                : 'PERCEPTION ···'
            }
            count={perceptionEvents.length}
            pulse={false}
            maxHeight={280}
            defaultCollapsed={true}
          >
            {perceptionSource === 'jsonl_unavailable' ? (
              <div
                style={{
                  ...ROW,
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.30)',
                }}
              >
                stream unavailable — no application-events.jsonl yet
              </div>
            ) : perceptionEvents.length === 0 ? (
              <div style={{ ...ROW, ...TEXT_DIM, fontFamily: MONO_FONT }}>
                no events
              </div>
            ) : (
              perceptionEvents.map((ev, i) => {
                const opacity = Math.max(0.25, 1 - i * 0.055)
                return (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 110px 1fr 36px',
                      gap: 8,
                      padding: '5px 12px',
                      borderBottom: '1px solid rgba(255,178,122,0.03)',
                      opacity,
                      alignItems: 'baseline',
                    }}
                  >
                    {/* Icon */}
                    <span
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: 11,
                        color: 'rgba(255,178,122,0.7)',
                        textAlign: 'center',
                      }}
                    >
                      {PERCEPTION_ICON[ev.type] ?? '·'}
                    </span>
                    {/* Source-id column */}
                    <span
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.35)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ev.source ?? ev.type}
                    </span>
                    {/* Summary — full text, wraps naturally */}
                    <span
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.75)',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'normal',
                        lineHeight: 1.45,
                      }}
                    >
                      {ev.summary ?? ev.type}
                    </span>
                    {/* Age */}
                    <span
                      style={{
                        ...MONO_CELL,
                        ...TABULAR,
                        fontSize: 10,
                        textAlign: 'right',
                      }}
                    >
                      {formatAge(ev.timestamp)}
                    </span>
                  </div>
                )
              })
            )}
          </Panel>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 5: RESTARTS — pending ecodia-api restart requests             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            transition: 'box-shadow 200ms ease',
            boxShadow: restartFlash && restartCount > 0
              ? '0 0 0 1px rgba(245,158,11,0.7)'
              : 'none',
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <Panel
            id="restarts"
            label="RESTARTS"
            count={restartCount > 0 ? `${restartCount} pending` : 'none'}
            pulse={restartCount > 0}
            maxHeight={180}
            defaultCollapsed={restartCount === 0}
          >
            {restartCount === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  color: '#22c55e',
                }}
              >
                <span
                  style={{
                    animation: 'all-clear-pulse 3s ease-in-out infinite',
                  }}
                >
                  ●
                </span>
                ALL CLEAR
              </div>
            ) : (
              restartRequests.map((r) => (
                <div key={r.id} style={{ ...ROW, alignItems: 'flex-start' }}>
                  {/* Amber pulse dot */}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#f59e0b',
                      boxShadow: '0 0 8px rgba(245,158,11,0.7)',
                      flexShrink: 0,
                      marginTop: 3,
                      animation: 'amber-pulse 1.5s ease-in-out infinite',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {r.requesting_fork_id && (
                      <div
                        style={{
                          fontFamily: MONO_FONT,
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.35)',
                          marginBottom: 3,
                          wordBreak: 'break-all',
                        }}
                      >
                        {r.requesting_fork_id}
                      </div>
                    )}
                    {/* Full reason text — no truncation */}
                    <div
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: 12,
                        color: '#f59e0b',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {r.reason}
                    </div>
                  </div>
                  <span style={{ ...MONO_CELL, ...TABULAR, marginTop: 2, flexShrink: 0 }}>
                    {formatAge(r.requested_at)}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* Panel 6: INBOX — email unread counts by account                    */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            transition: 'box-shadow 200ms ease',
            boxShadow: inboxFlash && inboxTotal > 0
              ? '0 0 0 1px rgba(255,178,122,0.4)'
              : 'none',
            borderRadius: 6,
            marginBottom: 4,
          }}
        >
          <Panel
            id="inbox"
            label="INBOX"
            count={`${inboxTotal} unread`}
            pulse={inboxTotal > 0 && inboxIsUrgent}
            maxHeight={100}
            defaultCollapsed={true}
          >
            {/* tate@ row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 80px 1fr',
                gap: 8,
                padding: '7px 12px',
                borderBottom: '1px solid rgba(255,178,122,0.04)',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                tate@ecodia.au
              </span>
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  ...TABULAR,
                  color: inboxTate.unread > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
                }}
              >
                {inboxTate.unread} unread
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {inboxTate.oldestAge ? (
                  <>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: inboxAgeDot(inboxTate.oldestAge),
                        boxShadow: `0 0 4px ${inboxAgeDot(inboxTate.oldestAge)}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ ...MONO_CELL, ...TABULAR }}>
                      oldest {inboxTate.oldestAge}
                    </span>
                  </>
                ) : (
                  <span style={{ ...MONO_CELL, color: 'rgba(255,255,255,0.2)' }}>—</span>
                )}
              </div>
            </div>
            {/* code@ row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 80px 1fr',
                gap: 8,
                padding: '7px 12px',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                code@ecodia.au
              </span>
              <span
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  ...TABULAR,
                  color: inboxCode.unread > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
                }}
              >
                {inboxCode.unread} unread
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {inboxCode.oldestAge ? (
                  <>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: inboxAgeDot(inboxCode.oldestAge),
                        boxShadow: `0 0 4px ${inboxAgeDot(inboxCode.oldestAge)}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ ...MONO_CELL, ...TABULAR }}>
                      oldest {inboxCode.oldestAge}
                    </span>
                  </>
                ) : (
                  <span style={{ ...MONO_CELL, color: 'rgba(255,255,255,0.2)' }}>—</span>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── Page-local keyframes ────────────────────────────────────────────── */}
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
        @keyframes amber-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(245,158,11,0.4); }
          50%      { box-shadow: 0 0 12px rgba(245,158,11,0.9); }
        }
        @keyframes all-clear-pulse {
          0%, 100% { opacity: 0.55; text-shadow: 0 0 4px rgba(34,197,94,0.3); }
          50%      { opacity: 1;    text-shadow: 0 0 10px rgba(34,197,94,0.8); }
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
