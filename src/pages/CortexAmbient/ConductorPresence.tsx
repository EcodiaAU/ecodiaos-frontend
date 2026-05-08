/**
 * ConductorPresence - the central living form at the centre of the scene.
 *
 * NOT a sphere. NOT a Stark-style hologram bust. We compose two
 * counter-rotating geometries: a faceted icosahedron core (the decision-maker)
 * and a wireframe torus knot lattice around it (the active context). The
 * core breathes via a vertex-displacement uniform driven by elapsedTime
 * and an "intensity" uniform that we drive from system load (number of
 * running forks).
 *
 * The signature ember glow at the core is the brand surface. Everything
 * else in the scene reads relative to it.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useForksStore, selectActiveForks } from '@/store/forksStore'
import { useOSSessionStore } from '@/store/osSessionStore'
import { AMBIENT_PALETTE } from './palette'

const coreVertex = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying float vDisp;

  // simple cheap noise
  float hash(vec3 p){ return fract(sin(dot(p, vec3(12.989, 78.233, 37.719))) * 43758.5453); }

  void main() {
    vec3 p = position;
    float n = sin(p.x * 2.0 + uTime * 0.6)
            + sin(p.y * 2.4 + uTime * 0.5)
            + sin(p.z * 2.1 + uTime * 0.7);
    float disp = n * 0.06 * (0.6 + uIntensity * 0.8);
    p += normal * disp;
    vNormal = normal;
    vDisp = disp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const coreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uEmber;
  uniform vec3 uDeep;
  varying vec3 vNormal;
  varying float vDisp;

  void main() {
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float fres = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.5);
    float pulse = 0.5 + 0.5 * sin(uTime * 1.2);
    vec3 col = mix(uDeep, uEmber, fres + vDisp * 4.0 + pulse * 0.15 * uIntensity);
    col += uEmber * fres * (0.6 + uIntensity * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function ConductorPresence() {
  const coreRef = useRef<THREE.Mesh | null>(null)
  const latticeRef = useRef<THREE.Mesh | null>(null)
  const haloRef = useRef<THREE.Mesh | null>(null)

  const forks = useForksStore((s) => s.forks)
  const status = useOSSessionStore((s) => s.status)
  const messageCount = useOSSessionStore((s) => s.messages.length)

  // Brief flash on every new message (incoming or outgoing). The presence
  // visibly registers that a message landed - without this, sending feels
  // like shouting into a void.
  const messageFlashRef = useRef<number>(0)
  useEffect(() => {
    messageFlashRef.current = 1.0
  }, [messageCount])

  const baseIntensity = useMemo(() => {
    const active = selectActiveForks(forks).length
    // 0 forks -> 0.05 hum, 1 -> 0.4, 5+ -> 1.0
    return Math.min(1, 0.05 + active * 0.18)
  }, [forks])

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0.05 },
    uEmber: { value: new THREE.Color(AMBIENT_PALETTE.coreGlow) },
    uDeep: { value: new THREE.Color(AMBIENT_PALETTE.emberDeep) },
  }), [])

  useFrame((state, dt) => {
    uniforms.uTime.value = state.clock.elapsedTime

    // Streaming bumps intensity floor up so the presence visibly thinks.
    // Add a fast-decaying flash when a new message arrives.
    messageFlashRef.current = Math.max(0, messageFlashRef.current - dt * 1.4)
    const streamingBoost = status === 'streaming' ? 0.55 : 0
    const errorBoost = status === 'error' ? 0.35 : 0
    const target = Math.min(
      1,
      baseIntensity + streamingBoost + errorBoost + messageFlashRef.current * 0.45,
    )

    // Smooth toward target. Faster when ramping up (response feel),
    // slower coming down (afterglow).
    const ramping = target > uniforms.uIntensity.value
    const speed = ramping ? 4.0 : 1.0
    uniforms.uIntensity.value += (target - uniforms.uIntensity.value) * Math.min(1, dt * speed)

    if (coreRef.current) {
      // Core spins faster while streaming - it visibly accelerates with effort.
      const baseSpin = 0.12 + uniforms.uIntensity.value * 0.18
      coreRef.current.rotation.y += dt * baseSpin
      coreRef.current.rotation.x += dt * (0.05 + uniforms.uIntensity.value * 0.06)
    }
    if (latticeRef.current) {
      latticeRef.current.rotation.y -= dt * (0.18 + uniforms.uIntensity.value * 0.22)
      latticeRef.current.rotation.z += dt * 0.08
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.6) * 0.02
      latticeRef.current.scale.setScalar(s)
    }
    if (haloRef.current) {
      haloRef.current.rotation.z += dt * 0.04
      const m = haloRef.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.06 + uniforms.uIntensity.value * 0.18
    }
  })

  return (
    <group>
      {/* Core: faceted icosahedron with displacement shader */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1.05, 2]} />
        <shaderMaterial
          vertexShader={coreVertex}
          fragmentShader={coreFragment}
          uniforms={uniforms}
          transparent={false}
        />
      </mesh>

      {/* Lattice: counter-rotating torus knot wireframe.
          Tight radius (1.35) so it stays clear of the rising chat-beam messages. */}
      <mesh ref={latticeRef}>
        <torusKnotGeometry args={[1.35, 0.04, 200, 18, 3, 7]} />
        <meshBasicMaterial color={AMBIENT_PALETTE.coreGlow} transparent opacity={0.32} wireframe />
      </mesh>

      {/* Outer halo plane - subtle ember bloom anchor.
          Compact ring (1.55-1.95) hugging the core so it does not occlude
          the chat-beam billboards stacking up above origin. */}
      <mesh ref={haloRef} rotation={[0, 0, 0]}>
        <ringGeometry args={[1.55, 1.95, 64]} />
        <meshBasicMaterial color={AMBIENT_PALETTE.coreGlow} transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
