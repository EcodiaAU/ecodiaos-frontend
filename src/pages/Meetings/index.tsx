/**
 * /meetings — Meeting recorder + diarised transcript viewer.
 *
 * Three states:
 *   idle     → list of past meetings + "New Recording" button
 *   recording → big recorder UI with timer, chunk health dots, stop button
 *   viewing   → selected meeting with script-style transcript display
 *
 * Recorder mechanics:
 *   MediaRecorder, timeslice=5000ms. Each chunk gets a sequence number.
 *   Chunks upload immediately; one auto-retry on failure (2s delay).
 *   Failed chunks surface as amber dots (recording continues - we flag
 *   the gap, Whisper/Deepgram still transcribes what it received).
 *   Stop fires /api/meetings/:id/stop → polls transcription_status until done/error.
 *
 * Transcript display:
 *   diarised=true  → script format: "Speaker A (0:00 - 0:14)\n  Hey..."
 *   diarised=false → paragraph blocks + "Deepgram needed" banner
 *   Speaker labels editable per-meeting (click to rename).
 */
import {
  useState, useRef, useEffect, useCallback, memo,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic, MicOff, Square, Clock, FileText,
  Copy, Download, Check, AlertTriangle, RefreshCw,
  Pencil, X, ChevronLeft, Trash2, Loader2,
} from 'lucide-react'
import {
  listMeetings, getMeeting, createMeeting, uploadChunk, stopMeeting,
  retranscribeMeeting, updateSpeakers, deleteMeeting, getExportUrl,
  type Meeting, type TranscriptSegment,
} from '@/api/meetings'

// ─── Speaker colours (tasteful, not loud) ────────────────────────────────────
const SPEAKER_COLORS: Record<string, string> = {
  A: '#2ECC71', // primary-container green
  B: '#F59E0B', // gold
  C: '#10B981', // teal
  D: '#A78BFA', // soft purple
  E: '#60A5FA', // soft blue
  F: '#F472B6', // soft pink
}
function speakerColor(code: string | null) {
  if (!code) return '#666666'
  return SPEAKER_COLORS[code] || '#888888'
}

// ─── Time formatting ──────────────────────────────────────────────────────────
function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
function fmtDuration(s: number | null) {
  if (!s) return ''
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${sec}s`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Brisbane',
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Chunk status dot ─────────────────────────────────────────────────────────
type ChunkStatus = 'uploading' | 'ok' | 'error'
function ChunkDot({ status }: { status: ChunkStatus }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="inline-block h-2 w-2 rounded-full"
      style={{
        backgroundColor:
          status === 'ok' ? '#2ECC71' :
          status === 'error' ? '#F59E0B' :
          '#444',
      }}
      title={status}
    />
  )
}

// ─── Recorder ─────────────────────────────────────────────────────────────────
interface RecorderProps {
  onDone: (meetingId: string) => void
  onCancel: () => void
}

function Recorder({ onDone, onCancel }: RecorderProps) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'stopping' | 'transcribing'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([])
  const [error, setError] = useState<string | null>(null)

  const meetingIdRef = useRef<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunkIndexRef = useRef(0)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Upload a chunk with one retry
  const uploadChunkWithRetry = useCallback(async (meetingId: string, idx: number, blob: Blob) => {
    setChunkStatuses(prev => {
      const next = [...prev]
      next[idx] = 'uploading'
      return next
    })
    try {
      await uploadChunk(meetingId, idx, blob)
      setChunkStatuses(prev => { const n = [...prev]; n[idx] = 'ok'; return n })
    } catch {
      // One retry after 2s
      await new Promise(r => setTimeout(r, 2000))
      try {
        await uploadChunk(meetingId, idx, blob)
        setChunkStatuses(prev => { const n = [...prev]; n[idx] = 'ok'; return n })
      } catch {
        setChunkStatuses(prev => { const n = [...prev]; n[idx] = 'error'; return n })
        // Non-fatal: recording continues, this chunk is logged as a gap
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const { id } = await createMeeting()
      meetingIdRef.current = id
      chunkIndexRef.current = 0

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      recorderRef.current = recorder

      recorder.ondataavailable = async (e) => {
        if (!e.data || e.data.size < 100) return // skip empty slices
        const idx = chunkIndexRef.current++
        uploadChunkWithRetry(id, idx, e.data)
      }

      recorder.onerror = (e) => {
        setError(`Recorder error: ${(e as ErrorEvent).message || 'unknown'}`)
      }

      recorder.start(5000) // 5s chunks
      setPhase('recording')
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [uploadChunkWithRetry])

  const stopRecording = useCallback(async () => {
    if (!meetingIdRef.current) return
    setPhase('stopping')
    if (timerRef.current) clearInterval(timerRef.current)

    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // Request final chunk then stop
      await new Promise<void>(resolve => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
      // Stop microphone tracks
      recorder.stream.getTracks().forEach(t => t.stop())
    }

    const durationSeconds = elapsed
    try {
      await stopMeeting(meetingIdRef.current, durationSeconds)
      setPhase('transcribing')
      pollTranscription(meetingIdRef.current)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Stop failed')
      setPhase('recording')
    }
  }, [elapsed])

  const pollTranscription = useCallback((id: string) => {
    const poll = async () => {
      try {
        const meeting = await getMeeting(id)
        if (meeting.transcription_status === 'done' || meeting.transcription_status === 'error') {
          onDone(id)
          return
        }
      } catch { /* ignore, keep polling */ }
      pollRef.current = setTimeout(poll, 3000)
    }
    poll()
  }, [onDone])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearTimeout(pollRef.current)
      recorderRef.current?.stream?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={startRecording}
          className="flex h-24 w-24 items-center justify-center rounded-full"
          style={{ background: 'rgba(27,122,61,0.15)', border: '2px solid rgba(46,204,113,0.4)' }}
        >
          <Mic className="h-10 w-10 text-primary-container" />
        </motion.button>
        <p className="text-sm text-on-surface-muted">Tap to start recording</p>
        {error && <p className="text-xs text-error">{error}</p>}
        <button onClick={onCancel} className="text-xs text-on-surface-muted hover:text-on-surface">Cancel</button>
      </div>
    )
  }

  if (phase === 'transcribing') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-10 w-10 animate-spin text-primary-container" />
        <p className="text-sm text-on-surface-variant">Transcribing audio...</p>
        <p className="text-xs text-on-surface-muted">This takes 30-90 seconds depending on length</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          className="h-2 w-2 rounded-full bg-error"
        />
        <span className="text-xs font-medium tracking-widest text-error uppercase">Recording</span>
      </div>

      {/* Timer */}
      <div className="font-mono text-4xl font-light text-on-surface">{elapsedStr}</div>

      {/* Chunk health */}
      <div className="flex flex-wrap justify-center gap-1 max-w-xs min-h-4">
        {chunkStatuses.map((s, i) => <ChunkDot key={i} status={s} />)}
      </div>
      {chunkStatuses.some(s => s === 'error') && (
        <p className="text-xs text-tertiary-container text-center max-w-xs">
          Some audio chunks had upload errors. The transcript may have small gaps.
        </p>
      )}

      {/* Stop button */}
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={stopRecording}
        disabled={phase === 'stopping'}
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'rgba(220,38,38,0.15)', border: '2px solid rgba(220,38,38,0.5)' }}
      >
        {phase === 'stopping'
          ? <Loader2 className="h-6 w-6 animate-spin text-error" />
          : <Square className="h-6 w-6 text-error" fill="currentColor" />
        }
      </motion.button>
      <p className="text-xs text-on-surface-muted">Tap to stop</p>
    </div>
  )
}

// ─── Speaker label (editable) ────────────────────────────────────────────────
function SpeakerLabel({
  code, names, onRename,
}: { code: string | null; names: Record<string, string>; onRename: (code: string, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (!code) return null

  const display = names[code] || `Speaker ${code}`
  const color = speakerColor(code)

  if (editing) {
    return (
      <form
        onSubmit={e => {
          e.preventDefault()
          if (draft.trim()) onRename(code, draft.trim())
          setEditing(false)
        }}
        className="inline-flex items-center gap-1"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          autoFocus
          className="w-28 rounded bg-surface-container-high px-2 py-0.5 text-xs text-on-surface outline-none"
          onBlur={() => setEditing(false)}
          maxLength={40}
        />
        <button type="submit" className="text-primary-container"><Check className="h-3 w-3" /></button>
        <button type="button" onClick={() => setEditing(false)} className="text-on-surface-muted"><X className="h-3 w-3" /></button>
      </form>
    )
  }

  return (
    <button
      onClick={() => { setDraft(names[code] || `Speaker ${code}`); setEditing(true) }}
      className="inline-flex items-center gap-1 text-xs font-semibold hover:opacity-80"
      style={{ color }}
      title="Click to rename"
    >
      {display}
      <Pencil className="h-2.5 w-2.5 opacity-50" />
    </button>
  )
}

// ─── Transcript display ───────────────────────────────────────────────────────
const TranscriptView = memo(function TranscriptView({
  meeting, onSpeakerRename,
}: {
  meeting: Meeting
  onSpeakerRename: (code: string, name: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const transcript = meeting.transcript_json
  const speakerNames = meeting.speaker_names || {}

  const copyText = () => {
    const text = meeting.transcript_text || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const exportUrl = getExportUrl(meeting.id, 'md')

  return (
    <div className="flex flex-col gap-4">
      {/* Actions row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={copyText}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary-container" /> : <Copy className="h-3.5 w-3.5 text-on-surface-muted" />}
          <span className="text-on-surface-variant">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <a
          href={exportUrl}
          download
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Download className="h-3.5 w-3.5 text-on-surface-muted" />
          <span className="text-on-surface-variant">Export .md</span>
        </a>
      </div>

      {/* Diarisation banner when Whisper */}
      {transcript && !transcript.diarised && (
        <div
          className="rounded-lg px-3 py-2 text-xs text-tertiary-container"
          style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)' }}
        >
          Speaker separation requires Deepgram — provision <code className="text-tertiary-container">DEEPGRAM_API_KEY</code> to enable.
        </div>
      )}

      {/* Script body */}
      {transcript?.diarised && transcript.paragraphs?.length > 0 ? (
        <div className="flex flex-col gap-5">
          {transcript.paragraphs.map((seg, i) => (
            <ScriptLine
              key={i}
              seg={seg}
              names={speakerNames}
              onRename={onSpeakerRename}
            />
          ))}
        </div>
      ) : transcript?.paragraphs?.length ? (
        <div className="flex flex-col gap-4">
          {transcript.paragraphs.map((seg, i) => (
            <p key={i} className="text-sm leading-relaxed text-on-surface-variant">{seg.text}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap">
          {meeting.transcript_text || '(no transcript)'}
        </p>
      )}
    </div>
  )
})

function ScriptLine({
  seg, names, onRename,
}: { seg: TranscriptSegment; names: Record<string, string>; onRename: (code: string, name: string) => void }) {
  const color = speakerColor(seg.speaker)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <SpeakerLabel code={seg.speaker} names={names} onRename={onRename} />
        {(seg.start_ms > 0 || seg.end_ms > 0) && (
          <span className="text-xs text-on-surface-muted">
            {fmtMs(seg.start_ms)} - {fmtMs(seg.end_ms)}
          </span>
        )}
      </div>
      <p
        className="pl-3 text-sm leading-relaxed text-on-surface-variant"
        style={{ borderLeft: `2px solid ${color}40` }}
      >
        {seg.text}
      </p>
    </div>
  )
}

// ─── Meeting list item ────────────────────────────────────────────────────────
function MeetingRow({ meeting, selected, onClick }: { meeting: Meeting; selected: boolean; onClick: () => void }) {
  const preview = meeting.transcript_text?.slice(0, 80) || ''
  const statusColor =
    meeting.transcription_status === 'done' ? '#2ECC71' :
    meeting.transcription_status === 'error' ? '#DC2626' :
    meeting.transcription_status === 'processing' ? '#F59E0B' :
    '#666'

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl px-4 py-3 text-left transition-colors"
      style={{
        background: selected ? 'rgba(27,122,61,0.12)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(46,204,113,0.25)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-on-surface truncate">{meeting.title || fmtDate(meeting.started_at)}</span>
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: statusColor }} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-on-surface-muted">
        <Clock className="h-3 w-3" />
        <span>{meeting.duration_seconds ? fmtDuration(meeting.duration_seconds) : fmtDate(meeting.started_at)}</span>
      </div>
      {preview && (
        <p className="mt-1.5 text-xs text-on-surface-muted line-clamp-2 leading-relaxed">{preview}</p>
      )}
    </button>
  )
}

// ─── Meeting detail panel ─────────────────────────────────────────────────────
function MeetingDetail({ meetingId, onBack }: { meetingId: string; onBack: () => void }) {
  const queryClient = useQueryClient()

  const { data: meeting, isLoading, isError } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => getMeeting(meetingId),
    refetchInterval: (data) => {
      const status = data?.state?.data?.transcription_status
      return (status === 'processing' || status === 'pending') ? 3000 : false
    },
  })

  const speakerMutation = useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) =>
      updateSpeakers(meetingId, { ...(meeting?.speaker_names || {}), [code]: name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  })

  const retranscribeMutation = useMutation({
    mutationFn: () => retranscribeMeeting(meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteMeeting(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] })
      onBack()
    },
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-on-surface-muted" />
    </div>
  )

  if (isError || !meeting) return (
    <div className="py-8 text-center text-sm text-error">Failed to load meeting.</div>
  )

  const isProcessing = meeting.transcription_status === 'processing' || meeting.transcription_status === 'pending'
  const isError2 = meeting.transcription_status === 'error'

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-on-surface-muted hover:text-on-surface">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-on-surface truncate">
            {meeting.title || fmtDate(meeting.started_at)}
          </p>
          <p className="text-xs text-on-surface-muted">
            {meeting.duration_seconds ? fmtDuration(meeting.duration_seconds) : fmtDate(meeting.started_at)}
            {meeting.transcript_engine && ` · ${meeting.transcript_engine}`}
            {meeting.transcript_diarised && ' · diarised'}
          </p>
        </div>
        <button
          onClick={() => { if (confirm('Delete this meeting?')) deleteMutation.mutate() }}
          className="text-on-surface-muted hover:text-error"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Loader2 className="h-4 w-4 animate-spin text-tertiary-container" />
          <span className="text-xs text-tertiary-container">Transcribing...</span>
        </div>
      )}

      {/* Error state */}
      {isError2 && (
        <div className="flex items-center justify-between rounded-lg px-3 py-2"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-error" />
            <span className="text-xs text-error">Transcription failed</span>
          </div>
          <button
            onClick={() => retranscribeMutation.mutate()}
            disabled={retranscribeMutation.isPending}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retranscribeMutation.isPending ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {/* Transcript */}
      {meeting.transcription_status === 'done' && (
        <TranscriptView
          meeting={meeting}
          onSpeakerRename={(code, name) => speakerMutation.mutate({ code, name })}
        />
      )}

      {/* Pending with no transcript */}
      {meeting.transcription_status === 'uploaded_awaiting_transcription' && (
        <div className="py-4 text-center text-sm text-on-surface-muted">
          Audio uploaded. Configure an API key to transcribe.
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MeetingsPage() {
  const [mode, setMode] = useState<'list' | 'recording' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: () => listMeetings(30),
    refetchInterval: mode === 'list' ? 15000 : false,
  })

  const meetings = data?.meetings || []

  const handleRecordDone = useCallback((id: string) => {
    queryClient.invalidateQueries({ queryKey: ['meetings'] })
    setSelectedId(id)
    setMode('detail')
  }, [queryClient])

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setMode('detail')
  }, [])

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ color: '#e0e0e0' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          {(mode === 'detail') && (
            <button onClick={() => setMode('list')} className="text-on-surface-muted hover:text-on-surface md:hidden">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-base font-semibold text-on-surface tracking-tight">Meetings</h1>
          {meetings.length > 0 && mode === 'list' && (
            <span className="text-xs text-on-surface-muted">({data?.total ?? meetings.length})</span>
          )}
        </div>
        {mode === 'list' && (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setMode('recording')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'rgba(27,122,61,0.2)', border: '1px solid rgba(46,204,113,0.3)', color: '#2ECC71' }}
          >
            <Mic className="h-3.5 w-3.5" />
            New Recording
          </motion.button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* List pane — always visible on md+, hidden on mobile when detail open */}
        <div
          className={`flex flex-col overflow-y-auto ${mode === 'detail' ? 'hidden md:flex' : 'flex'} md:w-72 md:flex-shrink-0 w-full`}
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          <AnimatePresence mode="wait">
            {mode === 'recording' ? (
              <motion.div
                key="recorder"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-4"
              >
                <Recorder
                  onDone={handleRecordDone}
                  onCancel={() => setMode('list')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-2 p-3"
              >
                {isLoading && (
                  <div className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-on-surface-muted" />
                  </div>
                )}
                {!isLoading && meetings.length === 0 && (
                  <div className="py-12 text-center">
                    <MicOff className="mx-auto mb-3 h-8 w-8 text-on-surface-muted opacity-40" />
                    <p className="text-sm text-on-surface-muted">No recordings yet.</p>
                    <p className="mt-1 text-xs text-on-surface-muted">Tap New Recording to start.</p>
                  </div>
                )}
                {meetings.map(m => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    selected={m.id === selectedId}
                    onClick={() => handleSelect(m.id)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Detail pane */}
        <div className={`flex-1 overflow-y-auto p-5 ${mode !== 'detail' ? 'hidden md:block' : ''}`}>
          <AnimatePresence mode="wait">
            {mode === 'detail' && selectedId ? (
              <motion.div
                key={selectedId}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <MeetingDetail
                  meetingId={selectedId}
                  onBack={() => setMode('list')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                className="flex h-full items-center justify-center"
              >
                <div className="text-center">
                  <FileText className="mx-auto mb-3 h-10 w-10 text-on-surface-muted" />
                  <p className="text-sm text-on-surface-muted">Select a meeting to view its transcript</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
