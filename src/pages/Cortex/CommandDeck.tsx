/**
 * CommandDeck — Full 3D holographic OS workspace.
 *
 * React Three Fiber scene. Every interface panel is a real object in 3D space.
 * Click any panel to fly the camera to it. Smooth cinematic transitions.
 * The OS IS the space.
 *
 * Panels use drei's `Html` for fully interactive DOM inside the 3D scene —
 * native scrolling, text selection, input focus all work.
 */
import { useRef, useState, useEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars } from '@react-three/drei'
import * as THREE from 'three'

// ─── Types ──────────────────────────────────────────────────────────

interface PanelConfig {
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

// ─── Smooth camera that flies to targets ────────────────────────────

function FlyCamera({ target, lookAt }: { target: THREE.Vector3; lookAt: THREE.Vector3 }) {
  const { camera } = useThree()
  const currentPos = useRef(new THREE.Vector3(0, 0, 12))
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0))
  const velocity = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const speed = 2.5
    const damping = 0.92

    // Spring toward target position
    const diff = new THREE.Vector3().subVectors(target, currentPos.current)
    velocity.current.add(diff.multiplyScalar(delta * speed))
    velocity.current.multiplyScalar(damping)
    currentPos.current.add(velocity.current)

    // Smooth look-at
    currentLookAt.current.lerp(lookAt, delta * 3)

    camera.position.copy(currentPos.current)
    camera.lookAt(currentLookAt.current)
  })

  return null
}

// ─── Ambient grid — the "floor" of the space ────────────────────────

function Grid() {
  const ref = useRef<THREE.GridHelper>(null)
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.01
    }
  })
  return (
    <gridHelper
      ref={ref}
      args={[80, 80, 0x111111, 0x0a0a0a]}
      position={[0, -4, 0]}
    />
  )
}

// ─── Ambient ring — orbiting geometry ───────────────────────────────

function OrbitalRing({ radius, speed, opacity }: { radius: number; speed: number; opacity: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * speed * 0.3) * 0.1
      ref.current.rotation.z = state.clock.elapsedTime * speed
    }
  })
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, 0.005, 16, 200]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={opacity} />
    </mesh>
  )
}

// ─── Panel nav dot — small clickable sphere in space ────────────────

function NavDot({
  position,
  active,
  onClick,
  label,
}: {
  position: [number, number, number]
  active: boolean
  onClick: () => void
  label: string
}) {
  const ref = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (ref.current) {
      const scale = active ? 1.4 : hovered ? 1.2 : 1
      ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, scale, 0.1))
      if (active) {
        const mat = ref.current.material as THREE.MeshBasicMaterial
        mat.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 2) * 0.2
      }
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
      >
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial
          color={active ? '#ffffff' : '#666666'}
          transparent
          opacity={active ? 0.8 : 0.4}
        />
      </mesh>
      {/* Label */}
      <Html position={[0, -0.25, 0]} center style={{ pointerEvents: 'none' }}>
        <div
          style={{
            color: active ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.25)',
            fontSize: '9px',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

// ─── Interactive HTML panel in 3D space ─────────────────────────────

function Panel3D({
  config,
  active,
  onFocus,
}: {
  config: PanelConfig
  active: boolean
  onFocus: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(() => {
    if (groupRef.current) {
      const targetOpacity = active ? 1 : 0.3
      const current = groupRef.current.userData.opacity ?? 0.3
      groupRef.current.userData.opacity = THREE.MathUtils.lerp(current, targetOpacity, 0.05)
    }
  })

  const rotation = config.rotation || [0, 0, 0]

  return (
    <group
      ref={groupRef}
      position={config.position}
      rotation={rotation.map(r => r * Math.PI / 180) as [number, number, number]}
    >
      {/* Clickable backing plane for focus-on-click */}
      {!active && (
        <mesh
          onClick={(e) => { e.stopPropagation(); onFocus() }}
          onPointerOver={() => { document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        >
          <planeGeometry args={[config.width * 0.003, config.width * 0.003 * 1.4]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* The actual interactive HTML */}
      <Html
        transform
        distanceFactor={4}
        style={{
          width: `${config.width}px`,
          height: '80vh',
          overflow: 'hidden',
          opacity: active ? 1 : 0.4,
          transition: 'opacity 0.6s ease',
          pointerEvents: active ? 'auto' : 'none',
        }}
        className="command-deck-panel"
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: active ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.50)',
            border: `1px solid rgba(255,255,255,${active ? 0.10 : 0.04})`,
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: active ? 'rgba(46,204,113,0.80)' : 'rgba(255,255,255,0.20)',
                boxShadow: active ? '0 0 6px rgba(46,204,113,0.40)' : 'none',
              }}
            />
            <span
              style={{
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'rgba(255,255,255,0.40)',
                fontFamily: 'monospace',
              }}
            >
              {config.label}
            </span>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {config.content}
          </div>
        </div>
      </Html>
    </group>
  )
}

// ─── The scene ──────────────────────────────────────────────────────

function Scene({ panels, initialPanel }: CommandDeckProps) {
  const [activePanel, setActivePanel] = useState(initialPanel || panels[0]?.id || '')

  const activeConfig = panels.find(p => p.id === activePanel)
  const cameraTarget = useMemo(() => {
    if (!activeConfig) return new THREE.Vector3(0, 0, 12)
    const [x, y, z] = activeConfig.position
    // Position camera in front of the panel, offset toward the viewer
    const rot = activeConfig.rotation || [0, 0, 0]
    const yRot = (rot[1] || 0) * Math.PI / 180
    return new THREE.Vector3(
      x - Math.sin(yRot) * 4,
      y + 0.3,
      z + Math.cos(yRot) * 4
    )
  }, [activeConfig])

  const lookAtTarget = useMemo(() => {
    if (!activeConfig) return new THREE.Vector3(0, 0, 0)
    return new THREE.Vector3(...activeConfig.position)
  }, [activeConfig])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const idx = panels.findIndex(p => p.id === activePanel)
        const next = (idx + 1) % panels.length
        setActivePanel(panels[next].id)
      }
      if (e.key === 'Escape') {
        setActivePanel(panels[0]?.id || '')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePanel, panels])

  return (
    <>
      <FlyCamera target={cameraTarget} lookAt={lookAtTarget} />

      {/* Ambient */}
      <Stars radius={100} depth={50} count={2000} factor={2} saturation={0} fade speed={0.5} />
      <Grid />
      <OrbitalRing radius={8} speed={0.15} opacity={0.06} />
      <OrbitalRing radius={12} speed={-0.08} opacity={0.03} />
      <OrbitalRing radius={5} speed={0.25} opacity={0.04} />

      {/* Ambient light */}
      <ambientLight intensity={0.1} />

      {/* Nav dots — always visible, clickable */}
      {panels.map(p => (
        <NavDot
          key={p.id}
          position={[p.position[0], p.position[1] + 2.5, p.position[2]]}
          active={p.id === activePanel}
          onClick={() => setActivePanel(p.id)}
          label={p.label}
        />
      ))}

      {/* Panels */}
      {panels.map(p => (
        <Panel3D
          key={p.id}
          config={p}
          active={p.id === activePanel}
          onFocus={() => setActivePanel(p.id)}
        />
      ))}
    </>
  )
}

// ─── Export ─────────────────────────────────────────────────────────

export default function CommandDeck(props: CommandDeckProps) {
  return (
    <div className="fixed inset-0" style={{ background: '#000000' }}>
      <Canvas
        camera={{ position: [0, 0, 12], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ background: '#000000' }}
      >
        <Scene {...props} />
      </Canvas>

      {/* HUD overlay — corner brackets */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        <Corner pos="top-left" />
        <Corner pos="top-right" />
        <Corner pos="bottom-left" />
        <Corner pos="bottom-right" />

        {/* Tab hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.15)' }}>
          tab to navigate
        </div>
      </div>
    </div>
  )
}

function Corner({ pos }: { pos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const styles: Record<string, string> = {}
  const [v, h] = pos.split('-')
  styles[v] = '16px'
  styles[h] = '16px'

  return (
    <div className="absolute w-6 h-6" style={styles}>
      <div
        className="absolute"
        style={{
          [v]: 0, [h]: 0,
          width: '100%', height: '1px',
          background: 'rgba(255,255,255,0.15)',
        }}
      />
      <div
        className="absolute"
        style={{
          [v]: 0, [h]: 0,
          width: '1px', height: '100%',
          background: 'rgba(255,255,255,0.15)',
        }}
      />
    </div>
  )
}
