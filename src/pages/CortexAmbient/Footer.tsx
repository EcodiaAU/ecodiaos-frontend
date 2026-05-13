/**
 * Footer - Phase 5 hacker telemetry strip.
 *
 * Phase 5 (fork_mp3qmbg0_ceed6f): DAO marks removed per Tate directive.
 * Attribution lives in /settings or /about via EcodiaAttribution element.
 * Footer is now a live status bar: latency, TX/RX, uptime, provider status.
 *
 * Per ~/ecodiaos/patterns/ecodia-labs-internal-attribution-via-element.md
 */
import { useState, useEffect, useRef } from 'react'
import api from '@/api/client'

const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace"
const DIM = 'rgba(255,255,255,0.28)'
const GREEN = '#22c55e'
const AMBER = '#ffb27a'

// ── Ping hook ────────────────────────────────────────────────────────────────
function usePing(pollMs = 15_000) {
  const [ms, setMs] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      const t0 = performance.now()
      try {
        await api.get('/health')
        if (!cancelled) setMs(Math.round(performance.now() - t0))
      } catch {
        if (!cancelled) setMs(null)
      }
      if (!cancelled) timer = window.setTimeout(tick, pollMs)
    }
    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [pollMs])
  return ms
}

// ── Session uptime counter ───────────────────────────────────────────────────
function useUptime() {
  const startRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor(elapsed / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Blink ────────────────────────────────────────────────────────────────────
function useBlink(ms = 900) {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), ms)
    return () => clearInterval(t)
  }, [ms])
  return on
}

// ── Separator ────────────────────────────────────────────────────────────────
function Sep() {
  return (
    <span style={{ color: 'rgba(255,255,255,0.07)', userSelect: 'none', flexShrink: 0 }}>
      {' | '}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Footer() {
  const latencyMs = usePing()
  const uptime = useUptime()
  const blink = useBlink()

  const latencyColor =
    latencyMs === null
      ? DIM
      : latencyMs < 80
      ? GREEN
      : latencyMs < 250
      ? AMBER
      : '#ef4444'

  return (
    <footer
      style={{
        borderTop: '1px solid rgba(255,178,122,0.07)',
        padding: '5px 14px',
        background: 'rgba(0,0,0,0.40)',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: '0.04em',
        color: DIM,
        minHeight: 26,
        flexShrink: 0,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Latency */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: latencyMs !== null ? latencyColor : DIM,
            boxShadow: latencyMs !== null ? `0 0 5px ${latencyColor}` : 'none',
            flexShrink: 0,
            opacity: blink ? 1 : 0.3,
            transition: 'opacity 0.15s',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            color: latencyMs !== null ? latencyColor : DIM,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {latencyMs !== null ? `${latencyMs}ms` : '---ms'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 9 }}>PING</span>
      </span>

      <Sep />

      {/* TX/RX packet indicators */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            color: '#6366f1',
            fontSize: 9,
            opacity: blink ? 1 : 0.4,
            transition: 'opacity 0.15s',
            letterSpacing: '0.08em',
          }}
        >
          TX
        </span>
        <span style={{ color: 'rgba(255,255,255,0.18)' }}>{'>'}</span>
        <span style={{ color: 'rgba(255,255,255,0.18)' }}>{'<'}</span>
        <span
          style={{
            color: GREEN,
            fontSize: 9,
            opacity: blink ? 0.4 : 1,
            transition: 'opacity 0.15s',
            letterSpacing: '0.08em',
          }}
        >
          RX
        </span>
      </span>

      <Sep />

      {/* Session uptime */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 9 }}>UPTIME</span>
        <span
          style={{
            color: 'rgba(255,255,255,0.60)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {uptime}
        </span>
      </span>

      <Sep />

      {/* System status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 9 }}>SYS</span>
        <span
          style={{
            color: GREEN,
            fontSize: 9,
            letterSpacing: '0.10em',
          }}
        >
          ONLINE
        </span>
      </span>

      <Sep />

      {/* Version */}
      <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9 }}>
        cortex.ambient v5
      </span>

      {/* Flex spacer */}
      <span style={{ flex: 1 }} />

      {/* TRANSMITTING indicator */}
      <span
        style={{
          color: blink ? '#ff6a10' : 'rgba(255,100,16,0.25)',
          fontSize: 9,
          letterSpacing: '0.10em',
          transition: 'color 0.15s',
          flexShrink: 0,
        }}
      >
        TRANSMITTING...
      </span>
    </footer>
  )
}
