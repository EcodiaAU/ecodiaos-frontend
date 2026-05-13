/**
 * useCcSessions — polls /api/factory/sessions every 30s.
 * Phase 5 (fork_mp3qmbg0_ceed6f): right-rail cc_sessions activity feed.
 * Returns last 10 sessions. Gracefully returns [] on 404 / network error.
 */
import { useState, useEffect } from 'react'
import api from '@/api/client'

export interface CcSessionRow {
  session_id: string
  status: string
  pipeline_stage: string | null
  confidence_score: number | null
  created_at: string | null
  codebase_name?: string | null
  prompt?: string | null
  files_changed?: number | null
}

const ENDPOINTS = [
  '/factory/sessions',
  '/cc_sessions/recent',
  '/factory/sessions/recent',
]

async function tryFetch(): Promise<CcSessionRow[]> {
  for (const ep of ENDPOINTS) {
    try {
      const res = await api.get(ep, { params: { limit: 10 } })
      const d = res.data
      const rows: CcSessionRow[] = Array.isArray(d)
        ? d
        : Array.isArray(d?.sessions)
        ? d.sessions
        : Array.isArray(d?.rows)
        ? d.rows
        : []
      if (rows.length > 0) return rows.slice(0, 10)
    } catch {
      // try next endpoint
    }
  }
  return []
}

export function useCcSessions(pollMs = 30_000) {
  const [sessions, setSessions] = useState<CcSessionRow[]>([])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      const rows = await tryFetch()
      if (!cancelled) setSessions(rows)
      if (!cancelled) timer = window.setTimeout(tick, pollMs)
    }

    tick()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [pollMs])

  return { sessions }
}
