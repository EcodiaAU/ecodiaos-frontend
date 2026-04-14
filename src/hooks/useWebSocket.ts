import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import { useCortexStore } from '@/store/cortexStore'
import { useWorkerStore } from '@/store/workerStore'
import { useOSSessionStore } from '@/store/osSessionStore'
import type { CCSession } from '@/types/claudeCode'
import api from '@/api/client'

/**
 * Connection state — drives the ambient offline indicator.
 * Dispatched as a CustomEvent so any component can listen without re-renders.
 */
function setConnectionState(state: 'connected' | 'connecting' | 'disconnected') {
  window.dispatchEvent(new CustomEvent('ecodia:connection-state', { detail: state }))
}

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
        const { data } = await api.post('/auth/ws-ticket')
        const wsBase = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        const ws = new WebSocket(`${wsBase}/ws?ticket=${data.ticket}`)
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

          // On WS reconnect, check if we missed an OS session response
          if (isReconnect) {
            const osStore = useOSSessionStore.getState()
            if (osStore.lastUserMessageAt || osStore.status === 'streaming') {
              // We were streaming when we lost connection — check backend
              import('@/api/osSession').then(({ getOSStatus, recoverResponse }) => {
                getOSStatus().then(backendStatus => {
                  if (backendStatus.active) {
                    // Still going — WS will pick up from here
                    osStore.setStatus('streaming')
                  } else {
                    // Completed while we were disconnected — recover
                    const since = osStore.lastUserMessageAt || undefined
                    recoverResponse(since || undefined).then(recovery => {
                      if (recovery.found && recovery.text) {
                        useOSSessionStore.setState({ streamChunks: [], streamText: '' })
                        osStore.injectRecoveredResponse(recovery.text, recovery.chunks)
                      } else if (osStore.streamChunks.length > 0 || osStore.streamText) {
                        osStore.finalizeResponse()
                      }
                    }).catch(() => {
                      if (osStore.streamChunks.length > 0 || osStore.streamText) {
                        osStore.finalizeResponse()
                      }
                    })
                  }
                }).catch(() => {})
              })
            }
          }
        }

        ws.onmessage = (event) => {
          // Only the actively-owned socket may dispatch events. Without this,
          // a leaked previous socket can keep firing onmessage and double/triple
          // the output the user sees during streaming.
          if (wsRef.current !== ws) return
          const msg = JSON.parse(event.data)
          const cortex = useCortexStore.getState()

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

            // ─── CC Pipeline Result (was dead — now handled) ──────
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

            // ─── CC Session Created (was dead — now handled) ──────
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

            // ─── Action Queue Expired (was dead — now handled) ────
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
              const osStore = useOSSessionStore.getState()
              const chunk = msg.data
              if (!chunk) break

              // thinking_delta: real-time streaming of extended thinking
              if (chunk.type === 'thinking_delta' && chunk.content) {
                osStore.appendStreamThinking(chunk.content)
              }
              // thinking: complete thinking block (from assistant message)
              else if (chunk.type === 'thinking' && chunk.content) {
                osStore.appendStreamThinking(chunk.content)
              }
              // text_delta: real-time streaming from Agent SDK partial messages.
              // Goes only into streamText (the rendered buffer). streamChunks is
              // for raw NDJSON archival — appending deltas there too made the
              // saved message content double-up after finalize.
              else if (chunk.type === 'text_delta' && chunk.content) {
                osStore.appendStreamText(chunk.content)
              }
              // assistant_text: complete text from an assistant turn. In agentic
              // loops the text_delta stream already produced this same content
              // as it arrived, so re-appending it here would render the message
              // twice. Skip — deltas are authoritative for the live view, and
              // recovery uses a separate path (injectRecoveredResponse).
              else if (chunk.type === 'assistant_text' && chunk.content) {
                // intentional no-op — deltas already covered this text
              }
              // tool_use: agent is using a tool — track each tool live
              else if (chunk.type === 'tool_use' && chunk.tools) {
                const toolNames = (chunk.tools as Array<{ name: string; id?: string }>).map(t => t.name).join(', ')
                osStore.appendStreamChunk(`[using: ${toolNames}]`)
                for (const t of chunk.tools as Array<{ name: string; id?: string; input?: unknown }>) {
                  osStore.addStreamTool({
                    name: t.name,
                    toolUseId: t.id,
                    input: t.input ? JSON.stringify(t.input, null, 2) : undefined,
                  })
                }
              }
              // tool_result: tool finished — match by tool_use_id
              else if (chunk.type === 'tool_result') {
                const matchKey = chunk.tool_use_id || chunk.name
                if (matchKey) {
                  const resultStr = chunk.content
                    ? (typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content, null, 2))
                    : undefined
                  osStore.updateStreamTool(matchKey, {
                    result: resultStr,
                    completedAt: Date.now(),
                  })
                }
              }
              // Legacy stream format (backward compat with CLI-spawned sessions)
              else if (chunk.type === 'stream' && chunk.content) {
                osStore.appendStreamChunk(chunk.content)
                try {
                  const parsed = JSON.parse(chunk.content)
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
              }
              break
            }
            case 'os-session:status': {
              const osStore = useOSSessionStore.getState()
              osStore.setStatus(msg.status || 'idle')
              if (msg.sessionId) osStore.setSessionId(msg.sessionId)
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

          }
        }

        // onerror always precedes onclose; both used to fire reconnect()
        // independently, doubling the reconnect storm. Route both through one
        // guarded path.
        const handleDrop = () => {
          if (wsRef.current === ws) wsRef.current = null
          if (mounted) {
            setConnectionState('disconnected')
            reconnect()
          }
        }
        ws.onclose = handleDrop
        ws.onerror = handleDrop
      } catch {
        if (mounted) {
          setConnectionState('disconnected')
          reconnect()
        }
      }
    }

    function reconnect() {
      if (!mounted || reconnectScheduled) return
      reconnectScheduled = true
      const delay = Math.min(1000 * 2 ** attempt, 30_000)
      attempt++
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
}
