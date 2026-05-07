import { useWebSocket } from '@/hooks/useWebSocket'
import { MetabolicProvider } from '@/components/spatial/MetabolicProvider'
import { SpatialDepthProvider } from '@/components/spatial/SpatialDepthProvider'
import { AuroraBackground } from '@/components/spatial/AuroraBackground'
import { SpatialEdgeLight } from '@/components/spatial/SpatialEdgeLight'
import { AmbientParticles } from '@/components/spatial/AmbientParticles'
import { SpatialCanvas } from '@/components/spatial/SpatialCanvas'
import { GlobalConstellation } from '@/components/spatial/GlobalConstellation'
import { HomecomingOverlay } from '@/components/spatial/HomecomingOverlay'

export function AppShell() {
  useWebSocket()

  return (
    <MetabolicProvider>
      <SpatialDepthProvider>
        {/*
          Mobile-hardened root container. `100dvh` follows the iOS Safari /
          Capacitor WebView viewport as the URL bar / home-indicator inset
          changes (h-screen alone snaps awkwardly). `max-w-screen` clamps
          horizontal bleed alongside the html/body overflow-x:hidden in
          index.css. Children that need to clear the iPhone notch / home
          indicator opt in via env(safe-area-inset-*) where they live.
        */}
        <div
          className="w-screen overflow-hidden bg-surface"
          style={{
            height: '100dvh',
            minHeight: '100vh',
            maxWidth: '100vw',
          }}
        >
          <AuroraBackground />
          <GlobalConstellation />
          <SpatialEdgeLight />
          <AmbientParticles />
          <SpatialCanvas />
          <HomecomingOverlay />
        </div>
      </SpatialDepthProvider>
    </MetabolicProvider>
  )
}
