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

/**
 * Liveness signal from the backend. Emitted every 5s while a turn is in-flight
 * so the UI can show "still working — N seconds, running tool X" instead of a
 * blank spinner that looks frozen during long tool runs or thinking pauses.
 */
export interface LivenessSignal {
  phase: 'thinking' | 'tool'
  elapsedSec: number
  detail: {
    name: string
    runningSec: number
    outstanding: number
  } | null
  receivedAt: number
}

interface OSSessionStore {
  status: 'idle' | 'streaming' | 'complete' | 'error'
  /** Latest liveness tick from the backend. Null when idle or stale (>20s old). */
  liveness: LivenessSignal | null
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
  setLiveness: (signal: LivenessSignal | null) => void
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

/**
 * True current length of streamed text, accounting for the rAF-batched buffer
 * that hasn't flushed to Zustand state yet. Callers that need to compare an
 * incoming "full text" against what's already been received must use this —
 * checking `store.streamText.length` alone will be up to 1 frame stale and
 * miscount the gap.
 */
export function getEffectiveStreamTextLength(): number {
  return useOSSessionStore.getState().streamText.length + _streamTextBuffer.length
}

/**
 * Force-flush any pending rAF-buffered deltas into the store synchronously.
 * Used when a terminal event (assistant complete, finalize) arrives before
 * the next animation frame — without this, the last ~1 frame of deltas would
 * be lost because the buffer is reset on `addUserMessage` / `finalizeResponse`.
 */
export function flushStreamBuffersSync(): void {
  if (!_streamTextBuffer && _streamChunkBuffer.length === 0 && !_streamThinkingBuffer) return
  const textToAdd = _streamTextBuffer
  const chunksToAdd = _streamChunkBuffer
  const thinkingToAdd = _streamThinkingBuffer
  _streamTextBuffer = ''
  _streamChunkBuffer = []
  _streamThinkingBuffer = ''
  _flushScheduled = false
  useOSSessionStore.setState(state => ({
    ...(textToAdd ? { streamText: state.streamText + textToAdd } : {}),
    ...(chunksToAdd.length > 0 ? { streamChunks: [...state.streamChunks, ...chunksToAdd] } : {}),
    ...(thinkingToAdd ? { streamThinking: state.streamThinking + thinkingToAdd } : {}),
  }))
}

export const useOSSessionStore = create<OSSessionStore>()(persist((set, get) => ({
  status: 'idle',
  liveness: null,
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
  setLiveness: (signal) => set({ liveness: signal }),

  addUserMessage: (content) => {
    set(state => {
      // If there's an in-progress stream, snapshot it as a completed assistant message
      // before adding the user message. This preserves tools/thinking on interrupt.
      const inFlightMessages: OSSessionMessage[] = []
      if (state.streamText || state.streamChunks.length > 0 || state.streamTools.length > 0) {
        // When the user interrupts mid-turn, snapshot what we have. Falling back
        // to "(processing...)" made the truncated assistant message look like it
        // had frozen; describe what was actually captured instead.
        const snapshotContent = state.streamText
          || (state.streamTools.length > 0 ? `(interrupted mid-turn — ${state.streamTools.length} tool call${state.streamTools.length === 1 ? '' : 's'} in progress)` : '')
          || (state.streamThinking ? '(interrupted mid-turn — thinking in progress)' : '(interrupted)')
        inFlightMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: snapshotContent,
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
        liveness: null,
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
    // Idempotent: if we're already complete/idle with nothing in flight, this
    // is a duplicate event (WS complete + 5s poll both resolving, etc.) — no-op.
    const pre = get()
    if (pre.status !== 'streaming' &&
        !_streamTextBuffer && _streamChunkBuffer.length === 0 && !_streamThinkingBuffer &&
        !pre.streamText && pre.streamChunks.length === 0 && pre.streamTools.length === 0 && !pre.streamThinking) {
      return
    }
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
    // Graceful fallback when text never arrived. "(processing...)" looked
    // frozen and alarming — if the OS completed a turn with only tools/thinking
    // and no text, say so directly so the user knows the turn actually ran.
    const finalContent = streamText
      || (streamTools.length > 0 ? `(turn completed with ${streamTools.length} tool call${streamTools.length === 1 ? '' : 's'}, no text response)` : '')
      || (streamThinking ? '(turn completed with thinking only, no text response)' : '')
      || ''
    set(state => ({
      messages: trimMessages([...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: finalContent,
        chunks: streamChunks,
        tools: streamTools.length > 0 ? streamTools : undefined,
        thinking: streamThinking || undefined,
        timestamp: new Date(),
      }]),
      status: 'complete',
      liveness: null,
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
      liveness: null,
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
