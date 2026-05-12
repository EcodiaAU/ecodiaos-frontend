import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * /meetings - Recent meetings list.
 *
 * Lists all recorded meetings, newest first.
 * Each row links to /meetings/:id.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'error'
  | 'uploaded_awaiting_transcription'
  | 'retrying'

interface MeetingRow {
  id: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  transcription_status: TranscriptionStatus
  client_name: string | null
}

interface ListResponse {
  meetings: MeetingRow[]
  total: number
  limit: number
  offset: number
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const STATUS_CHIP: Record<TranscriptionStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-300' },
  processing: { label: 'Processing', className: 'bg-blue-500/20 text-blue-300' },
  uploaded_awaiting_transcription: { label: 'Uploaded', className: 'bg-blue-500/20 text-blue-300' },
  retrying: { label: 'Retrying', className: 'bg-blue-500/20 text-blue-300' },
  done: { label: 'Done', className: 'bg-emerald-500/20 text-emerald-300' },
  error: { label: 'Error', className: 'bg-red-500/20 text-red-300' },
}

export default function MeetingsListPage() {
  const token = useAuthStore((s) => s.token)
  const [meetings, setMeetings] = useState<MeetingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Per-row retry loading state: meetingId -> true while queuing
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})

  const authHeaders = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {}

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/meetings`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as ListResponse
        setMeetings(data.meetings ?? [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRetry = async (e: React.MouseEvent, meetingId: string) => {
    e.preventDefault() // Don't navigate to detail page
    e.stopPropagation()
    setRetrying(prev => ({ ...prev, [meetingId]: true }))
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}/retranscribe`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (res.ok) {
        // Optimistically update the row status so the chip flips to Retrying
        setMeetings(prev =>
          prev.map(m => m.id === meetingId ? { ...m, transcription_status: 'retrying' } : m)
        )
      }
    } catch {
      // Ignore - user can click through to detail page for full error
    } finally {
      setRetrying(prev => ({ ...prev, [meetingId]: false }))
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[600px] flex-col px-5 py-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white/90">Meetings</h1>
          <Link
            to="/meeting"
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"
          >
            + Record
          </Link>
        </header>

        {error && (
          <div className="mb-4 rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-white/30">
            Loading...
          </div>
        )}

        {!loading && meetings.length === 0 && !error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-white/30 text-sm">No meetings recorded yet.</p>
            <Link
              to="/meeting"
              className="rounded-full bg-red-600 px-6 py-3 text-base font-medium text-white hover:bg-red-500 transition-colors"
            >
              Start your first recording
            </Link>
          </div>
        )}

        {!loading && meetings.length > 0 && (
          <ul className="flex flex-col gap-2">
            {meetings.map((m) => {
              const chip = STATUS_CHIP[m.transcription_status]
              const displayTitle = m.title ?? formatDateTime(m.started_at)
              return (
                <li key={m.id}>
                  <Link
                    to={`/meetings/${m.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl bg-white/5 px-4 py-4 hover:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white/90">
                        {displayTitle}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">
                        <span>{formatDateTime(m.started_at)}</span>
                        {m.duration_seconds != null && (
                          <>
                            <span>-</span>
                            <span>{formatDuration(m.duration_seconds)}</span>
                          </>
                        )}
                        {m.client_name && (
                          <>
                            <span>-</span>
                            <span>{m.client_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.transcription_status === 'error' && (
                        <button
                          onClick={(e) => handleRetry(e, m.id)}
                          disabled={retrying[m.id]}
                          className="rounded-lg bg-white/8 px-2.5 py-1 text-[11px] text-white/50 hover:bg-white/15 hover:text-white/80 transition-colors disabled:opacity-40"
                        >
                          {retrying[m.id] ? '...' : 'Retry'}
                        </button>
                      )}
                      <span
                        className={[
                          'rounded-full px-2.5 py-1 text-[11px] font-medium',
                          chip.className,
                        ].join(' ')}
                      >
                        {chip.label}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
