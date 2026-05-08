/**
 * ChatBeam - the conversation stream as a rising focal beam.
 *
 * Recent assistant + user messages render as floating glowing planes
 * drifting upward through the scene. Older messages dim and recede.
 * The active turn (last message) is brightest. The beam itself is a
 * vertical tube of soft ember light anchored at the conductor.
 *
 * Reads from useOsSessionStore. Renders only the last 8 messages by
 * default to keep the scene readable.
 */
import React, { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useOSSessionStore, type OSSessionMessage } from '@/store/osSessionStore'
import { AMBIENT_PALETTE } from './palette'

const MAX_MESSAGES = 8
const BEAM_HEIGHT = 7

export function ChatBeam() {
  const messages = useOSSessionStore((s) => s.messages)

  const recent = useMemo<OSSessionMessage[]>(() => {
    const list = (messages ?? []).slice(-MAX_MESSAGES)
    return list
  }, [messages])

  // Beam tube
  const beamRef = React.useRef<THREE.Mesh | null>(null)
  useFrame((state) => {
    if (beamRef.current) {
      const t = state.clock.elapsedTime
      const m = beamRef.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.07 + Math.sin(t * 0.8) * 0.02
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {/* The beam itself - a faint ember pillar */}
      <mesh ref={beamRef} position={[0, BEAM_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.18, BEAM_HEIGHT, 16, 1, true]} />
        <meshBasicMaterial
          color={AMBIENT_PALETTE.coreGlow}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Message planes drifting upward */}
      {recent.map((msg, idx) => {
        const offsetFromTop = recent.length - 1 - idx // 0 = newest at bottom of beam
        const isActive = idx === recent.length - 1
        return (
          <MessagePlane
            key={msg.id}
            content={msg.content}
            role={msg.role}
            yOffset={1.5 + offsetFromTop * 0.78}
            active={isActive}
            ageIndex={offsetFromTop}
          />
        )
      })}
    </group>
  )
}

interface MessagePlaneProps {
  content: string
  role: 'user' | 'assistant'
  yOffset: number
  active: boolean
  ageIndex: number
}

function MessagePlane({ content, role, yOffset, active, ageIndex }: MessagePlaneProps) {
  const groupRef = React.useRef<THREE.Group | null>(null)
  const startY = useMemo(() => yOffset, [yOffset])
  const opacityTarget = active ? 1.0 : Math.max(0.12, 0.85 - ageIndex * 0.12)
  const tint = role === 'user' ? AMBIENT_PALETTE.amber : AMBIENT_PALETTE.coreGlow

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    // Gentle vertical drift upward
    groupRef.current.position.y = startY + Math.sin(t * 0.4 + ageIndex) * 0.04
    groupRef.current.position.x = Math.sin(t * 0.18 + ageIndex * 1.3) * 0.18
  })

  const preview = (content || '').slice(0, 180)
  const truncated = content && content.length > 180

  return (
    <group ref={groupRef} position={[0, startY, 0]}>
      <Billboard>
        <mesh>
          <planeGeometry args={[3.6, 0.9]} />
          <meshBasicMaterial color={'#0a0d12'} transparent opacity={0.62 * opacityTarget} />
        </mesh>
        <Text
          position={[-1.6, 0.32, 0.01]}
          fontSize={0.09}
          color={tint}
          anchorX="left"
          anchorY="middle"
          outlineColor="#000"
          outlineWidth={0.003}
        >
          {role === 'user' ? 'TATE' : 'ECODIAOS'}
        </Text>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.11}
          color={AMBIENT_PALETTE.text}
          maxWidth={3.3}
          anchorX="center"
          anchorY="middle"
          fillOpacity={opacityTarget}
        >
          {preview + (truncated ? '...' : '')}
        </Text>
      </Billboard>
    </group>
  )
}
