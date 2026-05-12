import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * /meetings/:id - Meeting detail, transcript + audio playback.
 *
 * Polls every 3s while transcription_status is pending or processing.
 * Stops polling once status reaches done or error.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

type TranscriptionStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'error'
  | 'uploaded_awaiting_transcription'

interface MeetingData {
  id: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  transcription_status: TranscriptionStatus
  transcript_text: string | null
  audio_signed_url: string | null
  client_name: string | null
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const STATUS_LABEL: Record<TranscriptionStatus, string> = {
  pending: 'Waiting to process',
  processing: 'Transcribing...',
  uploaded_awaiting_transcription: 'Uploaded, awaiting transcription',
  done: 'Transcription complete',
  error: 'Transcription failed',
}

const STATUS_COLOR: Record<TranscriptionStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  processing: 'bg-blue-500/20 text-blue-300',
  uploaded_awaiting_transcription: 'bg-blue-500/20 text-blue-300',
  done: 'bg-emerald-500/20 text-emerald-300',
  error: 'bg-red-500/20 text-red-300',
}

const POLL_STATUSES: TranscriptionStatus[] = ['pending', 'processing', 'uploaded_awaiting_transcription']

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const token = useAuthStore((s) => s.token)

  const [meeting, setMeeting] = useState<MeetingData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const authHeaders = (): Record<string, string> =>
    token ? { Authorization: `Bearer ${token}` } : {}

  const fetchMeeting = async (): Promise<MeetingData | null> => {
    try {
      const res = await fetch(`${API_BASE}/meetings/${id}`, { headers: authHeaders() })
      if (!res.ok) {
        setLoadError(`Failed to load meeting (${res.status})`)
        return null
      }
      const data = (await res.json()) as MeetingData
      setMeeting(data)
      setLoadError(null)
      return data
    } catch (e) {
      setLoadError((e as Error).message)
      return null
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true)

    fetchMeeting().then((data) => {
      setLoading(false)
      if (data && POLL_STATUSES.includes(data.transcription_status)) {
        pollRef.current = setInterval(async () => {
          const updated = await fetchMeeting()
          if (updated && !POLL_STATUSES.includes(updated.transcription_status)) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
          }
        }, 3000)
      }
    })

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const status = meeting?.transcription_status ?? 'pending'
  const isPolling = meeting ? POLL_STATUSES.includes(status) : false
  const title = meeting?.title ?? (meeting ? formatDateTime(meeting.started_at) : id ?? 'Meeting')

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[600px] flex-col px-5 py-8">
        {/* Header */}
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link
              to="/meetings"
              className="mb-2 block text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              &larr; All meetings
            </Link>
            <h1 className="truncate text-lg font-semibold tracking-tight text-white/90">
              {loading ? 'Loading...' : title}
            </h1>
          </div>
          {meeting && (
            <span
              className={[
                'mt-6 shrink-0 rounded-full px-3 py-1 text-xs font-medium',
                STATUS_COLOR[status],
              ].join(' ')}
            >
              {STATUS_LABEL[status]}
              {isPolling && <span className="ml-1 animate-pulse">...</span>}
            </span>
          )}
        </header>

        {loadError && (
          <div className="mb-4 rounded-xl bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {loadError}
          </div>
        )}

        {loading && !meeting && (
          <div className="flex flex-1 items-center justify-center text-white/30 text-sm">
            Loading meeting...
          </div>
        )}

        {meeting && (
          <>
            {/* Meta */}
            <div className="mb-6 grid grid-cols-2 gap-3 text-[11px] text-white/40 sm:grid-cols-3">
              <div className="rounded-xl bg-white/5 px-4 py-3">
                <div className="uppercase tracking-wider text-white/30">Started</div>
                <div className="mt-1 text-sm text-white/60">
                  {formatDateTime(meeting.started_at)}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 px-4 py-3">
                <div className="uppercase tracking-wider text-white/30">Duration</div>
                <div className="mt-1 font-mono text-sm text-white/60">
                  {formatDuration(meeting.duration_seconds)}
                </div>
              </div>
              {meeting.client_name && (
                <div className="rounded-xl bg-white/5 px-4 py-3">
                  <div className="uppercase tracking-wider text-white/30">Client</div>
                  <div className="mt-1 text-sm text-white/60">{meeting.client_name}</div>
                </div>
              )}
            </div>

            {/* Audio player */}
            {meeting.audio_signed_url && (
              <section className="mb-6">
                <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
                  Recording
                </h2>
                <audio
                  controls
                  src={meeting.audio_signed_url}
                  className="w-full rounded-xl bg-white/5"
                  preload="metadata"
                />
              </section>
            )}

            {/* Transcript */}
            <section className="flex min-h-0 flex-1 flex-col">
              <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
                Transcript
              </h2>

              {status === 'done' && meeting.transcript_text ? (
                <div className="flex-1 overflow-y-auto rounded-xl bg-white/5 px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                    {meeting.transcript_text}
                  </p>
                </div>
              ) : status === 'error' ? (
                <div className="rounded-xl bg-red-900/20 px-4 py-4 text-sm text-red-300/80">
                  Transcription failed. The audio recording is still available above.
                </div>
              ) : (
                <div className="rounded-xl bg-white/5 px-4 py-6 text-center text-sm text-white/30">
                  {isPolling ? (
                    <span>
                      {STATUS_LABEL[status]}
                      <span className="ml-1 animate-pulse">...</span>
                    </span>
                  ) : (
                    STATUS_LABEL[status]
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* New recording CTA */}
        <div className="mt-8 text-center">
          <Link
            to="/meeting"
            className="inline-block rounded-full bg-white/10 px-6 py-3 text-sm font-medium text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            + New recording
          </Link>
        </div>
      </div>
    </div>
  )
}
