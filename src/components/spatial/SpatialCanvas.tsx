import { useOutlet } from 'react-router-dom'

export function SpatialCanvas() {
  const outlet = useOutlet()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      {outlet}
    </div>
  )
}
