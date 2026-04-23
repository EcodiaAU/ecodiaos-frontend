import api from './client'

/**
 * Rescue API — talks to ecodia-rescue via ecodia-api.
 * Responses stream over WS as `rescue:*` events (see useRescueWS hook).
 */

export interface RescueStatus {
  ready: boolean
  status: 'idle' | 'streaming' | 'error' | 'unknown'
  lastReadyAt: number | null
  lastStatusAt: number | null
  lastActivityAt: number | null
  transcriptLength: number
}

export interface RescueTranscriptEntry {
  role: 'user' | 'assistant' | 'system'
  content: string | Record<string, unknown>
  ts: number
  inProgress?: boolean
  kind?: string
}

export async function sendRescueMessage(message: string) {
  const { data } = await api.post('/rescue/message', { message })
  return data as { accepted: boolean; queued: boolean; ts: number }
}

export async function invokeRescue(opts: {
  reason?: string
  extraContext?: string | null
  instruction?: string | null
} = {}) {
  const { data } = await api.post('/rescue/invoke', opts)
  return data as { accepted: boolean; briefBytes: number }
}

export async function abortRescue(reason: string = 'user_abort') {
  const { data } = await api.post('/rescue/abort', { reason })
  return data as { aborted: boolean; reason: string }
}

export async function resetRescue() {
  const { data } = await api.post('/rescue/reset')
  return data as { reset: boolean }
}

export async function getRescueStatus() {
  const { data } = await api.get('/rescue/status')
  return data as RescueStatus
}

export async function getRescueHealth() {
  const { data } = await api.get('/rescue/health')
  return data as { alive: boolean; latencyMs?: number }
}

export async function getRescueTranscript(limit: number = 100) {
  const { data } = await api.get('/rescue/transcript', { params: { limit } })
  return data.transcript as RescueTranscriptEntry[]
}

export async function getRescueBrief(reason: string = 'preview') {
  const { data } = await api.get('/rescue/brief', {
    params: { reason },
    responseType: 'text',
    transformResponse: (r) => r,
  })
  return data as string
}
