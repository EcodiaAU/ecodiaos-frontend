import { create } from 'zustand'

/**
 * Forks Store — live registry of parallel OS sub-sessions.
 *
 * Mirrors backend src/services/forkService.js. The backend is the source of
 * truth; this store is the frontend-side projection driven by:
 *   - Initial GET /api/os-session/forks on mount (or first WS-less render).
 *   - Live `os-session:fork` WS events with kind in
 *     {spawned, status, position, done, aborted, error}.
 *
 * Why a dedicated store rather than slotting into osSessionStore:
 * Forks are a sibling concept to "the OS chat". Mixing them into osSessionStore
 * would complicate every existing message flow. Keeping them separate means
 * the forks panel is independently testable and the chat stream stays simple.
 */

export type ForkStatus =
  | 'spawning'
  | 'running'
  | 'reporting'
  | 'done'
  | 'aborted'
  | 'error'

export interface ForkSnapshot {
  fork_id: string
  parent_id: string
  brief: string
  context_mode: 'recent' | 'brief'
  status: ForkStatus
  position: string | null
  result: string | null
  next_step: string | null
  abort_reason: string | null
  provider: string | null
  tokens_input: number
  tokens_output: number
  tool_calls: number
  current_tool: string | null
  last_heartbeat: string | null
  started_at: string | null
  ended_at: string | null
}

interface ForksStore {
  forks: Record<string, ForkSnapshot>
  lastUpdated: number | null

  upsert: (snap: ForkSnapshot) => void
  remove: (forkId: string) => void
  setAll: (live: ForkSnapshot[]) => void
  clear: () => void
}

export const useForksStore = create<ForksStore>((set) => ({
  forks: {},
  lastUpdated: null,

  upsert: (snap) => set((state) => ({
    forks: { ...state.forks, [snap.fork_id]: snap },
    lastUpdated: Date.now(),
  })),

  remove: (forkId) => set((state) => {
    if (!state.forks[forkId]) return state
    const next = { ...state.forks }
    delete next[forkId]
    return { forks: next, lastUpdated: Date.now() }
  }),

  setAll: (live) => set(() => {
    const next: Record<string, ForkSnapshot> = {}
    for (const f of live) next[f.fork_id] = f
    return { forks: next, lastUpdated: Date.now() }
  }),

  clear: () => set({ forks: {}, lastUpdated: Date.now() }),
}))

/** Active = spawning | running | reporting (still consuming a stream slot). */
export function selectActiveForks(forks: Record<string, ForkSnapshot>): ForkSnapshot[] {
  return Object.values(forks).filter(
    (f) => f.status === 'spawning' || f.status === 'running' || f.status === 'reporting'
  )
}

/** Recently-finished = done|aborted|error within last 5 minutes. */
export function selectRecentForks(forks: Record<string, ForkSnapshot>): ForkSnapshot[] {
  const cutoff = Date.now() - 5 * 60 * 1000
  return Object.values(forks)
    .filter((f) => {
      if (f.status === 'spawning' || f.status === 'running' || f.status === 'reporting') return false
      if (!f.ended_at) return false
      return new Date(f.ended_at).getTime() >= cutoff
    })
    .sort((a, b) => new Date(b.ended_at!).getTime() - new Date(a.ended_at!).getTime())
}
