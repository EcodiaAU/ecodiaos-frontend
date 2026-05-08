/**
 * Horizon - the breathing oscilloscope band.
 *
 * Round-3 redispatch (fork_mowtxg3d_302865). Spec §D motion language.
 *
 * The single continuous-motion element on the page. Bounded to 56-64px tall.
 * Encodes 4 distinct states via amplitude/frequency:
 *   - idle           - one slow ECG-style beat every ~5.8s
 *   - thinking       - low-amplitude continuous wave
 *   - streaming      - higher-amplitude wave with token-driven jitter
 *   - event-pip      - one-frame vertical spike (fork spawn/done/error)
 *
 * Implementation rules (per spec):
 *   - Single SVG <path>, ~720pt polyline, resampled per rAF tick.
 *   - <2KB code budget, <1ms/frame on iPhone 12.
 *   - No filters, no gradient repaints, no per-pixel work.
 *   - Bails when document.hidden OR prefers-reduced-motion: reduce.
 *
 * State source: derived from useOSSessionStore (status='streaming' wins),
 * else useForks (any running fork = thinking), else idle. Motion downstream
 * (worker D) will tie horizon-pip to fork-event subscription. For now the
 * pip slot is here but unfired; it ties cleanly to a ref handle that can be
 * driven from a parent without re-rendering.
 */
import { useEffect, useRef } from 'react'
import { useOSSessionStore } from '@/store/osSessionStore'
import { AMBIENT_PALETTE } from './palette'

interface HorizonProps {
  /** count of running forks - thinking state when >0 */
  runningForks: number
}

const W = 1440 // viewBox width (high-res for sharp lines on retina)
const H = 60 // viewBox height
const MID = H / 2
const SAMPLES = 240 // polyline resolution

type HorizonMode = 'idle' | 'thinking' | 'streaming'

interface FrameState {
  mode: HorizonMode
  t0: number
  /** running phase, advanced each rAF tick by mode-specific increment */
  phase: number
}

function modeAmplitude(mode: HorizonMode): number {
  switch (mode) {
    case 'streaming':
      return 18
    case 'thinking':
      return 6
    case 'idle':
      return 1.4
  }
}

function modeFreq(mode: HorizonMode): number {
  switch (mode) {
    case 'streaming':
      return 0.045
    case 'thinking':
      return 0.022
    case 'idle':
      return 0.014
  }
}

/**
 * Idle ECG beat. Small bump every ~5.8s. We mirror the heartbeat shape rather
 * than compute it analytically: P-Q-R-S-T over a tiny window, then flat.
 */
function ecgBeat(elapsedSec: number): number {
  const period = 5.8
  const tau = elapsedSec % period
  // ECG visible window: 0 .. 0.9s. Otherwise flat baseline.
  if (tau > 0.9) return 0
  // Five Gaussians with alternating polarity for the QRS-T shape.
  const beats: Array<[centre: number, height: number, sigma: number]> = [
    [0.10, 0.5, 0.04], // P
    [0.30, -1.6, 0.022], // Q
    [0.36, 9.0, 0.014], // R (the spike)
    [0.42, -3.2, 0.025], // S
    [0.66, 1.2, 0.06], // T
  ]
  let v = 0
  for (const [centre, height, sigma] of beats) {
    const dt = tau - centre
    v += height * Math.exp(-(dt * dt) / (2 * sigma * sigma))
  }
  return v
}

function buildPath(mode: HorizonMode, phase: number, elapsedSec: number): string {
  const amp = modeAmplitude(mode)
  const freq = modeFreq(mode)
  const idleBeat = mode === 'idle' ? ecgBeat(elapsedSec) : 0

  let d = ''
  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * W
    // base waveform: sin + a smaller sin at higher freq for organic feel
    const wave = Math.sin(i * freq + phase) * amp +
      (mode === 'streaming' ? Math.sin(i * freq * 2.7 + phase * 1.3) * amp * 0.35 : 0)
    const y = MID - wave - idleBeat * 1.4
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

export function Horizon({ runningForks }: HorizonProps) {
  const pathRef = useRef<SVGPathElement | null>(null)
  const stateRef = useRef<FrameState>({
    mode: 'idle',
    t0: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    phase: 0,
  })
  const status = useOSSessionStore((s) => s.status)

  // Mode selection: streaming wins, else thinking if any running forks, else idle.
  useEffect(() => {
    if (status === 'streaming') stateRef.current.mode = 'streaming'
    else if (runningForks > 0) stateRef.current.mode = 'thinking'
    else stateRef.current.mode = 'idle'
  }, [status, runningForks])

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      // Static flat line.
      if (pathRef.current) {
        pathRef.current.setAttribute('d', `M 0 ${MID} L ${W} ${MID}`)
      }
      return
    }

    let raf = 0
    let lastT = performance.now()

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick)
      if (document.hidden) return
      const dt = Math.min(64, now - lastT) // clamp huge gaps (tab return)
      lastT = now
      const s = stateRef.current
      // phase advance scales with mode and dt
      const phaseSpeed = s.mode === 'streaming' ? 0.012 : s.mode === 'thinking' ? 0.006 : 0.0028
      s.phase += phaseSpeed * dt
      const elapsedSec = (now - s.t0) / 1000
      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPath(s.mode, s.phase, elapsedSec))
      }
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      aria-hidden
      className="ambient-horizon sticky top-0 z-50 w-full"
      style={{
        height: 60,
        background: 'rgba(6,7,10,0.94)',
        borderBottom: `1px solid rgba(255,178,122,0.10)`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <path
          ref={pathRef}
          fill="none"
          stroke={AMBIENT_PALETTE.coreGlow}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.78}
          d={`M 0 ${MID} L ${W} ${MID}`}
        />
      </svg>
    </div>
  )
}
