/**
 * HoloDeck — The 3D holographic command deck.
 *
 * Pure black void. Floating translucent panels at different depths.
 * Mouse parallax shifts the camera perspective.
 * The main chat is the center panel. Forks orbit to the sides.
 * Ambient particles drift through the scene.
 *
 * This is not a dashboard. This is a command surface.
 */
import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Float } from '@react-three/drei'
import * as THREE from 'three'

// ─── Ambient particles — drifting through the void ──────────────────

function Particles({ count = 200 }: { count?: number }) {
  const mesh = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      arr[i] = (Math.random() - 0.5) * 40
    }
    return arr
  }, [count])

  const sizes = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      arr[i] = Math.random() * 1.5 + 0.3
    }
    return arr
  }, [count])

  useFrame((_, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.y += delta * 0.008
    mesh.current.rotation.x += delta * 0.003
  })

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#ffffff"
        transparent
        opacity={0.15}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

// ─── Mouse parallax camera rig ──────────────────────────────────────

function CameraRig() {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })

  useFrame(() => {
    target.current.x += (mouse.current.x - target.current.x) * 0.03
    target.current.y += (mouse.current.y - target.current.y) * 0.03
    camera.position.x = target.current.x * 0.8
    camera.position.y = target.current.y * 0.4
    camera.lookAt(0, 0, 0)
  })

  // Track mouse globally
  if (typeof window !== 'undefined') {
    const handler = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', handler, { passive: true })
  }

  return null
}

// ─── Grid plane — JARVIS reference grid ─────────────────────────────

function HoloGrid() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
      <planeGeometry args={[60, 60, 60, 60]} />
      <meshBasicMaterial
        color="#ffffff"
        wireframe
        transparent
        opacity={0.02}
      />
    </mesh>
  )
}

// ─── Floating panel wrapper ─────────────────────────────────────────

interface HoloPanelProps {
  children: React.ReactNode
  position: [number, number, number]
  width?: string
  opacity?: number
  floatSpeed?: number
  floatIntensity?: number
}

export function HoloPanel({
  children,
  position,
  width = '600px',
  opacity = 1,
  floatSpeed = 2,
  floatIntensity = 0.3,
}: HoloPanelProps) {
  return (
    <Float speed={floatSpeed} floatIntensity={floatIntensity} rotationIntensity={0.05}>
      <Html
        transform
        position={position}
        distanceFactor={5}
        style={{
          width,
          opacity,
          pointerEvents: 'auto',
        }}
      >
        {children}
      </Html>
    </Float>
  )
}

// ─── The scene ──────────────────────────────────────────────────────

interface HoloDeckSceneProps {
  mainPanel: React.ReactNode
  leftPanel?: React.ReactNode
  rightPanel?: React.ReactNode
  topPanel?: React.ReactNode
}

function Scene({ mainPanel, leftPanel, rightPanel, topPanel }: HoloDeckSceneProps) {
  return (
    <>
      <CameraRig />
      <Particles count={300} />
      <HoloGrid />

      {/* Main chat — center, closest */}
      <HoloPanel position={[0, 0, 0]} width="680px" floatSpeed={1.5} floatIntensity={0.15}>
        {mainPanel}
      </HoloPanel>

      {/* Left panel — forks or secondary info */}
      {leftPanel && (
        <HoloPanel position={[-4.5, 0.3, -2]} width="320px" opacity={0.85} floatSpeed={2.5} floatIntensity={0.4}>
          {leftPanel}
        </HoloPanel>
      )}

      {/* Right panel — forks or queue */}
      {rightPanel && (
        <HoloPanel position={[4.5, 0.3, -2]} width="320px" opacity={0.85} floatSpeed={2} floatIntensity={0.35}>
          {rightPanel}
        </HoloPanel>
      )}

      {/* Top panel — vitals/status */}
      {topPanel && (
        <HoloPanel position={[0, 2.8, -1]} width="500px" opacity={0.70} floatSpeed={3} floatIntensity={0.2}>
          {topPanel}
        </HoloPanel>
      )}
    </>
  )
}

// ─── Export: the full 3D canvas ─────────────────────────────────────

export default function HoloDeck(props: HoloDeckSceneProps) {
  return (
    <div className="absolute inset-0" style={{ background: '#000000' }}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#000000' }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}
