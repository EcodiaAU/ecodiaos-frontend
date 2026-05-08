import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Mic, Square } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

/**
 * /voice — mobile-first record-and-stream Whisper UI.
 *
 * Captures mic via MediaRecorder, slices into 5s chunks, POSTs each chunk
 * as multipart/form-data to /api/voice/chunk. Backend transcribes via
 * Whisper, returns text or {dropped:true} for silence.
 *
 * iOS Safari: needs user gesture (the Record button click is the gesture).
 * Falls back through mime types: webm/opus → webm → mp4 → ogg.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
] as const

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return null
  }
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* noop */
    }
  }
  return null
}

function uuidv4(): string {
  // RFC4122 v4. Browsers without crypto.randomUUID get a Math.random fallback.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}

function getOrCreateSessionId(): string {
  try {
    const k = 'ecodia.voice.sessionId'
    const existing = window.localStorage.getItem(k)
    if (existing && existing.length > 8) return existing
    const fresh = uuidv4()
    window.localStorage.setItem(k, fresh)
    return fresh
  } catch {
    return uuidv4()
  }
}

interface QueueItem {
  blob: Blob
  seq: number
  ts: string
  attempts: number
}

interface TranscriptItem {
  seq: number
  ts: string
  text: string
  dropped: boolean
}

export default function VoicePage() {
  const [sessionId, setSessionId] = useState<string>('')
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState<string>('Idle')
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])
  const [chunkCount, setChunkCount] = useState(0)
  const [dropCount, setDropCount] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [mime, setMime] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const seqRef = useRef(0)
  const queueRef = useRef<QueueItem[]>([])
  const drainingRef = useRef(false)
  const recordingRef = useRef(false)

  // Auth token: send as Bearer if present (api.admin.ecodia.au is auth-gated;
  // when /voice page is accessed unauthed, the page still loads and the
  // backend is expected to either allow public access for this endpoint
  // or accept anonymous chunks in dev). We attach Bearer when available.
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    setSessionId(getOrCreateSessionId())
    setMime(pickMimeType())
  }, [])

  const appendTranscript = useCallback((item: TranscriptItem) => {
    setTranscript((prev) => {
      const next = [...prev, item]
      // Keep last 200 to bound memory; UI shows last 10
      return next.slice(-200)
    })
  }, [])

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current[0]
        try {
          const fd = new FormData()
          const ext = (mime ?? '').includes('mp4')
            ? 'mp4'
            : (mime ?? '').includes('ogg')
              ? 'ogg'
              : 'webm'
          fd.append('audio', item.blob, `chunk-${item.seq}.${ext}`)
          fd.append('session_id', sessionId)
          fd.append('seq', String(item.seq))
          fd.append('timestamp', item.ts)
          if (mime) fd.append('mime', mime)

          const headers: Record<string, string> = {}
          if (token) headers.Authorization = `Bearer ${token}`

          const res = await fetch(`${API_BASE}/voice/chunk`, {
            method: 'POST',
            body: fd,
            headers,
          })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = (await res.json().catch(() => ({}))) as {
            dropped?: boolean
            text?: string
            transcript?: string
          }
          const text = data.text ?? data.transcript ?? ''
          const dropped = !!data.dropped || (!text && !data.text && !data.transcript)
          if (dropped) {
            setDropCount((c) => c + 1)
            appendTranscript({
              seq: item.seq,
              ts: item.ts,
              text: '[silence dropped]',
              dropped: true,
            })
            setStatus(`Sent: [silence dropped] (chunk ${item.seq})`)
          } else {
            appendTranscript({ seq: item.seq, ts: item.ts, text, dropped: false })
            const preview = text.length > 60 ? text.slice(0, 57) + '…' : text
            setStatus(`Sent: "${preview}"`)
          }
          queueRef.current.shift()
          setError(null)
        } catch (e) {
          item.attempts += 1
          if (item.attempts === 1) {
            setStatus('Network error — retrying')
            setError((e as Error).message)
            await new Promise((r) => setTimeout(r, 2000))
            continue
          }
          // Drop after 2 attempts to avoid infinite blocking; keep recording.
          setError((e as Error).message)
          setStatus(`Network error — chunk ${item.seq} skipped, still recording`)
          queueRef.current.shift()
          break
        }
      }
    } finally {
      drainingRef.current = false
    }
  }, [appendTranscript, mime, sessionId, token])

  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      analyserRef.current = analyser
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length) / 255
        setAudioLevel(rms)
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      /* level meter is optional */
    }
  }, [])

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    analyserRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setAudioLevel(0)
  }, [])

  const handleStart = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone API not available in this browser')
      setStatus('Mic unavailable')
      return
    }
    const chosen = pickMimeType()
    if (!chosen) {
      setError('No supported audio mime type for MediaRecorder')
      setStatus('Mic unavailable')
      return
    }
    setMime(chosen)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream, { mimeType: chosen })
      recorderRef.current = mr
      seqRef.current = 0
      setChunkCount(0)
      setDropCount(0)
      mr.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return
        const seq = seqRef.current++
        const item: QueueItem = {
          blob: ev.data,
          seq,
          ts: new Date().toISOString(),
          attempts: 0,
        }
        queueRef.current.push(item)
        setChunkCount(seqRef.current)
        setStatus(`Recording… (chunk ${seq})`)
        // fire and forget — drainQueue is internally serialised
        drainQueue()
      }
      mr.onerror = (ev) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errLike = ev as any
        setError(`MediaRecorder error: ${errLike?.error?.message ?? 'unknown'}`)
      }
      mr.start(5000) // 5s timeslice
      recordingRef.current = true
      setRecording(true)
      setStatus('Recording… (chunk 0)')
      startLevelMeter(stream)
    } catch (e) {
      setError((e as Error).message)
      setStatus('Mic permission denied or unavailable')
    }
  }, [drainQueue, startLevelMeter])

  const handleStop = useCallback(() => {
    recordingRef.current = false
    setRecording(false)
    setStatus('Stopping…')
    try {
      const mr = recorderRef.current
      if (mr && mr.state !== 'inactive') {
        mr.stop()
      }
    } catch {
      /* noop */
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
    stopLevelMeter()
    // Drain whatever remains; final ondataavailable fires before stop completes
    setTimeout(() => {
      drainQueue().finally(() => {
        setStatus('Stopped')
      })
    }, 50)
  }, [drainQueue, stopLevelMeter])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        const mr = recorderRef.current
        if (mr && mr.state !== 'inactive') mr.stop()
      } catch {
        /* noop */
      }
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop()
        streamRef.current = null
      }
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
    }
  }, [])

  const recentTranscript = transcript.slice(-10)
  const sessionShort = sessionId ? sessionId.slice(0, 8) : '…'
  const levelPct = Math.min(100, Math.round(audioLevel * 200))

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white/90">/voice</h1>
          <span className="text-xs text-white/40">whisper-stream</span>
        </header>

        {/* Record button */}
        <div className="flex flex-col items-center justify-center pt-6">
          <motion.button
            type="button"
            onClick={recording ? handleStop : handleStart}
            whileTap={{ scale: 0.96 }}
            className={[
              'relative flex items-center justify-center rounded-full',
              'h-[200px] w-[200px] select-none shadow-2xl',
              'transition-colors duration-300',
              recording
                ? 'bg-gradient-to-br from-red-500 to-red-700 ring-4 ring-red-500/30'
                : 'bg-gradient-to-br from-zinc-700 to-zinc-900 ring-2 ring-white/10',
            ].join(' ')}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? (
              <Square className="h-16 w-16 text-white" strokeWidth={2.5} />
            ) : (
              <Mic className="h-16 w-16 text-white/85" strokeWidth={2} />
            )}
            {recording && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full ring-4 ring-red-500/40"
                animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.button>

          {/* Status line */}
          <div className="mt-6 min-h-[1.5rem] text-center text-sm text-white/80">
            {status}
          </div>

          {/* Audio level bar */}
          <div className="mt-4 h-2 w-full max-w-[260px] overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-300"
              animate={{ width: `${levelPct}%` }}
              transition={{ duration: 0.05, ease: 'linear' }}
            />
          </div>

          {error && (
            <div className="mt-3 max-w-full break-words text-center text-xs text-red-300/80">
              {error}
            </div>
          )}
        </div>

        {/* Transcript */}
        <section className="mt-8 flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            Transcript (last 10)
          </h2>
          <div className="flex max-h-[40vh] flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-white/5 p-3">
            {recentTranscript.length === 0 ? (
              <div className="text-sm text-white/30">
                Press the mic to start. Audio streams in 5s chunks.
              </div>
            ) : (
              recentTranscript.map((t) => (
                <div
                  key={`${t.seq}-${t.ts}`}
                  className={[
                    'rounded-lg px-3 py-2 text-sm',
                    t.dropped ? 'bg-white/5 text-white/40' : 'bg-white/10 text-white/90',
                  ].join(' ')}
                >
                  <div className="text-[10px] uppercase tracking-wider text-white/30">
                    #{t.seq} · {new Date(t.ts).toLocaleTimeString()}
                  </div>
                  <div className="mt-0.5 break-words">{t.text}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-6 grid grid-cols-3 gap-2 text-[11px] text-white/40">
          <div>
            <div className="uppercase tracking-wider text-white/30">Session</div>
            <div className="font-mono text-white/60">{sessionShort}</div>
          </div>
          <div>
            <div className="uppercase tracking-wider text-white/30">Chunks</div>
            <div className="font-mono text-white/60">{chunkCount}</div>
          </div>
          <div>
            <div className="uppercase tracking-wider text-white/30">Drops</div>
            <div className="font-mono text-white/60">{dropCount}</div>
          </div>
        </footer>

        <div className="mt-4 text-center text-[10px] text-white/25">
          mime: {mime ?? '—'}
        </div>
      </div>
    </div>
  )
}
