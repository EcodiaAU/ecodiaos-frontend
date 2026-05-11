import { useWebSocket } from '@/hooks/useWebSocket'
import { SpatialCanvas } from '@/components/spatial/SpatialCanvas'

export function AppShell() {
  useWebSocket()

  return (
    <div
      className="w-screen overflow-hidden"
      style={{
        height: '100dvh',
        minHeight: '100vh',
        maxWidth: '100vw',
        background: '#06070a',
      }}
    >
      <SpatialCanvas />
    </div>
  )
}
