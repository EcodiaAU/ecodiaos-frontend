/**
 * ParticleField - ambient particles flowing through the scene.
 *
 * Represents perception events / system pulse. Small, fast, transient.
 * Spawned in a sphere around the conductor, drifting slowly outward,
 * recycled when they leave the bounds.
 *
 * One Points object with InstancedBufferAttribute for positions + velocity
 * + lifetime; one shaderMaterial for the soft ember-and-cyan blend.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AMBIENT_PALETTE } from './palette'

interface ParticleFieldProps {
  count?: number
}

export function ParticleField({ count = 140 }: ParticleFieldProps) {
  const ref = useRef<THREE.Points | null>(null)
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const lifetimes = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const ember = new THREE.Color(AMBIENT_PALETTE.coreGlow)
    const cyan = new THREE.Color(AMBIENT_PALETTE.cyan)
    const violet = new THREE.Color(AMBIENT_PALETTE.violet)
    for (let i = 0; i < count; i++) {
      const r = 2.4 + Math.random() * 6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.6
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      velocities[i * 3] = (Math.random() - 0.5) * 0.06
      velocities[i * 3 + 1] = (Math.random() - 0.3) * 0.04 + 0.02
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.06
      lifetimes[i] = Math.random() * 6 + 2
      const pick = Math.random()
      const c = pick < 0.6 ? ember : pick < 0.85 ? cyan : violet
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    return { positions, velocities, lifetimes, colors }
  }, [count])

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
    return g
  }, [data])

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.7,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useFrame((_, dt) => {
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute
    const arr = posAttr.array as Float32Array
    for (let i = 0; i < count; i++) {
      arr[i * 3] += data.velocities[i * 3] * dt * 30
      arr[i * 3 + 1] += data.velocities[i * 3 + 1] * dt * 30
      arr[i * 3 + 2] += data.velocities[i * 3 + 2] * dt * 30
      data.lifetimes[i] -= dt
      // Recycle particles that drift too far or die
      const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2]
      const distSq = x * x + y * y + z * z
      if (distSq > 169 /* 13^2 */ || data.lifetimes[i] <= 0) {
        const r = 2.0 + Math.random() * 1.4
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        arr[i * 3 + 1] = r * Math.cos(phi) * 0.6
        arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
        data.lifetimes[i] = Math.random() * 6 + 2
      }
    }
    posAttr.needsUpdate = true
  })

  return <points ref={ref} geometry={geom} material={material} />
}
