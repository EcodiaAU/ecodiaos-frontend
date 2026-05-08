/**
 * CortexAmbient - Jarvis-class ambient OS scene.
 *
 * SPIKE BUILD - 2026-05-08, fork_mow98jz7_9e1941.
 *
 * The classic /cortex page (CommandDeck + tabs + ForksPanel) remains untouched
 * at /cortex. This is an additive parallel surface at /cortex-ambient and
 * also reachable via /cortex?ambient=1 query flag.
 *
 * Vision: forks as orbital living bodies, status_board as constellation,
 * chat as focal beam, perception as ambient particles, scene breathes at idle.
 */
import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'

import { ConductorPresence } from './ConductorPresence'
import { ForkOrbits } from './ForkOrbits'
import { StatusConstellation } from './StatusConstellation'
import { ChatBeam } from './ChatBeam'
import { ParticleField } from './ParticleField'
import { SystemHUD } from './SystemHUD'
import { ChatInputPanel } from './ChatInputPanel'
import { useStatusBoard } from './useStatusBoard'
import { useAmbientAudio } from './useAmbientAudio'
import { AMBIENT_PALETTE } from './palette'

/**
 * Slow camera drift around the conductor presence, like a watcher
 * leaning in and out of the scene.
 */
function CameraBreath() {
  useFrame((state) => {
    const t = state.clock.elapsedTime
    state.camera.position.x = Math.sin(t * 0.06) * 1.6
    state.camera.position.y = 1.2 + Math.sin(t * 0.04) * 0.4
    state.camera.position.z = 9 + Math.cos(t * 0.05) * 0.6
    state.camera.lookAt(0, 0, 0)
  })
  return null
}

interface AmbientSceneProps {
  audioEnabled: boolean
}

/** Module-singleton Vector2 — postprocessing v2's ChromaticAberration expects a
 *  real THREE.Vector2 instance, not a tuple. Recreating it per render would
 *  thrash the effect's uniform allocation. */
const CHROMATIC_OFFSET = new THREE.Vector2(0.0008, 0.0012)

function AmbientScene({ audioEnabled }: AmbientSceneProps) {
  const statusRows = useStatusBoard()
  return (
    <>
      <color attach="background" args={[AMBIENT_PALETTE.base]} />
      <fog attach="fog" args={[AMBIENT_PALETTE.fog, 8, 28]} />
      <CameraBreath />

      {/* Ambient lighting - low key, depth-revealing */}
      <ambientLight intensity={0.18} color={AMBIENT_PALETTE.ambient} />
      <pointLight position={[0, 0, 0]} intensity={2.4} color={AMBIENT_PALETTE.coreGlow} distance={14} decay={2} />
      <pointLight position={[6, 4, -2]} intensity={0.4} color={AMBIENT_PALETTE.violet} distance={18} decay={2} />
      <pointLight position={[-7, -3, 1]} intensity={0.3} color={AMBIENT_PALETTE.amber} distance={18} decay={2} />

      {/* Backdrop starfield - dim, slow */}
      <Stars radius={80} depth={50} count={1600} factor={3} saturation={0} fade speed={0.4} />

      {/* The presence at centre - what the OS IS */}
      <ConductorPresence />

      {/* Live forks as orbital bodies */}
      <ForkOrbits />

      {/* Status_board as constellation */}
      <StatusConstellation />

      {/* Chat stream as focal beam upward */}
      <ChatBeam />

      {/* Perception/ambient particles flowing through scene */}
      <ParticleField count={140} />

      {/* Post-processing: tasteful bloom + vignette + faint chromatic */}
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.7} luminanceThreshold={0.18} luminanceSmoothing={0.42} mipmapBlur />
        <Vignette eskil={false} offset={0.18} darkness={0.78} />
        <ChromaticAberration offset={CHROMATIC_OFFSET} radialModulation modulationOffset={0.4} />
      </EffectComposer>

      {/* Hidden but mounted - audio engine wired off the conductor */}
      <AudioBridge enabled={audioEnabled} statusCount={statusRows.length} />
    </>
  )
}

function AudioBridge({ enabled, statusCount }: { enabled: boolean; statusCount: number }) {
  useAmbientAudio(enabled, statusCount)
  return null
}

export default function CortexAmbientPage() {
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [params, setParams] = useSearchParams()
  const showLegend = params.get('legend') !== '0'

  // Ctrl+. toggles audio (and could toggle scene mode in shared shell elsewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '.') {
        setAudioEnabled((v) => !v)
      }
      if (e.key === 'l' && (e.metaKey || e.altKey)) {
        const next = new URLSearchParams(params)
        if (next.get('legend') === '0') next.delete('legend')
        else next.set('legend', '0')
        setParams(next, { replace: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [params, setParams])

  return (
    <div className="ambient-root fixed inset-0 overflow-hidden bg-[#06070a] text-white">
      <Canvas
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.2, 9], fov: 52, near: 0.1, far: 200 }}
      >
        <Suspense fallback={null}>
          <AmbientScene audioEnabled={audioEnabled} />
        </Suspense>
      </Canvas>

      <SystemHUD
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        showLegend={showLegend}
      />

      <ChatInputPanel />
    </div>
  )
}
