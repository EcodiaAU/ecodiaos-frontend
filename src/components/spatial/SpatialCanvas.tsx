import { useRef } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getSceneKey, getDirection, sceneVariants } from './spatialConfig'
import { SpatialViewport } from './SpatialViewport'

/**
 * Spatial scene renderer with directional 3D transitions.
 *
 * Now wraps content in SpatialViewport which shifts perspective-origin
 * based on device tilt / mouse position - giving every element with
 * a translateZ real parallax depth separation.
 *
 * The critical trick: Framer Motion's `custom` prop is re-evaluated at
 * exit time (not mount time). So we store the current direction vector
 * in a ref and pass the ref's getter as `custom`. When scene 2 exits
 * (even long after it mounted), it reads the *current* direction -
 * which is the fresh 2→1 vector, not the stale 1→2 from mount time.
 */
export function SpatialCanvas() {
  const location = useLocation()
  const outlet = useOutlet()

  const sceneKey = getSceneKey(location.pathname)
  const prevKeyRef = useRef(sceneKey)
  const directionRef = useRef(getDirection(sceneKey, sceneKey))

  if (sceneKey !== prevKeyRef.current) {
    directionRef.current = getDirection(prevKeyRef.current, sceneKey)
    prevKeyRef.current = sceneKey
  }

  const direction = directionRef.current

  // The cortex scene is the chat surface — full-bleed, no scene-container
  // padding, no scene-container scroll. Inner CCStream owns the only scroll.
  const isFullBleed = location.pathname.startsWith('/cortex')
  const sceneClass = isFullBleed ? 'scene-container scene-full-bleed' : 'scene-container'

  return (
    <SpatialViewport className="z-20">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={sceneKey}
          custom={direction}
          variants={sceneVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className={sceneClass}
          style={{ willChange: 'transform, opacity' }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </SpatialViewport>
  )
}
