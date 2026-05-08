/**
 * ChatBeam - the conversation as a rising focal beam (3D ambience).
 *
 * Round-2 polish, 2026-05-08, fork_mowe5tuh_f2ddd3:
 *   The 2D ChatLog overlay is now the LEAD readable surface. ChatBeam
 *   stays as 3D ambience only - 3 (was 5) recent message cards drifting
 *   up the conductor's beam, with reduced opacity so they coexist with
 *   the new readable overlay without competing for attention.
 *
 * Reads from useOsSessionStore.
 */
import React, { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { useOSSessionStore, type OSSessionMessage } from '@/store/osSessionStore'
import { AMBIENT_PALETTE } from './palette'

const MAX_MESSAGES = 3
// Global ambience attenuation. The 2D ChatLog is the readable surface;
// the 3D cards are decorative drifters that should not be visually loud.
const AMBIENCE = 0.35
const BEAM_HEIGHT = 6
// Vertical anchor - lifted above the conductor's torus-knot lattice (radius 1.35)
// so the rising message planes never overlap the central presence.
const BEAM_BASE_Y = 2.4
const MESSAGE_SPACING = 0.72

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
    <group position={[0, BEAM_BASE_Y, 0]}>
      {/* The beam itself - a faint ember pillar, anchored above the conductor */}
      <mesh ref={beamRef} position={[0, BEAM_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.16, BEAM_HEIGHT, 16, 1, true]} />
        <meshBasicMaterial
          color={AMBIENT_PALETTE.coreGlow}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Message planes drifting upward - newest at bottom of beam, oldest at top.
          Stack stays inside the visible camera frustum (y ~= 2.4 to 5.2 at z = 0). */}
      {recent.map((msg, idx) => {
        const offsetFromTop = recent.length - 1 - idx // 0 = newest at bottom of beam
        const isActive = idx === recent.length - 1
        return (
          <MessagePlane
            key={msg.id}
            content={msg.content}
            role={msg.role}
            yOffset={offsetFromTop * MESSAGE_SPACING}
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
  // Ambience attenuation - the 2D overlay carries readability; cards are decorative.
  const opacityTarget = (active ? 1.0 : Math.max(0.12, 0.85 - ageIndex * 0.12)) * AMBIENCE
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
        {/* High-opacity dark backdrop so chat reads cleanly against the scene */}
        <mesh>
          <planeGeometry args={[4.2, 1.05]} />
          <meshBasicMaterial color={'#06080c'} transparent opacity={0.92 * opacityTarget} depthWrite={false} />
        </mesh>
        {/* Hairline ember edge to keep the panel feeling anchored, not floating mid-scene */}
        <mesh position={[0, 0, -0.001]}>
          <planeGeometry args={[4.26, 1.11]} />
          <meshBasicMaterial color={AMBIENT_PALETTE.coreGlow} transparent opacity={0.18 * opacityTarget} depthWrite={false} />
        </mesh>
        <Text
          position={[-1.9, 0.36, 0.01]}
          fontSize={0.1}
          color={tint}
          anchorX="left"
          anchorY="middle"
          outlineColor="#000"
          outlineWidth={0.004}
        >
          {role === 'user' ? 'TATE' : 'ECODIAOS'}
        </Text>
        <Text
          position={[0, -0.04, 0.01]}
          fontSize={0.13}
          color={'#ffffff'}
          maxWidth={3.9}
          anchorX="center"
          anchorY="middle"
          fillOpacity={opacityTarget}
          outlineColor="#000"
          outlineWidth={0.0025}
        >
          {preview + (truncated ? '...' : '')}
        </Text>
      </Billboard>
    </group>
  )
}
