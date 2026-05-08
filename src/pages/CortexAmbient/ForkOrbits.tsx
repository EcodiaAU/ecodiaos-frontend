/**
 * ForkOrbits - live forks as orbital living bodies around the conductor.
 *
 * Each fork is a glowing orb on its own elliptical orbit. Running forks
 * pulse and move fast. Done forks fade and drift outward. Errored forks
 * flash red and recede. Hover surfaces a floating glass label with the
 * fork brief preview.
 *
 * Uses instancedMesh for the orb cores. Halo glows are individual sprites
 * for per-fork colour control.
 */
import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useForksStore, type ForkSnapshot } from '@/store/forksStore'
import { AMBIENT_PALETTE, forkStatusColor } from './palette'

interface OrbitSpec {
  fork: ForkSnapshot
  radius: number
  speed: number
  inclination: number
  phase: number
}

function hashStr(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i)
  return Math.abs(h)
}

function specFor(fork: ForkSnapshot): OrbitSpec {
  const h = hashStr(fork.fork_id)
  const isActive = fork.status === 'running' || fork.status === 'spawning' || fork.status === 'reporting'
  const radius = isActive
    ? 3.3 + (h % 1000) / 1000 * 1.6
    : 5.6 + (h % 1000) / 1000 * 2.4
  const speed = isActive ? 0.18 + ((h >> 4) % 100) / 100 * 0.14 : 0.04 + ((h >> 4) % 100) / 100 * 0.05
  const inclination = ((h >> 8) % 100) / 100 * Math.PI * 0.6 - Math.PI * 0.3
  const phase = ((h >> 12) % 1000) / 1000 * Math.PI * 2
  return { fork, radius, speed, inclination, phase }
}

interface OrbBodyProps {
  spec: OrbitSpec
  onHover: (spec: OrbitSpec | null) => void
}

function OrbBody({ spec, onHover }: OrbBodyProps) {
  const groupRef = useRef<THREE.Group | null>(null)
  const haloRef = useRef<THREE.Mesh | null>(null)
  const { color, pulse } = forkStatusColor(spec.fork.status)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const a = spec.phase + t * spec.speed
    const x = Math.cos(a) * spec.radius
    const z = Math.sin(a) * spec.radius
    const y = Math.sin(a * 0.6 + spec.inclination) * spec.radius * 0.18
    if (groupRef.current) {
      groupRef.current.position.set(x, y, z)
      const breathe = 1 + Math.sin(t * 2.4 + spec.phase) * 0.18 * pulse
      groupRef.current.scale.setScalar(breathe)
    }
    if (haloRef.current) {
      const m = haloRef.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.18 + Math.sin(t * 3 + spec.phase) * 0.08 * pulse
    }
  })

  const trailPoints = useMemo(() => {
    const points: THREE.Vector3[] = []
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      points.push(new THREE.Vector3(
        Math.cos(a) * spec.radius,
        Math.sin(a * 0.6 + spec.inclination) * spec.radius * 0.18,
        Math.sin(a) * spec.radius,
      ))
    }
    return points
  }, [spec.radius, spec.inclination])

  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(trailPoints)
    return g
  }, [trailPoints])

  const isActive = spec.fork.status === 'running' || spec.fork.status === 'spawning' || spec.fork.status === 'reporting'
  return (
    <group>
      {/* Faint orbital trail - only for active forks */}
      {isActive && (
        <line>
          <primitive object={trailGeom} attach="geometry" />
          <lineBasicMaterial color={color} transparent opacity={0.16} />
        </line>
      )}
      <group ref={groupRef}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); onHover(spec) }}
          onPointerOut={() => onHover(null)}
        >
          <sphereGeometry args={[0.13, 24, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={1.4 + pulse * 0.8}
            roughness={0.2}
            metalness={0.1}
          />
        </mesh>
        <mesh ref={haloRef}>
          <sphereGeometry args={[0.34, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} />
        </mesh>
      </group>
    </group>
  )
}

export function ForkOrbits() {
  const forks = useForksStore((s) => s.forks)
  const [hovered, setHovered] = useState<OrbitSpec | null>(null)

  const specs = useMemo(() => {
    return Object.values(forks).map(specFor)
  }, [forks])

  return (
    <group>
      {specs.map((s) => (
        <OrbBody key={s.fork.fork_id} spec={s} onHover={setHovered} />
      ))}
      {hovered && (
        <Billboard position={[0, 4, 0]}>
          <mesh>
            <planeGeometry args={[5.4, 1.4]} />
            <meshBasicMaterial color={'#0a0d12'} transparent opacity={0.78} />
          </mesh>
          <Text
            position={[0, 0.3, 0.01]}
            fontSize={0.16}
            color={AMBIENT_PALETTE.text}
            maxWidth={5.0}
            anchorX="center"
            anchorY="middle"
            outlineColor="#000"
            outlineWidth={0.005}
          >
            {hovered.fork.fork_id} {hovered.fork.status}
          </Text>
          <Text
            position={[0, -0.18, 0.01]}
            fontSize={0.12}
            color={AMBIENT_PALETTE.textDim}
            maxWidth={5.0}
            anchorX="center"
            anchorY="middle"
          >
            {(hovered.fork.brief || '').slice(0, 140) + ((hovered.fork.brief || '').length > 140 ? '...' : '')}
          </Text>
        </Billboard>
      )}
    </group>
  )
}
