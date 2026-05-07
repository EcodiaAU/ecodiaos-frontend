import React, { useMemo } from 'react'
import CCStream from './CCStream'
import CommandDeck from './CommandDeck'
import ForksPanel from './ForksPanel'
import { useForksStore, selectActiveForks } from '@/store/forksStore'

export default function CortexPage() {
  const forks = useForksStore(s => s.forks)
  const activeForks = useMemo(() => selectActiveForks(forks), [forks])

  const panels = useMemo(() => {
    const p: Array<{
      id: string
      label: string
      position: [number, number, number]
      rotation?: [number, number, number]
      width: number
      content: React.ReactNode
    }> = [
      {
        id: 'main',
        label: 'cortex',
        position: [0, 0, 0],
        width: 700,
        content: <CCStream />,
      },
    ]

    if (activeForks.length > 0) {
      p.push({
        id: 'forks',
        label: `forks (${activeForks.length})`,
        position: [6, 0, -2],
        rotation: [0, -20, 0],
        width: 420,
        content: <ForksPanel forks={activeForks} />,
      })
    }

    return p
  }, [activeForks])

  return <CommandDeck panels={panels} initialPanel="main" />
}
