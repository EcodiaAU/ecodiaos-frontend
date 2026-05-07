/**
 * CommandDeck — Holographic 3D command surface.
 *
 * Architecture: Two layers stacked.
 *   1. Three.js canvas (background) — stars, grid, orbital rings. Pure ambient.
 *   2. DOM layer (foreground) — real panels with CSS 3D transforms.
 *
 * Click a panel label to fly the camera + DOM perspective to it.
 * Tab cycles. Escape returns home. Full native DOM interaction.
 */
import { useRef, useState, useEffect, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
// framer-motion available if needed for panel animations

// ─── Types ──────────────────────────────────────────────────────────

export interface PanelConfig {
  id: string
  label: string
  position: [number, number, number]
  rotation?: [number, number, number]
  width: number
  content: ReactNode
}

interface CommandDeckProps {
  panels: PanelConfig[]
  initialPanel?: string
}

// ─── Three.js ambient background ────────────────────────────────────

function Grid() {
  const ref = useRef<THREE.GridHelper>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.008
  })
  return (
    <gridHelper
      ref={ref}
      args={[100, 100, 0x0a0a0a, 0x060606]}
      position={[0, -5, 0]}
    />
  )
}

function Ring({ radius, speed, opacity }: { radius: number; speed: number; opacity: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * speed * 0.4) * 0.2
      ref.current.rotation.z = state.clock.elapsedTime * speed
    }
  })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, 0.003, 16, 256]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
    </mesh>
  )
}

function AmbientScene() {
  return (
    <>
      <Stars radius={80} depth={60} count={1500} factor={3} saturation={0} fade speed={0.3} />
      <Grid />
      <Ring radius={6} speed={0.12} opacity={0.05} />
      <Ring radius={9} speed={-0.06} opacity={0.025} />
      <Ring radius={3.5} speed={0.2} opacity={0.04} />
      <ambientLight intensity={0.05} />
    </>
  )
}

// ─── DOM panel ──────────────────────────────────────────────────────

function DOMPanel({
  config,
  active,
  onFocus,
}: {
  config: PanelConfig
  active: boolean
  onFocus: () => void
}) {
  const [x, y, z] = config.position
  const [rx, ry, rz] = config.rotation || [0, 0, 0]

  // Convert 3D position to CSS transform
  // Scale: 1 unit = 200px for positioning
  const scale = 200
  const cssTransform = [
    `translateX(${x * scale}px)`,
    `translateY(${-y * scale}px)`,
    `translateZ(${z * scale}px)`,
    `rotateX(${rx}deg)`,
    `rotateY(${ry}deg)`,
    `rotateZ(${rz}deg)`,
    `scale(${active ? 1 : 0.85})`,
  ].join(' ')

  return (
    <div
      className="absolute top-0 left-0 w-full h-full flex items-center justify-center"
      style={{
        transform: cssTransform,
        opacity: active ? 1 : 0.25,
        transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease',
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 10 : 1,
      }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: `${config.width}px`,
          height: '88vh',
          background: 'rgba(0,0,0,0.80)',
          border: `1px solid rgba(255,255,255,${active ? 0.08 : 0.03})`,
          borderRadius: '10px',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Panel header — clickable to focus */}
        <button
          onClick={onFocus}
          className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0 w-full text-left"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            cursor: active ? 'default' : 'pointer',
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              background: active ? 'rgba(46,204,113,0.80)' : 'rgba(255,255,255,0.20)',
              boxShadow: active ? '0 0 8px rgba(46,204,113,0.40)' : 'none',
              transition: 'all 0.4s ease',
            }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-[0.15em]"
            style={{ color: active ? 'rgba(255,255,255,0.50)' : 'rgba(255,255,255,0.20)' }}
          >
            {config.label}
          </span>
        </button>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden">
          {config.content}
        </div>
      </div>
    </div>
  )
}

// ─── Main export ────────────────────────────────────────────────────

export default function CommandDeck({ panels, initialPanel }: CommandDeckProps) {
  const [activePanel, setActivePanel] = useState(initialPanel || panels[0]?.id || '')
  const sceneRef = useRef<HTMLDivElement>(null)

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Tab') {
        e.preventDefault()
        const idx = panels.findIndex(p => p.id === activePanel)
        const next = (idx + 1) % panels.length
        setActivePanel(panels[next].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePanel, panels])

  // Compute the scene "camera" transform — shifts the perspective origin
  // so the active panel appears centered
  const activeConfig = panels.find(p => p.id === activePanel)
  const [ax, ay, az] = activeConfig?.position || [0, 0, 0]
  const scale = 200
  const sceneTransform = `translateX(${-ax * scale}px) translateY(${ay * scale}px) translateZ(${-az * scale}px)`

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#000' }}>
      {/* Layer 1: Three.js ambient background */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <Canvas
          camera={{ position: [0, 1, 8], fov: 60 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <AmbientScene />
        </Canvas>
      </div>

      {/* Layer 2: DOM panels in 3D CSS space */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: '1200px', zIndex: 1 }}
      >
        <div
          ref={sceneRef}
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: sceneTransform,
            transition: 'transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {panels.map(p => (
            <DOMPanel
              key={p.id}
              config={p}
              active={p.id === activePanel}
              onFocus={() => setActivePanel(p.id)}
            />
          ))}
        </div>
      </div>

      {/* HUD corners */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />

        {/* Nav hint */}
        {panels.length > 1 && (
          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono uppercase tracking-[0.2em]"
            style={{ color: 'rgba(255,255,255,0.12)' }}
          >
            tab · navigate
          </div>
        )}
      </div>
    </div>
  )
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop = pos.startsWith('t')
  const isLeft = pos.endsWith('l')
  return (
    <div
      className="absolute w-5 h-5"
      style={{
        top: isTop ? '14px' : undefined,
        bottom: !isTop ? '14px' : undefined,
        left: isLeft ? '14px' : undefined,
        right: !isLeft ? '14px' : undefined,
      }}
    >
      <div
        className="absolute"
        style={{
          [isTop ? 'top' : 'bottom']: 0,
          [isLeft ? 'left' : 'right']: 0,
          width: '100%',
          height: '1px',
          background: 'rgba(255,255,255,0.12)',
        }}
      />
      <div
        className="absolute"
        style={{
          [isTop ? 'top' : 'bottom']: 0,
          [isLeft ? 'left' : 'right']: 0,
          width: '1px',
          height: '100%',
          background: 'rgba(255,255,255,0.12)',
        }}
      />
    </div>
  )
}
