import { lazy, Suspense, useMemo } from 'react'
import CCStream from './CCStream'
import CommandDeck from './CommandDeck'
import { useForksStore, selectActiveForks } from '@/store/forksStore'

const ForksPanel = lazy(() => import('./ForksPanel'))

export default function CortexPage() {
  const forks = useForksStore(s => s.forks)
  const activeForks = useMemo(() => selectActiveForks(forks), [forks])
  const hasForks = activeForks.length > 0

  return (
    <CommandDeck
      forkPanels={hasForks ? (
        <Suspense fallback={null}>
          <ForksPanel forks={activeForks} />
        </Suspense>
      ) : undefined}
    >
      <CCStream />
    </CommandDeck>
  )
}
