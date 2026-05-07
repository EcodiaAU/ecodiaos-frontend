/**
 * CommandDeck — Holographic 3D command surface.
 *
 * CSS 3D perspective + canvas particles + parallax.
 * Full DOM — native scroll, text selection, input focus all work.
 * The chat IS the interface. Forks are peripheral depth layers.
 *
 * Pure black void. Panels float. The system breathes.
 */
import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Particle field — canvas behind everything ──────────────────────

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: Array<{
      x: number; y: number; z: number
      vx: number; vy: number
      size: number; opacity: number
    }> = []

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }

    function init() {
      resize()
      particles = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        z: Math.random(),
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1 - 0.05,
        size: Math.random() * 1.2 + 0.3,
        opacity: Math.random() * 0.3 + 0.05,
      }))
    }

    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = canvas!.width
        if (p.x > canvas!.width) p.x = 0
        if (p.y < 0) p.y = canvas!.height
        if (p.y > canvas!.height) p.y = 0

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size * (0.5 + p.z * 0.5), 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(255,255,255,${p.opacity * p.z})`
        ctx!.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}

// ─── HUD frame — edge markers that make it feel like a command display ─

function HUDFrame() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 2 }}>
      {/* Corner brackets */}
      <div className="absolute top-4 left-4 w-8 h-8">
        <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute top-0 left-0 w-[1px] h-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>
      <div className="absolute top-4 right-4 w-8 h-8">
        <div className="absolute top-0 right-0 w-full h-[1px]" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute top-0 right-0 w-[1px] h-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>
      <div className="absolute bottom-4 left-4 w-8 h-8">
        <div className="absolute bottom-0 left-0 w-full h-[1px]" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute bottom-0 left-0 w-[1px] h-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>
      <div className="absolute bottom-4 right-4 w-8 h-8">
        <div className="absolute bottom-0 right-0 w-full h-[1px]" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="absolute bottom-0 right-0 w-[1px] h-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>

      {/* Center crosshair — barely visible */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-6 h-[1px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="w-[1px] h-6 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    </div>
  )
}

// ─── Parallax scene wrapper ─────────────────────────────────────────

interface CommandDeckProps {
  children: ReactNode
  forkPanels?: ReactNode
}

export default function CommandDeck({ children, forkPanels }: CommandDeckProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handleMouse = useCallback((e: MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2
    const y = (e.clientY / window.innerHeight - 0.5) * 2
    setTilt({ x, y })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouse, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouse)
  }, [handleMouse])

  const sceneStyle = {
    transform: `perspective(1400px) rotateX(${tilt.y * -0.8}deg) rotateY(${tilt.x * 1.2}deg)`,
    transformStyle: 'preserve-3d' as const,
    transition: 'transform 0.15s ease-out',
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#000' }}>
      <ParticleField />
      <HUDFrame />

      {/* 3D scene */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
        <div ref={sceneRef} className="w-full h-full relative" style={sceneStyle}>
          {/* Main panel — center, depth 0 */}
          <div
            className="absolute inset-0 flex flex-col"
            style={{ transform: 'translateZ(20px)' }}
          >
            {children}
          </div>

          {/* Fork panels — behind, to the sides */}
          <AnimatePresence>
            {forkPanels && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-16 right-4 bottom-16 w-72 pointer-events-auto"
                style={{
                  transform: 'translateZ(-60px) translateX(20px)',
                  transformStyle: 'preserve-3d',
                }}
              >
                {forkPanels}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
