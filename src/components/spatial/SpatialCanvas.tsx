import { useRef } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getSceneKey, getDirection, sceneVariants } from './spatialConfig'
import { SpatialViewport } from './SpatialViewport'

/**
 * Spatial scene renderer with directional 3D transitions.
 *
 * Wraps content in SpatialViewport which shifts perspective-origin
 * based on device tilt / mouse position - giving every element with
 * a translateZ real parallax depth separation.
 *
 * Full-bleed paths (/cortex, /meetings) manage their own scroll and
 * layout - rendered without scene-container padding.
 *
 * Merge note: resolved conflict between HEAD (simplified fixed-div) and
 * e9335c68 (full spatial system). Keeping the full version + meetings
 * full-bleed from the meetings fork.
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

  // Full-bleed scenes own their scroll - no scene-container padding.
  const isFullBleed = location.pathname.startsWith('/cortex') ||
    location.pathname.startsWith('/meetings')
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
