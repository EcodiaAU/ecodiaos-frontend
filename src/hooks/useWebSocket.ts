import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useCortexStore } from '@/store/cortexStore'
import { useWorkerStore } from '@/store/workerStore'
import { useOSSessionStore, getEffectiveStreamTextLength, flushStreamBuffersSync } from '@/store/osSessionStore'
import { useConnectionStore, type ConnectionState } from '@/store/connectionStore'
import type { CCSession } from '@/types/claudeCode'
import api from '@/api/client'
import { recoverEventsSince } from '@/api/osSession'

/**
 * Connection state — drives the ambient offline indicator and the
 * ConnectionStateIndicator chrome pill.
 *
 * States:
 *   connected   — WS open, events flowing normally.
 *   connecting  — first handshake in progress.
 *   reconnecting — WS dropped, reconnect scheduled / in flight.
 *   catching_up — WS reconnected, replay call in flight.
 *   disconnected — WS dropped and HTTP status poll also failed (hard offline).
 *   backend_alive — WS down, HTTP status poll confirms backend is working.
 */
function setConnectionState(state: ConnectionState) {
  // Store is the source of truth for components that subscribe directly
  // (e.g. ConnectionStateIndicator). The CustomEvent stays for any callers
  // outside React that want a pub/sub style signal.
  useConnectionStore.getState().setState(state)
  window.dispatchEvent(new CustomEvent('ecodia:connection-state', { detail: state }))
}

/**
 * Pinnacle P1 — single point that applies one os-session:output chunk to the
 * store. Extracted so both live WS events and replayed events (from the
 * `/os-session/recover?since_seq=N` endpoint) go through the same path.
 * Pure-ish: the only side effect is the Zustand store update.
 */
function applyOSOutputChunk(chunk: unknown) {
  // Wrap the whole dispatch — one bad event (malformed JSON, unexpected
  // shape from a new SDK build, etc.) must not kill the stream handler.
  try {
    _applyOSOutputChunkUnsafe(chunk)
  } catch (err) {
    if (typeof window !== 'undefined' && window.console) {
      window.console.warn('[useWebSocket] applyOSOutputChunk threw, dropping event', err, chunk)
    }
  }
}

function _applyOSOutputChunkUnsafe(chunk: unknown) {
  if (!chunk || typeof chunk !== 'object') return
  const c = chunk as Record<string, unknown>
  const osStore = useOSSessionStore.getState()

  // Auto-promote to streaming on any inbound content. If we missed
  // the initial 'status: streaming' event (brief WS blip between
  // sendMessage and first delta), the UI would sit in idle/complete
  // while text silently accumulated in the store — user sees nothing.
  if (osStore.status !== 'streaming') {
    osStore.setStatus('streaming')
  }

  const type = c.type as string
  const content = c.content as string | undefined

  // ─── Pinnacle P1: assistant_message_starting ─────────────────────────
  if (type === 'assistant_message_starting') {
    osStore.setAssistantTurnStarting(true)
    return
  }

  // thinking_delta: real-time streaming of extended thinking
  if (type === 'thinking_delta' && content) {
    // First thinking also clears the pre-token pulse.
    if (osStore.assistantTurnStarting) osStore.setAssistantTurnStarting(false)
    osStore.appendStreamThinking(content)
    return
  }
  // thinking: complete thinking block
  if (type === 'thinking' && content) {
    if (osStore.assistantTurnStarting) osStore.setAssistantTurnStarting(false)
    osStore.appendStreamThinking(content)
    return
  }

  // text_delta: real-time streaming from Agent SDK partial messages.
  // Goes only into streamText (the rendered buffer). streamChunks is for raw
  // NDJSON archival — appending deltas there too made saved content double.
  if (type === 'text_delta' && content) {
    if (osStore.assistantTurnStarting) osStore.setAssistantTurnStarting(false)
    osStore.appendStreamText(content)
    return
  }

  // assistant_text: complete text from an assistant turn (no-stream fallback).
  // Defensive: only apply when status is 'streaming'. If the turn has already
  // finalised (status 'complete' or 'idle'), a late-arriving assistant_text
  // would otherwise populate streamText and ghost into the NEXT turn's buffer.
  if (type === 'assistant_text' && content) {
    if (osStore.status !== 'streaming') return
    flushStreamBuffersSync()
    const effectiveLen = getEffectiveStreamTextLength()
    if (content.length > effectiveLen) {
      osStore.replaceStreamText(content)
    }
    return
  }

  // ─── Pinnacle P1: tool_use lifecycle ─────────────────────────────────
  // tool_use_starting: name + id known, input not yet finalised.
  if (type === 'tool_use_starting') {
    const id = c.id as string | undefined
    const name = c.name as string | undefined
    if (name) {
      if (osStore.assistantTurnStarting) osStore.setAssistantTurnStarting(false)
      osStore.addStreamTool({ name, toolUseId: id, status: 'preparing' })
    }
    return
  }
  // tool_use_input_complete: input json assembled, tool call dispatching.
  if (type === 'tool_use_input_complete') {
    const id = c.id as string | undefined
    const name = c.name as string | undefined
    const input = c.input
    const inputStr = typeof input === 'string'
      ? input
      : input != null ? JSON.stringify(input, null, 2) : undefined
    const matchKey = id || name
    if (matchKey) {
      osStore.updateStreamTool(matchKey, { input: inputStr, status: 'running' })
    }
    return
  }
  // tool_use_result: tool succeeded with output.
  if (type === 'tool_use_result') {
    const matchKey = (c.tool_use_id as string | undefined) || (c.name as string | undefined)
    if (matchKey) {
      const resultStr = content
        ? (typeof content === 'string' ? content : JSON.stringify(content, null, 2))
        : undefined
      osStore.updateStreamTool(matchKey, {
        result: resultStr,
        completedAt: Date.now(),
        status: 'done',
      })
    }
    return
  }
  // tool_use_error: tool failed — surface error content + mark errored.
  if (type === 'tool_use_error') {
    const matchKey = (c.tool_use_id as string | undefined) || (c.name as string | undefined)
    if (matchKey) {
      const resultStr = content
        ? (typeof content === 'string' ? content : JSON.stringify(content, null, 2))
        : undefined
      osStore.updateStreamTool(matchKey, {
        result: resultStr,
        completedAt: Date.now(),
        status: 'error',
        isError: true,
      })
    }
    return
  }

  // Legacy tool_use (one-shot — whole tool in a single event). Still emitted
  // by some older code paths. Treated as both start+complete.
  if (type === 'tool_use' && Array.isArray(c.tools)) {
    for (const t of c.tools as Array<{ name: string; id?: string; input?: unknown }>) {
      osStore.addStreamTool({
        name: t.name,
        toolUseId: t.id,
        input: t.input ? JSON.stringify(t.input, null, 2) : undefined,
      })
    }
    return
  }
  // Legacy tool_result — match by tool_use_id or name.
  if (type === 'tool_result') {
    const matchKey = (c.tool_use_id as string | undefined) || (c.name as string | undefined)
    if (matchKey) {
      const resultStr = content
        ? (typeof content === 'string' ? content : JSON.stringify(content, null, 2))
        : undefined
      osStore.updateStreamTool(matchKey, {
        result: resultStr,
        completedAt: Date.now(),
        status: 'done',
      })
    }
    return
  }

  // ─── Pinnacle P1: turn_complete ──────────────────────────────────────
  // Full telemetry for the turn — gets attached to the next finalised message.
  if (type === 'turn_complete') {
    osStore.setAssistantTurnStarting(false)
    osStore.setPendingTurnTelemetry({
      turnId: crypto.randomUUID(),
      model: (c.model as string) || 'unknown',
      inputTokens: Number(c.input_tokens ?? 0),
      outputTokens: Number(c.output_tokens ?? 0),
      cacheReadTokens: Number(c.cache_read_tokens ?? 0),
      cacheWriteTokens: Number(c.cache_write_tokens ?? 0),
      durationMs: Number(c.duration_ms ?? 0),
      stopReason: (c.stop_reason as string) ?? null,
      at: Date.now(),
    })
    return
  }

  // ─── Pinnacle P1: compact_boundary phase events ──────────────────────
  if (type === 'compact_boundary') {
    const phase = c.phase as string
    if (phase === 'start') {
      osStore.setCompactionPhase('active')
      osStore.pushInlineBanner({ kind: 'compaction', detail: 'start' })
    } else if (phase === 'end') {
      osStore.setCompactionPhase('idle')
      osStore.pushInlineBanner({ kind: 'compaction', detail: 'end' })
    }
    return
  }

  // ─── Pinnacle P1: session_event ──────────────────────────────────────
  if (type === 'session_event') {
    const subtype = (c.subtype as string) || 'unknown'
    osStore.pushInlineBanner({ kind: 'session_event', detail: subtype })
    return
  }

  // Legacy stream format (backward compat with CLI-spawned sessions).
  if (type === 'stream' && content) {
    osStore.appendStreamChunk(content)
    try {
      const parsed = JSON.parse(content)
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const block of parsed.message.content) {
          if (block.type === 'text' && block.text) {
            osStore.appendStreamText(block.text)
          }
          if (block.type === 'tool_use') {
            osStore.addStreamTool({ name: block.name })
          }
        }
      }
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        osStore.appendStreamText(parsed.delta.text)
      }
    } catch { /* not JSON */ }
    return
  }
}

/**
 * Replay events returned from /os-session/recover. Dedupes by seq against
 * the store's lastSeenSeq, updates lastSeenSeq to the max observed.
 */
function replayRecoveredEvents(events: Array<{ seq: number; type: string; data?: unknown; [k: string]: unknown }>) {
  if (!events || events.length === 0) return
  const osStore = useOSSessionStore.getState()
  let maxSeq = osStore.lastSeenSeq ?? -Infinity

  for (const ev of events) {
    if (typeof ev.seq !== 'number') continue
    // Skip events we already applied.
    if (osStore.lastSeenSeq != null && ev.seq <= osStore.lastSeenSeq) continue
    if (ev.seq > maxSeq) maxSeq = ev.seq

    // Reuse the same per-type dispatch the live stream uses. The backend
    // envelope is { seq, ts, type, sessionId?, data? } — we only apply
    // os-session:output chunks via replay here, matching the live handler.
    if (ev.type === 'os-session:output') {
      applyOSOutputChunk(ev.data)
    } else if (ev.type === 'os-session:status') {
      // Status is idempotent; just apply to the store.
      const m = ev as { status?: string; sessionId?: string }
      if (m.status) useOSSessionStore.getState().setStatus(m.status as 'idle' | 'streaming' | 'complete' | 'error')
    } else if (ev.type === 'os-session:complete') {
      useOSSessionStore.getState().finalizeResponse()
    }
    // Other types (tokens, energy, handover) are dropped on replay — they're
    // either visual-only or will re-fetch fresh via their own queries.
  }

  if (Number.isFinite(maxSeq)) {
    useOSSessionStore.getState().setLastSeenSeq(maxSeq as number)
  }
}

// ─── Seq-epoch + debounced recovery (module-level state) ─────────────────
// Tracks the current server epoch so we can detect restarts without false
// gap-fill attempts. Debouncer coalesces bursts of gap detections into a
// single recovery request so 10 missing events don't produce 10 HTTP calls.
let _lastSeenEpoch: string | null = null
let _recoverScheduled: ReturnType<typeof setTimeout> | null = null
let _recoverInFlight = false
let _recoverPendingSince: number | null = null
let _recoverFailStreak = 0

// Exponential backoff on repeated recover failures so a hung /recover
// endpoint doesn't hammer the backend on a tight loop.
const _RECOVER_BACKOFF_MS = [50, 500, 1500, 5000, 15000]

function _applyRecoverEpoch(epoch: string | null | undefined) {
  if (!epoch) return
  // Epoch drift means the server ring buffer is a different session / process.
  // Any lastSeenSeq we carry is from the old epoch — trying to replay against
  // it will filter all new events out. Reset and treat the next live event as
  // authoritative.
  if (_lastSeenEpoch && _lastSeenEpoch !== epoch) {
    useOSSessionStore.getState().setLastSeenSeq(null)
  }
  _lastSeenEpoch = epoch
}

function _scheduleRecover(sinceSeq: number) {
  if (_recoverPendingSince == null || sinceSeq < _recoverPendingSince) {
    _recoverPendingSince = sinceSeq
  }
  if (_recoverScheduled || _recoverInFlight) return
  const delay = _RECOVER_BACKOFF_MS[Math.min(_recoverFailStreak, _RECOVER_BACKOFF_MS.length - 1)]
  _recoverScheduled = setTimeout(() => {
    _recoverScheduled = null
    const since = _recoverPendingSince
    _recoverPendingSince = null
    if (since == null) return
    _recoverInFlight = true
    recoverEventsSince(since).then(r => {
      _recoverFailStreak = 0
      const anyR = r as unknown as { epoch?: string }
      _applyRecoverEpoch(anyR.epoch)
      replayRecoveredEvents(r.events)
    }).catch((err) => {
      _recoverFailStreak++
      if (typeof window !== 'undefined' && window.console) {
        window.console.warn('[useWebSocket] recover failed, will retry with backoff', _recoverFailStreak, err)
      }
    }).finally(() => {
      _recoverInFlight = false
      // If another gap was detected while we were in flight, fire again
      // (through the same backoff schedule).
      if (_recoverPendingSince != null) {
        const next = _recoverPendingSince
        _recoverPendingSince = null
        _scheduleRecover(next)
      }
    })
  }, delay)
}

export { applyOSOutputChunk, replayRecoveredEvents }

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const token = useAuthStore((s) => s.token)
  const addNotification = useNotificationStore((s) => s.addNotification)
  const updateWorker = useWorkerStore((s) => s.updateWorker)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token) return

    let attempt = 0
    let mounted = true
    let hasConnectedBefore = false
    let reconnectScheduled = false  // dedupe: onerror+onclose both fire on a failed socket

    async function connect() {
      if (!mounted) return

      // If we already have a live socket from a previous connect() call, close it
      // before opening another. Without this, reconnect storms can spawn multiple
      // concurrent sockets, each handling every server message — producing the
      // 3x duplicated stream output the user reported.
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        try { wsRef.current.close() } catch { /* noop */ }
        wsRef.current = null
      }

      setConnectionState('connecting')

      try {
        // Use a prefetched ticket if available (saves ~100ms on reconnects);
        // otherwise fetch one fresh.
        const prefetched = _takePrefetchedTicket()
        const ticket = prefetched ?? (await api.post('/auth/ws-ticket')).data.ticket
        const wsBase = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        const ws = new WebSocket(`${wsBase}/ws?ticket=${ticket}`)
        // Claim ownership immediately so a fast-firing onerror during the same
        // tick can't race a second connect() into existence.
        wsRef.current = ws

        ws.onopen = () => {
          // Ignore onopen for a socket we no longer own (e.g. effect cleanup
          // or a newer connect() superseded this one mid-handshake).
          if (wsRef.current !== ws) {
            try { ws.close() } catch { /* noop */ }
            return
          }
          const isReconnect = hasConnectedBefore
          attempt = 0
          hasConnectedBefore = true
          setConnectionState('connected')

          // ─── Pinnacle P1: seq-based replay on reconnect ────────────────
          // If we had a lastSeenSeq, ask the backend ring buffer for anything
          // newer. This fills any events that fired while the WS was down. If
          // seq replay returns events, it's authoritative — we skip the legacy
          // recoverResponse() path which would otherwise duplicate messages.
          if (isReconnect) {
            const osStore = useOSSessionStore.getState()
            const since = osStore.lastSeenSeq
            if (since != null) {
              setConnectionState('catching_up')
              recoverEventsSince(since).then(r => {
                // Capture the server epoch — if it changed (PM2 restart mid-
                // disconnect), _applyRecoverEpoch clears lastSeenSeq so the
                // new events aren't filtered as stale.
                const anyR = r as unknown as { epoch?: string }
                _applyRecoverEpoch(anyR.epoch)
                replayRecoveredEvents(r.events)
                if (r.count === 0) _legacyRecoveryFallback()
              }).catch(() => {
                _legacyRecoveryFallback()
              }).finally(() => {
                setConnectionState('connected')
              })
            } else {
              // Never had a seq (fresh load with persisted state but pre-P1
              // session). Legacy recovery is the only path.
              _legacyRecoveryFallback()
            }
          }

          // Legacy recovery — the tab-close-mid-turn case where the backend
          // completed a response while we were disconnected. Only used when
          // seq-based replay didn't apply or returned no events.
          // Reads store state FRESH at each step rather than capturing it
          // once — otherwise in-flight live events during the async chain
          // would be overwritten by the captured (stale) snapshot.
          function _legacyRecoveryFallback() {
            const initialStore = useOSSessionStore.getState()
            if (!initialStore.lastUserMessageAt && initialStore.status !== 'streaming') return
            import('@/api/osSession').then(({ getOSStatus, recoverResponse }) => {
              getOSStatus().then(backendStatus => {
                const s = useOSSessionStore.getState()
                if (backendStatus.active) {
                  s.setStatus('streaming')
                } else {
                  const since = s.lastUserMessageAt || undefined
                  recoverResponse(since || undefined).then(recovery => {
                    const s2 = useOSSessionStore.getState()
                    if (recovery.found && recovery.text) {
                      useOSSessionStore.setState({ streamChunks: [], streamText: '' })
                      s2.injectRecoveredResponse(recovery.text, recovery.chunks)
                    } else if (s2.streamChunks.length > 0 || s2.streamText) {
                      s2.finalizeResponse()
                    } else if (s2.status === 'streaming') {
                      // No recovery, nothing in buffers, but FE still thinks it's
                      // streaming — backend said inactive, so force-reset the UI.
                      s2.setStatus('idle')
                    }
                  }).catch((err) => {
                    if (typeof window !== 'undefined' && window.console) {
                      window.console.warn('[useWebSocket] recoverResponse failed in legacy fallback', err)
                    }
                    const s3 = useOSSessionStore.getState()
                    if (s3.streamChunks.length > 0 || s3.streamText) {
                      s3.finalizeResponse()
                    }
                  })
                }
              }).catch((err) => {
                // getOSStatus failed — backend is likely unreachable. Log so
                // we can diagnose the "stuck streaming spinner" class of bug.
                if (typeof window !== 'undefined' && window.console) {
                  window.console.warn('[useWebSocket] getOSStatus failed in legacy fallback', err)
                }
              })
            })
          }
        }

        ws.onmessage = (event) => {
          // Only the actively-owned socket may dispatch events. Without this,
          // a leaked previous socket can keep firing onmessage and double/triple
          // the output the user sees during streaming.
          if (wsRef.current !== ws) return
          const msg = JSON.parse(event.data)
          const cortex = useCortexStore.getState()

          // ─── Pinnacle P1: seq tracking + gap detection ────────────────
          // Backend stamps every broadcast with { seq, ts, type, ... }. If we
          // see a jump, fetch the missing slice from the recover endpoint and
          // replay it through the same per-type dispatch. Deduped in-place via
          // lastSeenSeq so a mid-flight live event never double-applies.
          if (typeof msg.seq === 'number') {
            const osStore = useOSSessionStore.getState()
            const prev = osStore.lastSeenSeq
            const prevEpoch = _lastSeenEpoch
            const msgEpoch = typeof msg.epoch === 'string' ? msg.epoch : null

            // Epoch change = new server session OR process restart. The old
            // lastSeenSeq is meaningless in the new ring buffer — treat this
            // message's seq as authoritative and don't gap-fill against it.
            if (msgEpoch && prevEpoch && msgEpoch !== prevEpoch) {
              _lastSeenEpoch = msgEpoch
              osStore.setLastSeenSeq(msg.seq)
            } else if (msgEpoch && !prevEpoch) {
              _lastSeenEpoch = msgEpoch
              // First epoch-bearing event — still treat seq as authoritative.
              if (prev != null && msg.seq > prev + 1) {
                _scheduleRecover(prev)
              }
              osStore.setLastSeenSeq(msg.seq)
            } else if (prev != null && msg.seq < prev - 10) {
              // Legacy path (no epoch field): large backward jump = treat as
              // session boundary. With epochs shipped, this branch is mostly
              // unreachable.
              osStore.setLastSeenSeq(msg.seq)
            } else if (prev != null && msg.seq > prev + 1) {
              // Gap detected — fill it from the ring buffer. Debounced via
              // _scheduleRecover so a burst of 10 missing events produces
              // ONE recover call, not 10.
              _scheduleRecover(prev)
              osStore.setLastSeenSeq(msg.seq)
            } else if (prev == null || msg.seq > prev) {
              osStore.setLastSeenSeq(msg.seq)
            }
          }

          switch (msg.type) {
            case 'notification':
              addNotification(msg.payload)
              break

            // ─── CC Session Output ────────────────────────────────
            case 'cc:output': {
              const chunk = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
              cortex.appendCCOutput(msg.sessionId, chunk)
              window.dispatchEvent(new CustomEvent('ecodia:cc-session-update', { detail: { sessionId: msg.sessionId, type: 'output' } }))
              break
            }

            // ─── CC Session Status Changes ────────────────────────
            case 'cc:status': {
              const newStatus = msg.data?.status ?? msg.data
              const statusUpdate = { status: newStatus }
              cortex.updateCCSession(msg.sessionId, statusUpdate)
              window.dispatchEvent(new CustomEvent('ecodia:cc-session-update', { detail: { sessionId: msg.sessionId, type: 'status', status: newStatus } }))

              if (newStatus === 'complete' || newStatus === 'error') {
                cortex.pushAmbientEvent({
                  kind: newStatus === 'complete' ? 'cc_complete' : 'cc_error',
                  summary: `CC session ${newStatus}: ${msg.sessionId}`,
                  detail: JSON.stringify(msg.data),
                })
              }
              // Always invalidate session list on status change
              queryClient.invalidateQueries({ queryKey: ['ccSessions'] })
              break
            }

            // ─── CC Pipeline Stage ────────────────────────────────
            case 'cc:stage': {
              const stageUpdate = { pipeline_stage: msg.data?.stage }
              cortex.updateCCSession(msg.sessionId, stageUpdate)
              queryClient.invalidateQueries({ queryKey: ['ccSessions'] })
              window.dispatchEvent(new CustomEvent('ecodia:cc-session-update', { detail: { sessionId: msg.sessionId, type: 'stage', stage: msg.data?.stage } }))
              break
            }

            // ─── CC Pipeline Result ──────────────────────────────
            case 'cc:pipeline_result': {
              const result = msg.data ?? msg.payload
              const statusUpdate = {
                status: (result?.success ? 'complete' : 'error') as CCSession['status'],
                pipeline_stage: (result?.success ? 'deployed' : 'error') as CCSession['pipeline_stage'],
                confidence_score: result?.confidence ?? null,
                commit_sha: result?.commitSha ?? null,
              }
              cortex.updateCCSession(msg.sessionId, statusUpdate)
              cortex.pushAmbientEvent({
                kind: result?.success ? 'cc_deployed' : 'cc_deploy_failed',
                summary: result?.success
                  ? `Deployed: ${result.commitSha?.slice(0, 8) ?? 'committed'} (confidence: ${((result.confidence ?? 0) * 100).toFixed(0)}%)`
                  : `Deploy failed: ${result?.error ?? 'unknown'}`,
                detail: JSON.stringify(result),
              })
              queryClient.invalidateQueries({ queryKey: ['ccSessions'] })
              window.dispatchEvent(new CustomEvent('ecodia:cc-session-update', { detail: { sessionId: msg.sessionId, type: 'pipeline_result' } }))
              break
            }

            // ─── CC Session Created ─────────────────────────────
            case 'cc:session_created': {
              const session = msg.data ?? msg.payload
              if (session?.id) {
                cortex.registerCCSession(session)
                cortex.pushAmbientEvent({
                  kind: 'cc_started',
                  summary: `New session: ${session.prompt?.slice(0, 80) ?? session.id}`,
                  detail: JSON.stringify(session),
                })
                queryClient.invalidateQueries({ queryKey: ['ccSessions'] })
                window.dispatchEvent(new CustomEvent('ecodia:cc-session-update', { detail: { sessionId: session.id, type: 'created' } }))
              }
              break
            }

            // ─── Worker Heartbeats ────────────────────────────────
            case 'worker_heartbeat':
              updateWorker(msg.payload)
              break

            // ─── Action Queue Events ──────────────────────────────
            case 'action_queue:new':
            case 'action_queue:updated':
            case 'action_queue:executed':
            case 'action_queue:dismissed':
              // Invalidate React Query cache so ActionStream re-fetches
              queryClient.invalidateQueries({ queryKey: ['pendingActions'] })
              queryClient.invalidateQueries({ queryKey: ['actionStats'] })
              window.dispatchEvent(new CustomEvent('ecodia:action-queue-update', { detail: msg }))
              break

            // ─── Action Queue Expired ───────────────────────────
            case 'action_queue:expired':
              queryClient.invalidateQueries({ queryKey: ['pendingActions'] })
              queryClient.invalidateQueries({ queryKey: ['actionStats'] })
              cortex.pushAmbientEvent({
                kind: 'action_expired',
                summary: `Action expired: ${msg.payload?.title ?? 'item removed from queue'}`,
              })
              break

            // ─── OS Session (Agent SDK stream) ──────────────────
            case 'os-session:output': {
              applyOSOutputChunk(msg.data)
              break
            }
            case 'os-session:status': {
              const osStore = useOSSessionStore.getState()
              // 'live' is a liveness heartbeat emitted every 5s while a turn is
              // in-flight. It does NOT change the top-level status (still streaming)
              // — it updates the "what's happening" detail so the UI can show
              // "thinking — 42s" or "running mcp__neo4j__cypher — 18s" instead of
              // a blank spinner during long tool runs.
              if (msg.status === 'live') {
                osStore.setLiveness({
                  phase: msg.phase || 'thinking',
                  elapsedSec: typeof msg.elapsedSec === 'number' ? msg.elapsedSec : 0,
                  detail: msg.detail || null,
                  receivedAt: Date.now(),
                })
                // A heartbeat means a turn is genuinely in flight on the backend.
                // If our local status drifted to idle/complete (missed initial
                // 'streaming' frame, recovery race), the StreamingIndicator was
                // hidden while the backend kept working — the silent gap. Re-promote.
                if (osStore.status !== 'streaming') {
                  osStore.setStatus('streaming')
                }
                // Liveness is proof the turn is actually alive. Clear the
                // pre-token "thinking…" pulse — the liveness row carries the
                // signal now (phase + elapsedSec + tool name). Without this,
                // the pulse shimmered next to the liveness indicator forever.
                if (osStore.assistantTurnStarting) {
                  osStore.setAssistantTurnStarting(false)
                }
              } else {
                // Normalise backend status values to the canonical FE enum.
                // Backend emits intermediate states (compacting, handover_preparing,
                // handover_warming, handover_complete, queued) during long-running
                // work — the UI treats these as "still streaming" because the
                // response isn't complete yet. compactionPhase + handover state
                // carry the sub-signal for UI chrome.
                const raw = msg.status as string | undefined
                let next: 'idle' | 'streaming' | 'complete' | 'error' = 'idle'
                if (raw === 'streaming' || raw === 'compacting' ||
                    raw === 'handover_preparing' || raw === 'handover_warming' ||
                    raw === 'queued') {
                  next = 'streaming'
                } else if (raw === 'complete' || raw === 'handover_complete') {
                  next = 'complete'
                } else if (raw === 'error') {
                  next = 'error'
                } else if (raw === 'idle') {
                  next = 'idle'
                } else if (raw) {
                  // Unknown — keep the stream alive rather than silently dropping.
                  next = osStore.status === 'streaming' ? 'streaming' : 'idle'
                }
                osStore.setStatus(next)
                if (msg.sessionId) osStore.setSessionId(msg.sessionId)
              }
              break
            }
            case 'os-session:complete': {
              const osStore = useOSSessionStore.getState()
              osStore.finalizeResponse()
              break
            }
            case 'os-session:energy': {
              // Server pushed a fresh energy snapshot — update React Query cache directly
              if (msg && msg.pctRemaining != null) {
                queryClient.setQueryData(['claudeEnergy'], msg)
              }
              break
            }
            case 'os-session:tokens': {
              const osStore = useOSSessionStore.getState()
              osStore.setTokenUsage(msg)
              // Auto-handover is now backend-driven (autoHandover in osSessionService).
              // Frontend only tracks compacting state for the token bar display.
              break
            }

            // ─── Rescue (ecodia-rescue process) ───────────────────────
            // Parallel to os-session:* events but for the standalone rescue
            // session. Routed into useRescueStore, not useOSSessionStore.
            case 'rescue:ready': {
              import('@/store/rescueStore').then(({ useRescueStore }) => {
                useRescueStore.getState().setReady(true)
              })
              break
            }
            case 'rescue:status': {
              import('@/store/rescueStore').then(({ useRescueStore }) => {
                const raw = msg.status as string | undefined
                const next: 'idle' | 'streaming' | 'error' | 'unknown' =
                  raw === 'streaming' ? 'streaming' :
                  raw === 'error' ? 'error' :
                  raw === 'idle' ? 'idle' : 'unknown'
                useRescueStore.getState().setStatus(next)
                // When turn ends, flush current stream text into messages.
                if (next === 'idle' || next === 'error') {
                  useRescueStore.getState().flushStreamToMessage()
                }
              })
              break
            }
            case 'rescue:output': {
              import('@/store/rescueStore').then(({ useRescueStore }) => {
                const store = useRescueStore.getState()
                const d = msg.data || msg
                if (d.type === 'text_delta' && d.content) {
                  store.appendStreamText(d.content)
                } else if (d.type === 'thinking_delta' && d.content) {
                  store.appendStreamThinking(d.content)
                } else if (d.type === 'tool_use_starting' && d.tool_use_id) {
                  store.onToolStart(d.tool_use_id, d.tool_name || 'tool')
                } else if (d.type === 'tool_use_input_complete' && d.tool_use_id) {
                  store.onToolInput(d.tool_use_id, d.input)
                } else if (d.type === 'tool_result' && d.tool_use_id) {
                  store.onToolResult(d.tool_use_id, String(d.content || ''), !!d.is_error)
                } else if (d.type === 'turn_complete') {
                  store.flushStreamToMessage()
                } else if (d.type === 'error') {
                  store.flushStreamToMessage()
                }
              })
              break
            }
            case 'rescue:exit': {
              import('@/store/rescueStore').then(({ useRescueStore }) => {
                useRescueStore.getState().setReady(false)
                useRescueStore.getState().setStatus('unknown')
              })
              break
            }

            // ─── Seamless session handover ────────────────────────
            case 'os-session:handover': {
              const osStore = useOSSessionStore.getState()
              const phase = msg.phase as string
              if (phase === 'preparing' || phase === 'warming') {
                osStore.setHandover({ phase: phase as 'preparing' | 'warming' })
                osStore.setCompacting(true)
              } else if (phase === 'complete') {
                osStore.setHandover({
                  phase: 'complete',
                  newSessionId: msg.newSessionId,
                  briefPreview: msg.briefPreview,
                })
                // Reset compacting flag and token usage — fresh slate
                osStore.setCompacting(false)
                osStore.setTokenUsage(null)
                // Clear the handover indicator after a short delay
                setTimeout(() => {
                  useOSSessionStore.getState().setHandover(null)
                }, 4000)
              } else if (phase === 'failed' || phase === 'cancelled') {
                osStore.setHandover({ phase: phase as 'failed' | 'cancelled', error: msg.error })
                osStore.setCompacting(false)
                setTimeout(() => {
                  useOSSessionStore.getState().setHandover(null)
                }, 3000)
              }
              break
            }

            // ─── OS Orchestration Progress (legacy) ──────────────
            case 'os:progress':
              window.dispatchEvent(new CustomEvent('ecodia:os-progress', { detail: msg }))
              break

            // ─── Metabolic Pressure ───────────────────────────────
            case 'metabolic_pressure':
              window.dispatchEvent(new CustomEvent('ecodia:metabolic-pressure', { detail: msg.payload }))
              break

            // ─── Message Queue (Tate->OS inbox) ───────────────────
            // Any queue mutation (enqueue / deliver / cancel / promote / update
            // / age sweep) triggers a live refetch of the drawer + pill so the
            // user doesn't have to wait for the 15-30s poll tick.
            case 'message_queue:delivered': {
              queryClient.invalidateQueries({ queryKey: ['message-queue'] })
              // Render each delivered queued message as its own user card.
              // Without this, the drawer pills vanish with no trace in the
              // chat timeline — user has no idea what actually got sent.
              if (Array.isArray(msg.bodies)) {
                const osStore = useOSSessionStore.getState()
                for (const body of msg.bodies) {
                  if (typeof body === 'string' && body.trim()) {
                    osStore.addDeliveredQueueMessage(body)
                  }
                }
              }
              break
            }
            case 'message_queue:enqueued':
            case 'message_queue:cancelled':
            case 'message_queue:promoted':
            case 'message_queue:updated':
            case 'message_queue:swept':
              queryClient.invalidateQueries({ queryKey: ['message-queue'] })
              break

          }
        }

        // onerror always precedes onclose; both used to fire reconnect()
        // independently, doubling the reconnect storm. Route both through one
        // guarded path.
        const handleDrop = () => {
          if (wsRef.current === ws) wsRef.current = null
          if (mounted) {
            setConnectionState('reconnecting')
            reconnect()
          }
        }
        ws.onclose = handleDrop
        ws.onerror = handleDrop
      } catch {
        if (mounted) {
          setConnectionState('reconnecting')
          reconnect()
        }
      }
    }

    // Tighter backoff than the classic 1s-doubling curve: a typical PM2
    // restart is back in 3-5s, so we want to be trying roughly at t=0.5s,
    // 1.5s, 3s, 5s rather than 1s, 2s, 4s, 8s. Cap at 30s eventually.
    const BACKOFF_SCHEDULE_MS = [200, 500, 1000, 2000, 5000, 10000, 20000, 30000]

    // Optimistic ticket prefetch: the WS handshake needs a single-use ticket
    // from POST /auth/ws-ticket. Normally we fetch it inside connect(),
    // serially with the WS open. For reconnects we can overlap the backoff
    // wait with the ticket round-trip, shaving ~100ms off the total gap.
    let _prefetchedTicket: { ticket: string; at: number } | null = null
    const _prefetchTicket = () => {
      api.post('/auth/ws-ticket').then(({ data }) => {
        // Backend TTL is 90s; keep a 60s validity window so we always use a
        // fresh ticket, never one that might expire mid-handshake.
        if (mounted) _prefetchedTicket = { ticket: data.ticket, at: Date.now() }
      }).catch(() => { /* best-effort */ })
    }
    const _takePrefetchedTicket = (): string | null => {
      if (!_prefetchedTicket) return null
      if (Date.now() - _prefetchedTicket.at > 60_000) {
        _prefetchedTicket = null
        return null
      }
      const t = _prefetchedTicket.ticket
      _prefetchedTicket = null
      return t
    }

    function reconnect() {
      if (!mounted || reconnectScheduled) return
      reconnectScheduled = true
      const delay = BACKOFF_SCHEDULE_MS[Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1)]
      attempt++
      // Start the ticket fetch now, concurrent with the backoff wait.
      _prefetchTicket()
      setTimeout(() => {
        reconnectScheduled = false
        connect()
      }, delay)
    }

    connect()

    return () => {
      mounted = false
      try { wsRef.current?.close() } catch { /* noop */ }
      wsRef.current = null
      setConnectionState('disconnected')
    }
    // Intentionally only re-run on token change. addNotification/updateWorker/
    // queryClient are stable references from their stores/providers — including
    // them risked re-running this effect (and spawning a parallel socket) every
    // render in cases where a parent re-mount briefly broke that stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Tab-wake backpressure recovery — when the browser tab is backgrounded,
  // the OS may throttle or pause WS message processing. On return to visible,
  // we could be about to receive a big burst of stale deltas, all of which
  // are already superseded by what's in the server ring buffer. Rather than
  // process that burst, hop straight to the backend's current view via the
  // recover endpoint — much smoother resume.
  useEffect(() => {
    if (!token) return
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const since = useOSSessionStore.getState().lastSeenSeq
      if (since == null) return
      _scheduleRecover(since)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [token])
}
