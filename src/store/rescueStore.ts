import { create } from 'zustand'

export interface RescueMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
  inProgress?: boolean
}

export interface RescueToolCall {
  id: string
  name: string
  input?: unknown
  result?: string
  isError?: boolean
  startedAt: number
  completedAt?: number
}

interface RescueState {
  ready: boolean
  status: 'idle' | 'streaming' | 'error' | 'unknown'
  messages: RescueMessage[]
  streamText: string
  streamThinking: string
  tools: RescueToolCall[]
  lastActivityAt: number | null

  // actions
  addUserMessage: (content: string) => void
  appendStreamText: (delta: string) => void
  appendStreamThinking: (delta: string) => void
  flushStreamToMessage: () => void
  setStatus: (status: RescueState['status']) => void
  setReady: (ready: boolean) => void
  onToolStart: (id: string, name: string) => void
  onToolInput: (id: string, input: unknown) => void
  onToolResult: (id: string, result: string, isError: boolean) => void
  clearTools: () => void
  reset: () => void
}

export const useRescueStore = create<RescueState>((set, get) => ({
  ready: false,
  status: 'unknown',
  messages: [],
  streamText: '',
  streamThinking: '',
  tools: [],
  lastActivityAt: null,

  addUserMessage: (content) => set(state => ({
    messages: [...state.messages, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      ts: Date.now(),
    }],
  })),

  appendStreamText: (delta) => set(state => ({
    streamText: state.streamText + delta,
    lastActivityAt: Date.now(),
  })),

  appendStreamThinking: (delta) => set(state => ({
    streamThinking: state.streamThinking + delta,
    lastActivityAt: Date.now(),
  })),

  flushStreamToMessage: () => {
    const { streamText, streamThinking } = get()
    if (!streamText && !streamThinking) {
      set({ tools: [] })
      return
    }
    set(state => ({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamText,
        ts: Date.now(),
      }],
      streamText: '',
      streamThinking: '',
      tools: [],
    }))
  },

  setStatus: (status) => set({ status, lastActivityAt: Date.now() }),
  setReady: (ready) => set({ ready }),

  onToolStart: (id, name) => set(state => ({
    tools: [...state.tools, { id, name, startedAt: Date.now() }],
  })),

  onToolInput: (id, input) => set(state => ({
    tools: state.tools.map(t => t.id === id ? { ...t, input } : t),
  })),

  onToolResult: (id, result, isError) => set(state => ({
    tools: state.tools.map(t => t.id === id
      ? { ...t, result, isError, completedAt: Date.now() }
      : t),
  })),

  clearTools: () => set({ tools: [] }),

  reset: () => set({
    messages: [],
    streamText: '',
    streamThinking: '',
    tools: [],
    status: 'idle',
  }),
}))
