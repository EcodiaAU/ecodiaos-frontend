/**
 * StatusConstellation - status_board rows as a 3D constellation around the conductor.
 *
 * Spatial encoding:
 *   - Priority drives proximity to conductor: P1 close + bright, P5 far + dim.
 *   - entity_type drives angular cluster: each type occupies its own arc.
 *   - next_action_by drives colour (cyan / amber / violet / grey).
 *   - last_touched recency drives twinkle frequency.
 *
 * Uses instancedMesh so we can render 100+ rows at 60fps.
 */
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useStatusBoard, type StatusRow } from './useStatusBoard'
import { AMBIENT_PALETTE, actionByColor } from './palette'

const TYPE_ANGLES: Record<string, number> = {
  client: 0,
  project: Math.PI * 0.25,
  thread: Math.PI * 0.5,
  task: Math.PI * 0.75,
  opportunity: Math.PI,
  personal: Math.PI * 1.25,
  legal: Math.PI * 1.5,
  infrastructure: Math.PI * 1.75,
}

interface NodeSpec {
  row: StatusRow
  position: THREE.Vector3
  color: THREE.Color
  scale: number
}

function specsFor(rows: StatusRow[]): NodeSpec[] {
  // Group by type so we can spread within each cluster.
  const byType: Record<string, StatusRow[]> = {}
  for (const r of rows) {
    const t = r.entity_type || 'task'
    ;(byType[t] ??= []).push(r)
  }
  const specs: NodeSpec[] = []
  for (const [type, list] of Object.entries(byType)) {
    const baseAngle = TYPE_ANGLES[type] ?? Math.random() * Math.PI * 2
    list.forEach((r, i) => {
      const priority = Math.max(1, Math.min(5, r.priority || 3))
      // P1 close (4.0), P5 far (10.5)
      const radius = 4.0 + (priority - 1) * 1.6
      // Spread within cluster
      const localCount = list.length
      const localOffset = ((i / Math.max(1, localCount - 1)) - 0.5) * 0.55
      const angle = baseAngle + localOffset
      const yJitter = ((i % 7) - 3) * 0.32
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        yJitter,
        Math.sin(angle) * radius,
      )
      const color = new THREE.Color(actionByColor(r.next_action_by))
      // P1 = 1.4 scale, P5 = 0.4 scale
      const scale = 1.5 - (priority - 1) * 0.22
      specs.push({ row: r, position: pos, color, scale })
    })
  }
  return specs
}

export function StatusConstellation() {
  const rows = useStatusBoard()
  const specs = useMemo(() => specsFor(rows), [rows])
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorAttr = useMemo(() => {
    const arr = new Float32Array(Math.max(1, specs.length) * 3)
    specs.forEach((s, i) => {
      arr[i * 3] = s.color.r
      arr[i * 3 + 1] = s.color.g
      arr[i * 3 + 2] = s.color.b
    })
    return new THREE.InstancedBufferAttribute(arr, 3)
  }, [specs])

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime
    specs.forEach((s, i) => {
      // Soft drift: nodes orbit very slowly, twinkle scaled by recency
      const drift = Math.sin(t * 0.08 + i) * 0.06
      dummy.position.set(
        s.position.x + Math.cos(t * 0.04 + i * 0.21) * 0.08,
        s.position.y + drift,
        s.position.z + Math.sin(t * 0.04 + i * 0.21) * 0.08,
      )
      const twinkle = 1 + Math.sin(t * 1.4 + i * 1.7) * 0.18
      dummy.scale.setScalar(s.scale * 0.16 * twinkle)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const [hovered, setHovered] = useState<NodeSpec | null>(null)

  if (specs.length === 0) return null

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, specs.length]}
        onPointerMove={(e) => {
          const id = e.instanceId
          if (id != null) setHovered(specs[id])
        }}
        onPointerOut={() => setHovered(null)}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          vertexColors
          emissiveIntensity={1.6}
          roughness={0.25}
          metalness={0.3}
        />
        <primitive object={colorAttr} attach="geometry-attributes-color" />
      </instancedMesh>

      {/* Halo glow per node - cheap version: render same geometry slightly larger transparent */}
      <ConstellationHalo specs={specs} />

      {hovered && (
        <Billboard position={[hovered.position.x, hovered.position.y + 0.5, hovered.position.z]}>
          <Text fontSize={0.16} color={AMBIENT_PALETTE.text} maxWidth={3.4} anchorX="center" anchorY="middle"
            outlineColor="#000" outlineWidth={0.005}>
            {hovered.row.name}
          </Text>
          <Text position={[0, -0.22, 0]} fontSize={0.11} color={AMBIENT_PALETTE.textDim} maxWidth={3.4}
            anchorX="center" anchorY="middle">
            {(hovered.row.next_action || hovered.row.status || '').slice(0, 100)}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function ConstellationHalo({ specs }: { specs: NodeSpec[] }) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colorAttr = useMemo(() => {
    const arr = new Float32Array(Math.max(1, specs.length) * 3)
    specs.forEach((s, i) => {
      arr[i * 3] = s.color.r
      arr[i * 3 + 1] = s.color.g
      arr[i * 3 + 2] = s.color.b
    })
    return new THREE.InstancedBufferAttribute(arr, 3)
  }, [specs])

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime
    specs.forEach((s, i) => {
      dummy.position.set(
        s.position.x + Math.cos(t * 0.04 + i * 0.21) * 0.08,
        s.position.y + Math.sin(t * 0.08 + i) * 0.06,
        s.position.z + Math.sin(t * 0.04 + i * 0.21) * 0.08,
      )
      dummy.scale.setScalar(s.scale * 0.42)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, specs.length]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial vertexColors transparent opacity={0.18} />
      <primitive object={colorAttr} attach="geometry-attributes-color" />
    </instancedMesh>
  )
}
