import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * OS Session Store — state for the persistent CC OS session.
 * Manages the conversation stream, streaming state, and raw NDJSON chunks.
 *
 * Persistence: messages, sessionId, lastUserMessageAt survive tab close.
 * streamText and streamChunks are NOT persisted — they thrash localStorage
 * on every token delta, killing streaming performance.
 */

export interface OSSessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Raw NDJSON chunks from CC stream-json (for distillation) */
  chunks?: string[]
  /** Tool calls that occurred during this response */
  tools?: LiveToolCall[]
  /** Extended thinking content for this response */
  thinking?: string
  timestamp: Date
}

export interface TokenUsage {
  input: number
  output: number
  total: number
  threshold: number
  needsCompaction: boolean
}

/** A live tool call being tracked during streaming */
export interface LiveToolCall {
  id: string
  name: string
  /** SDK tool_use_id — used to match tool_result events */
  toolUseId?: string
  /** Raw input JSON as it streams in */
  input?: string
  /** Tool result once received */
  result?: string
  startedAt: number
  completedAt?: number
}

interface OSSessionStore {
  status: 'idle' | 'streaming' | 'complete' | 'error'
  messages: OSSessionMessage[]
  /** Chunks accumulating for the current assistant response */
  streamChunks: string[]
  /** Extracted text content from current stream (for live display) */
  streamText: string
  /** Live tool calls in progress during current stream */
  streamTools: LiveToolCall[]
  /** Accumulated thinking text during current stream (real-time) */
  streamThinking: string
  sessionId: string | null
  /** Token usage tracking for auto-compaction */
  tokenUsage: TokenUsage | null
  /** Whether compaction is in progress */
  compacting: boolean
  /** ISO timestamp of last user message — used for recovery after tab close */
  lastUserMessageAt: string | null
  /** Whether recovery has been attempted this session */
  recoveryAttempted: boolean
  /** Messages sent by user while OS was streaming (interrupt queue) */
  interruptQueue: string[]
  /** Handover state — null when idle */
  handover: {
    phase: 'preparing' | 'warming' | 'complete' | 'failed' | 'cancelled'
    briefPreview?: string
    newSessionId?: string
    error?: string
  } | null

  // Actions
  setStatus: (status: OSSessionStore['status']) => void
  addUserMessage: (content: string) => void
  appendStreamChunk: (chunk: string) => void
  appendStreamText: (text: string) => void
  replaceStreamText: (text: string) => void
  addStreamTool: (tool: Omit<LiveToolCall, 'id' | 'startedAt'>) => void
  /** Match by toolUseId first, fall back to name */
  updateStreamTool: (idOrName: string, patch: Partial<LiveToolCall>) => void
  appendStreamThinking: (text: string) => void
  finalizeResponse: () => void
  setSessionId: (id: string | null) => void
  setTokenUsage: (usage: TokenUsage | null) => void
  setCompacting: (v: boolean) => void
  clearMessages: () => void
  /** Inject a recovered assistant message (from backend recovery) */
  injectRecoveredResponse: (text: string, chunks?: string[]) => void
  setRecoveryAttempted: () => void
  /** Queue an interrupt message (sent while OS is streaming) */
  queueInterrupt: (msg: string) => void
  clearInterruptQueue: () => void
  /** Update handover state (from WebSocket events) */
  setHandover: (state: OSSessionStore['handover']) => void
}

/** Max messages to keep in memory/localStorage. Older messages are trimmed on add. */
const MAX_MESSAGES = 100

function trimMessages(msgs: OSSessionMessage[]): OSSessionMessage[] {
  return msgs.length > MAX_MESSAGES ? msgs.slice(-MAX_MESSAGES) : msgs
}

/**
 * Batched stream text accumulator.
 * Instead of calling set() on every single text_delta (which triggers a React
 * re-render + localStorage write per token), we accumulate deltas in a plain
 * string buffer and flush to Zustand state at ~30fps using requestAnimationFrame.
 * This reduces re-renders from ~50/s (one per token) to ~30/s (one per frame).
 */
let _streamTextBuffer = ''
let _streamChunkBuffer: string[] = []
let _streamThinkingBuffer = ''
let _flushScheduled = false

function scheduleFlush() {
  if (_flushScheduled) return
  _flushScheduled = true
  requestAnimationFrame(() => {
    _flushScheduled = false
    const textToAdd = _streamTextBuffer
    const chunksToAdd = _streamChunkBuffer
    const thinkingToAdd = _streamThinkingBuffer
    _streamTextBuffer = ''
    _streamChunkBuffer = []
    _streamThinkingBuffer = ''

    if (!textToAdd && chunksToAdd.length === 0 && !thinkingToAdd) return

    useOSSessionStore.setState(state => ({
      ...(textToAdd ? { streamText: state.streamText + textToAdd } : {}),
      ...(chunksToAdd.length > 0 ? { streamChunks: [...state.streamChunks, ...chunksToAdd] } : {}),
      ...(thinkingToAdd ? { streamThinking: state.streamThinking + thinkingToAdd } : {}),
    }))
  })
}

export const useOSSessionStore = create<OSSessionStore>()(persist((set, get) => ({
  status: 'idle',
  messages: [],
  streamChunks: [],
  streamText: '',
  streamTools: [],
  streamThinking: '',
  sessionId: null,
  tokenUsage: null,
  compacting: false,
  lastUserMessageAt: null,
  recoveryAttempted: false,
  interruptQueue: [],
  handover: null,

  setStatus: (status) => set({ status }),

  addUserMessage: (content) => {
    set(state => {
      // If there's an in-progress stream, snapshot it as a completed assistant message
      // before adding the user message. This preserves tools/thinking on interrupt.
      const inFlightMessages: OSSessionMessage[] = []
      if (state.streamText || state.streamChunks.length > 0 || state.streamTools.length > 0) {
        inFlightMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: state.streamText || '(processing...)',
          chunks: state.streamChunks,
          tools: state.streamTools.length > 0 ? state.streamTools : undefined,
          thinking: state.streamThinking || undefined,
          timestamp: new Date(),
        })
      }
      return {
        messages: trimMessages([
          ...state.messages,
          ...inFlightMessages,
          {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content,
            timestamp: new Date(),
          },
        ]),
        status: 'streaming' as const,
        streamChunks: [],
        streamText: '',
        streamTools: [],
        streamThinking: '',
        lastUserMessageAt: new Date().toISOString(),
        recoveryAttempted: false,
      }
    })
  },

  appendStreamChunk: (chunk) => {
    _streamChunkBuffer.push(chunk)
    scheduleFlush()
  },

  appendStreamText: (text) => {
    _streamTextBuffer += text
    scheduleFlush()
  },

  replaceStreamText: (text) => {
    set({ streamText: text })
  },

  addStreamTool: (tool) => {
    set(state => ({
      streamTools: [...state.streamTools, {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        ...tool,
      }],
    }))
  },

  updateStreamTool: (idOrName, patch) => {
    set(state => ({
      streamTools: state.streamTools.map(t =>
        (t.toolUseId === idOrName || t.name === idOrName) ? { ...t, ...patch } : t
      ),
    }))
  },

  appendStreamThinking: (text) => {
    _streamThinkingBuffer += text
    scheduleFlush()
  },

  finalizeResponse: () => {
    // Flush any buffered deltas immediately before finalizing
    if (_streamTextBuffer || _streamChunkBuffer.length > 0 || _streamThinkingBuffer) {
      const s = get()
      set({
        streamText: s.streamText + _streamTextBuffer,
        streamChunks: _streamChunkBuffer.length > 0 ? [...s.streamChunks, ..._streamChunkBuffer] : s.streamChunks,
        streamThinking: s.streamThinking + _streamThinkingBuffer,
      })
      _streamTextBuffer = ''
      _streamChunkBuffer = []
      _streamThinkingBuffer = ''
      _flushScheduled = false
    }

    const { streamChunks, streamText, streamTools, streamThinking } = get()
    // Only add a message if we have content
    if (streamChunks.length === 0 && !streamText && streamTools.length === 0 && !streamThinking) {
      set({ status: 'complete', streamChunks: [], streamText: '', streamTools: [], streamThinking: '', lastUserMessageAt: null })
      return
    }
    set(state => ({
      messages: trimMessages([...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: streamText || '(processing...)',
        chunks: streamChunks,
        tools: streamTools.length > 0 ? streamTools : undefined,
        thinking: streamThinking || undefined,
        timestamp: new Date(),
      }]),
      status: 'complete',
      streamChunks: [],
      streamText: '',
      streamTools: [],
      streamThinking: '',
      lastUserMessageAt: null,
    }))
  },

  setSessionId: (id) => set({ sessionId: id }),
  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  setCompacting: (v) => set({ compacting: v }),
  clearMessages: () => set({
    messages: [], streamChunks: [], streamText: '', streamTools: [], streamThinking: '', status: 'idle',
    tokenUsage: null, lastUserMessageAt: null, recoveryAttempted: false, interruptQueue: [],
  }),

  /** Inject a response recovered from the backend after tab close */
  injectRecoveredResponse: (text, chunks) => {
    if (!text && (!chunks || chunks.length === 0)) return
    set(state => ({
      messages: trimMessages([...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: text || '(recovered response)',
        chunks,
        timestamp: new Date(),
      }]),
      status: 'complete',
      streamChunks: [],
      streamText: '',
      streamTools: [],
      streamThinking: '',
      lastUserMessageAt: null,
    }))
  },

  setRecoveryAttempted: () => set({ recoveryAttempted: true }),

  queueInterrupt: (msg) => {
    set(state => ({ interruptQueue: [...state.interruptQueue, msg] }))
  },

  clearInterruptQueue: () => set({ interruptQueue: [] }),

  setHandover: (handoverState) => set({ handover: handoverState }),
}),
{
  name: 'os-session-chat',
  partialize: (state) => ({
    messages: state.messages,
    sessionId: state.sessionId,
    lastUserMessageAt: state.lastUserMessageAt,
  }),
},
))
