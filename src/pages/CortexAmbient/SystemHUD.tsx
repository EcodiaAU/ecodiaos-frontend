/**
 * SystemHUD - the futuristic chrome around the 3D scene.
 *
 * Top-bar: system pulse indicators (active forks count, P1 row count,
 * connection state). Bottom-corner controls: audio toggle, mode switch
 * back to classic /cortex.
 *
 * The HUD must look futuristic, not data-tablish. We use thin uppercase
 * mono labels, hairline borders in ember, and minimal ornamentation.
 *
 * Branding rule: NO bottom ECODIA wordmark. Sender block at top is
 * the only branding (and that is a tiny "EcodiaOS / cortex.ambient" tag).
 */
import { Link } from 'react-router-dom'
import { useForksStore, selectActiveForks } from '@/store/forksStore'
import { useStatusBoard } from './useStatusBoard'
import { useConnectionStore } from '@/store/connectionStore'

interface SystemHUDProps {
  audioEnabled: boolean
  onToggleAudio: () => void
  showLegend: boolean
}

export function SystemHUD({ audioEnabled, onToggleAudio, showLegend }: SystemHUDProps) {
  const forks = useForksStore((s) => s.forks)
  const active = selectActiveForks(forks)
  const rows = useStatusBoard()
  const p1 = rows.filter((r) => (r.priority ?? 5) <= 1).length
  const p2 = rows.filter((r) => (r.priority ?? 5) === 2).length
  const wsState = useConnectionStore((s) => s.state)

  return (
    <>
      {/* Top bar */}
      <div className="ambient-hud-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-4 text-[11px] uppercase tracking-[0.18em]">
        <div className="pointer-events-auto flex items-center gap-3">
          <span className="text-[#ffb27a]">EcodiaOS</span>
          <span className="text-white/30">/</span>
          <span className="text-white/65">cortex.ambient</span>
          <span className="ml-3 inline-block h-1.5 w-1.5 rounded-full" style={{
            background: wsState === 'connected' ? '#5ad9c8'
              : wsState === 'connecting' || wsState === 'reconnecting' || wsState === 'catching_up' ? '#f0a847'
              : '#e85a5a',
            boxShadow: '0 0 8px currentColor',
          }} />
        </div>

        <div className="pointer-events-auto flex items-center gap-5 text-white/65">
          <Stat label="forks" value={active.length} accent="#ffb27a" />
          <Stat label="P1" value={p1} accent="#e85a5a" />
          <Stat label="P2" value={p2} accent="#f0a847" />
          <Stat label="rows" value={rows.length} accent="#5ad9c8" />
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          <button
            onClick={onToggleAudio}
            className="rounded-sm border border-[#ffb27a]/30 px-2.5 py-1 text-[10px] tracking-[0.22em] hover:border-[#ffb27a]/70 hover:text-[#ffb27a] transition-colors"
            title="Ctrl+. toggles audio"
          >
            {audioEnabled ? 'audio: on' : 'audio: off'}
          </button>
          <Link
            to="/cortex"
            className="rounded-sm border border-white/15 px-2.5 py-1 text-[10px] tracking-[0.22em] text-white/45 hover:border-white/45 hover:text-white/90 transition-colors"
          >
            classic
          </Link>
        </div>
      </div>

      {/* Side legend - colour key for next_action_by */}
      {showLegend && (
        <div className="ambient-hud-legend pointer-events-none absolute left-6 bottom-32 z-10 text-[10px] uppercase tracking-[0.16em] text-white/40 space-y-1.5">
          <div className="text-white/30 mb-2">action by</div>
          <Legend dot="#5ad9c8" label="ecodiaos" />
          <Legend dot="#f0a847" label="tate" />
          <Legend dot="#a47cff" label="client" />
          <Legend dot="#5a6577" label="external" />
        </div>
      )}

      {/* Right legend - fork status */}
      {showLegend && (
        <div className="ambient-hud-legend pointer-events-none absolute right-6 bottom-32 z-10 text-[10px] uppercase tracking-[0.16em] text-white/40 space-y-1.5 text-right">
          <div className="text-white/30 mb-2">forks</div>
          <Legend dot="#ffb27a" label="running" alignRight />
          <Legend dot="#5ad9c8" label="done" alignRight />
          <Legend dot="#e85a5a" label="error" alignRight />
        </div>
      )}

      {/* Faint signature corner mark - bottom-right, our piercing-uniquity bit:
          a tiny rotating dot pattern derived from our ember palette. NOT a wordmark. */}
      <SignatureCorner />
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-white/40">{label}</span>
      <span className="text-[14px] font-medium" style={{ color: accent, textShadow: `0 0 8px ${accent}66` }}>
        {value}
      </span>
    </div>
  )
}

function Legend({ dot, label, alignRight = false }: { dot: string; label: string; alignRight?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${alignRight ? 'justify-end' : ''}`}>
      {alignRight && <span>{label}</span>}
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot, boxShadow: `0 0 4px ${dot}` }} />
      {!alignRight && <span>{label}</span>}
    </div>
  )
}

/**
 * SignatureCorner - the one concrete thing that could only have come from us.
 *
 * Three rotating tick marks (3, 6, 12 o'clock) at the corner, ember on charcoal,
 * marking the conductor's heartbeat. Inspired by the W.S. 17-31-104
 * Algorithmic Manager designation - three notches for the three Ecodia entities
 * (DAO LLC / Pty Ltd / Labs).
 */
function SignatureCorner() {
  return (
    <div className="ambient-hud-signature pointer-events-none absolute bottom-5 right-5 z-10">
      <svg width="44" height="44" viewBox="0 0 44 44" className="opacity-60">
        <g transform="translate(22 22)">
          <g style={{ transformOrigin: 'center', animation: 'sig-rotate 18s linear infinite' }}>
            <line x1="0" y1="-18" x2="0" y2="-14" stroke="#ffb27a" strokeWidth="1" />
            <line x1="15.5" y1="9" x2="12" y2="7" stroke="#ffb27a" strokeWidth="1" />
            <line x1="-15.5" y1="9" x2="-12" y2="7" stroke="#ffb27a" strokeWidth="1" />
          </g>
          <circle r="1.4" fill="#ffb27a" />
          <circle r="20" fill="none" stroke="#ffb27a" strokeWidth="0.4" opacity="0.3" />
        </g>
      </svg>
      <style>{`@keyframes sig-rotate { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  )
}
