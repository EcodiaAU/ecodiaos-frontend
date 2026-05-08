/**
 * Footer - DAO marks. Quiet, single-line, pinned to bottom of page.
 *
 * Round-3 redispatch (fork_mowtxg3d_302865). Spec §C layout, last row.
 */
import { AMBIENT_PALETTE } from './palette'

export function Footer() {
  return (
    <footer
      className="ambient-footer w-full"
      style={{
        borderTop: '1px solid rgba(255,178,122,0.08)',
        padding: '14px 16px 22px',
        marginTop: 24,
        color: AMBIENT_PALETTE.textDim,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
        letterSpacing: '0.05em',
        textAlign: 'center',
      }}
    >
      <span>Ecodia DAO LLC</span>
      <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
      <span>Polygon PoS</span>
      <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
      <span>cortex.ambient v4</span>
    </footer>
  )
}
