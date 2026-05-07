import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'
import { NAV_LINKS, getSceneKey, getDirection } from './spatialConfig'
import { useSpatialContext } from './SpatialDepthProvider'
import { useWorkerStore, type WorkerStatus } from '@/store/workerStore'
import { useCortexStore } from '@/store/cortexStore'

// ─── NavGlyph: Living Navigation ─────────────────────────────────────
// Each scene = 36×36 glyph with Lucide icon + SVG halo ring.
// Halo encodes state: idle, attention, active session, error.
// Auto-fades after 4s, but elevated states stay visible.

const glide = { type: 'spring' as const, stiffness: 70, damping: 18, mass: 1.2 }

/** Map scene keys to worker names for state encoding */
const SCENE_WORKERS: Record<string, string[]> = {
  cortex: ['gmail', 'linkedin', 'finance', 'kg_consolidation', 'kg_embedding'],
  settings: ['google_drive', 'vercel', 'meta'],
}

type GlyphState = 'idle' | 'attention' | 'active' | 'error' | 'completed'

function useGlyphState(sceneKey: string): { state: GlyphState; detail: string } {
  const workers = useWorkerStore((s) => s.workers)
  const inlineSessions = useCortexStore((s) => s.inlineSessions)

  return useMemo(() => {
    // Factory/codebase: check for running CC sessions
    if (sceneKey === 'codebase' || sceneKey === 'cortex' || sceneKey === 'settings') {
      const running = Array.from(inlineSessions.values()).filter(
        (s) => s.status === 'running' || s.status === 'initializing',
      )
      if (running.length > 0) {
        return { state: 'active' as const, detail: `${running.length} session${running.length > 1 ? 's' : ''} running` }
      }
    }

    const workerNames = SCENE_WORKERS[sceneKey] ?? []
    if (workerNames.length === 0) return { state: 'idle' as const, detail: '' }

    const statuses: WorkerStatus[] = workerNames
      .map((n) => workers[n])
      .filter(Boolean)

    const hasError = statuses.some((w) => w.status === 'error')
    if (hasError) {
      const errWorker = statuses.find((w) => w.status === 'error')
      return { state: 'error' as const, detail: errWorker?.error ?? 'Error' }
    }

    const hasStale = statuses.some((w) => w.status === 'stale')
    if (hasStale) return { state: 'attention' as const, detail: 'Stale' }

    const allActive = statuses.length > 0 && statuses.every((w) => w.status === 'active')
    if (allActive) return { state: 'idle' as const, detail: 'Healthy' }

    return { state: 'idle' as const, detail: '' }
  }, [sceneKey, workers, inlineSessions])
}

/** SVG halo ring around the glyph icon */
function HaloRing({ state, isActive }: { state: GlyphState; isActive: boolean }) {
  const r = 17 // radius for 36×36 glyph
  const circumference = 2 * Math.PI * r

  // Stroke properties by state
  const strokeColor = (() => {
    if (isActive) return 'rgba(27, 122, 61, 0.40)'
    switch (state) {
      case 'attention': return 'rgba(217, 119, 6, 0.45)'
      case 'active': return 'rgba(46, 204, 113, 0.55)'
      case 'error': return 'rgba(220, 38, 38, 0.50)'
      case 'completed': return 'rgba(46, 204, 113, 0.40)'
      default: return 'rgba(27, 122, 61, 0.06)'
    }
  })()

  const strokeWidth = state === 'idle' && !isActive ? 1 : 1.5

  // Arc segments for attention state (broken ring)
  const dashProps = (() => {
    if (state === 'attention') {
      // 3 arc segments with gaps
      const seg = circumference / 6
      return { strokeDasharray: `${seg} ${seg}` }
    }
    if (state === 'active') {
      // Rotating dash for active sessions
      const seg = circumference * 0.7
      const gap = circumference * 0.3
      return { strokeDasharray: `${seg} ${gap}` }
    }
    return {}
  })()

  return (
    <svg
      className="absolute inset-0"
      width={36}
      height={36}
      viewBox="0 0 36 36"
      style={{ overflow: 'visible' }}
    >
      <motion.circle
        cx={18}
        cy={18}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        {...dashProps}
        animate={
          state === 'active'
            ? { rotate: 360 }
            : state === 'attention'
              ? { opacity: [0.4, 0.8, 0.4] }
              : state === 'error'
                ? { opacity: [0.5, 1, 0.5], scale: [1, 1.05, 1] }
                : {}
        }
        transition={
          state === 'active'
            ? { duration: 4, repeat: Infinity, ease: 'linear' }
            : state === 'attention'
              ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
              : state === 'error'
                ? { duration: 1.5, repeat: 3 }
                : undefined
        }
        style={{ transformOrigin: '18px 18px' }}
      />
    </svg>
  )
}

// ─── Tendrils — catenary curves between active glyph and spatial neighbors ──
// 0.5px, 0.06 opacity. Dissolve on nav, reform to new neighbors.

function NavTendrils({ activeKey, navRef }: { activeKey: string; navRef: React.RefObject<HTMLElement | null> }) {
  const [paths, setPaths] = useState<{ d: string; key: string }[]>([])

  useEffect(() => {
    if (!navRef.current) return

    // Find glyph elements by data attribute
    const glyphs = navRef.current.querySelectorAll<HTMLElement>('[data-scene-key]')
    const glyphMap = new Map<string, DOMRect>()

    glyphs.forEach((el) => {
      const key = el.dataset.sceneKey
      if (key) {
        glyphMap.set(key, el.getBoundingClientRect())
      }
    })

    const activeRect = glyphMap.get(activeKey)
    if (!activeRect) return

    const navRect = navRef.current.getBoundingClientRect()
    const newPaths: { d: string; key: string }[] = []

    // Find spatial neighbors (distance <= 1.5 in scene space)
    for (const [key, rect] of glyphMap) {
      if (key === activeKey) continue
      const dir = getDirection(activeKey, key)
      if (dir.distance > 1.5) continue

      // Compute centers relative to nav container
      const ax = activeRect.left + activeRect.width / 2 - navRect.left
      const ay = activeRect.top + activeRect.height / 2 - navRect.top
      const bx = rect.left + rect.width / 2 - navRect.left
      const by = rect.top + rect.height / 2 - navRect.top

      // Catenary approximation: quadratic bezier with sag
      const midX = (ax + bx) / 2
      const midY = (ay + by) / 2
      const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
      const sag = dist * 0.3 // catenary droop

      // Control point offset perpendicular to the line (sag to the right for vertical nav)
      const cpX = midX + sag * 0.4
      const cpY = midY

      newPaths.push({
        key: `${activeKey}-${key}`,
        d: `M ${ax} ${ay} Q ${cpX} ${cpY} ${bx} ${by}`,
      })
    }

    setPaths(newPaths)
  }, [activeKey, navRef])

  if (paths.length === 0) return null

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: -1 }}>
      <AnimatePresence>
        {paths.map((p) => (
          <motion.path
            key={p.key}
            d={p.d}
            fill="none"
            stroke="rgba(13, 124, 90, 0.06)"
            strokeWidth={0.5}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            exit={{ pathLength: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 40, damping: 20, mass: 1.5 }}
          />
        ))}
      </AnimatePresence>
    </svg>
  )
}

export function FloatingNav() {
  const location = useLocation()
  const activeKey = getSceneKey(location.pathname)
  const [visible, setVisible] = useState(true)
  const [pinned] = useState(true)
  const [hovered, setHovered] = useState(false)
  const { tiltX, tiltY } = useSpatialContext()
  const navRef = useRef<HTMLElement>(null)

  const navX = useTransform(tiltX, (v) => v * -6)
  const navRotateY = useTransform(tiltX, (v) => v * 1.5)
  const navRotateX = useTransform(tiltY, (v) => v * -1.2)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (e.clientX < 100) setVisible(true)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  useEffect(() => {
    if (pinned || hovered) { setVisible(true); return }
    const timer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(timer)
  }, [pinned, hovered, location.pathname])

  useEffect(() => { setVisible(true) }, [location.pathname])

  // Check if any scene has elevated state (should remain partially visible)
  const hasElevated = NAV_LINKS.some((scene) => {
    const key = getSceneKey(scene.path)
    return key !== activeKey && SCENE_WORKERS[key]?.length
  })

  return (
    <>
      {/* ─── Desktop: NavGlyph rail ─── */}
      <motion.nav
        ref={navRef}
        className="fixed left-5 top-1/2 z-30 hidden flex-col items-center gap-0.5 rounded-3xl py-4 px-1.5 md:flex"
        style={{
          y: '-50%',
          x: navX,
          rotateY: navRotateY,
          rotateX: navRotateX,
          transformPerspective: 800,
          backgroundColor: 'rgba(255, 255, 255, 0.52)',
          boxShadow: '0 24px 60px -16px rgba(27, 122, 61, 0.06), 0 8px 20px -8px rgba(217, 119, 6, 0.02)',
          borderTop: '1px solid rgba(255, 255, 255, 0.65)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.60)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.03)',
          borderRight: '1px solid rgba(0, 0, 0, 0.03)',
        }}
        animate={{ opacity: visible || hovered || pinned ? 1 : hasElevated ? 0.3 : 0.06 }}
        transition={{ type: 'spring', stiffness: 60, damping: 20 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Tendrils — catenary curves between active glyph and neighbors */}
        <NavTendrils activeKey={activeKey} navRef={navRef} />

        <motion.span
          className="mb-2 font-display text-[8px] font-medium uppercase tracking-[0.3em] text-on-surface-muted/70"
          animate={{ opacity: visible || hovered ? 0.7 : 0 }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        >
          EOS
        </motion.span>

        {NAV_LINKS.map((scene) => (
          <NavGlyph
            key={scene.path}
            scene={scene}
            activeKey={activeKey}
            visible={visible || hovered}
          />
        ))}
      </motion.nav>

      {/* ─── Mobile: bottom glass bar ───
          paddingBottom uses env(safe-area-inset-bottom) so the bar lifts
          above the iPhone home indicator instead of being covered by it.
      */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around px-2 pt-2 md:hidden"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.52)',
          boxShadow: '0 -12px 40px -10px rgba(27, 122, 61, 0.05), inset 0 1px 0 rgba(255,255,255,0.4)',
          paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {NAV_LINKS.map((scene) => {
          const isActive = getSceneKey(scene.path) === activeKey
          const Icon = scene.icon

          return (
            <NavLink
              key={scene.path}
              to={scene.path}
              className={cn(
                'relative flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2',
                isActive ? 'text-primary' : 'text-on-surface-muted/70',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-mobile-active"
                  className="absolute inset-0 rounded-2xl bg-primary/8"
                  transition={glide}
                />
              )}
              <Icon className="relative h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="relative text-[9px] font-medium uppercase tracking-wider">{scene.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}

/** Individual NavGlyph with halo ring and hover label */
function NavGlyph({
  scene,
  activeKey,
  visible,
}: {
  scene: (typeof NAV_LINKS)[number]
  activeKey: string
  visible: boolean
}) {
  const sceneKey = getSceneKey(scene.path)
  const isActive = sceneKey === activeKey
  const { state, detail } = useGlyphState(sceneKey)
  const Icon = scene.icon

  const hasElevatedState = state !== 'idle'

  // Build hover label: "mail — 3 waiting" style
  const hoverLabel = detail
    ? `${scene.label} — ${detail}`
    : scene.label

  return (
    <NavLink to={scene.path} className="relative group" data-scene-key={sceneKey}>
      {/* Halo ring */}
      <HaloRing state={isActive ? 'idle' : state} isActive={isActive} />

      {/* Active glow background */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            layoutId="nav-active-glow"
            className="absolute -inset-0.5 rounded-2xl bg-primary/8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={glide}
          />
        )}
      </AnimatePresence>

      {/* Icon */}
      <motion.div
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl',
          isActive
            ? 'text-primary'
            : hasElevatedState
              ? 'text-on-surface-muted/90'
              : 'text-on-surface-muted/70 hover:text-on-surface-variant',
        )}
        animate={{
          opacity: !visible && !isActive && !hasElevatedState ? 0.3 : 1,
        }}
        transition={{ type: 'spring', stiffness: 70, damping: 18 }}
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={1.75} />
      </motion.div>

      {/* Hover label — slides out from glyph */}
      <motion.span
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 0 }}
        whileHover={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium text-on-surface-variant opacity-0 group-hover:opacity-100"
        style={{
          background: 'rgba(255,255,255,0.65)',
          boxShadow: '0 8px 20px -6px rgba(27,122,61,0.06), inset 0 1px 0 rgba(255,255,255,0.4)',
          border: '1px solid rgba(255,255,255,0.50)',
        }}
      >
        {hoverLabel}
      </motion.span>
    </NavLink>
  )
}
