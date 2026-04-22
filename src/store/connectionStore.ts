import { create } from 'zustand'

/**
 * Connection state store — single source of truth for the WebSocket
 * connection's live state.
 *
 * Why a store instead of CustomEvents: listeners that mount AFTER the WS has
 * already opened miss the `connected` event entirely and sit on their initial
 * default ('connecting' forever). A store survives mount timing — a component
 * subscribes and reads the current value whenever it mounts, regardless of
 * whether the state change has happened yet or already happened.
 *
 * Driven by `useWebSocket`. Read by `ConnectionStateIndicator` and anyone
 * else that wants to reflect the link state.
 */
export type ConnectionState =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'catching_up'
  | 'disconnected'
  | 'backend_alive'

interface ConnectionStore {
  state: ConnectionState
  setState: (s: ConnectionState) => void
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  // Default to 'connecting' — when the app first mounts, the WS handshake is
  // genuinely in progress. The store flips to 'connected' once onopen fires.
  state: 'connecting',
  setState: (state) => set({ state }),
}))
