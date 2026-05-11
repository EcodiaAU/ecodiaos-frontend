import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Square } from 'lucide-react'
import { useVoiceRecorder, pickMimeType } from '@/hooks/useVoiceRecorder'

/**
 * /voice — mobile-first record-and-stream Whisper UI.
 *
 * Diagnostic fallback surface. The primary voice entry point is now the
 * MicButton integrated directly into the conductor chat input panel.
 *
 * Refactored (fork_mp1sxm2q_898560) to use the shared useVoiceRecorder()
 * hook from src/hooks/useVoiceRecorder.ts. Recording + chunk-upload logic
 * lives in the hook; this page handles its own transcript list display.
 *
 * Uses persistSessionId: true so the session ID survives page refreshes
 * (original /voice behaviour).
 */

interface TranscriptItem {
  seq: number
  ts: string
  text: string
  dropped: boolean
}

export default function VoicePage() {
  const [transcript, setTranscript] = useState<TranscriptItem[]>([])

  const appendTranscript = useCallback((item: TranscriptItem) => {
    setTranscript((prev) => {
      const next = [...prev, item]
      return next.slice(-200) // bound memory; UI shows last 10
    })
  }, [])

  const {
    state,
    audioLevel,
    chunkCount,
    dropCount,
    error,
    sessionId,
    startRecording,
    stopRecording,
  } = useVoiceRecorder({
    persistSessionId: true,
    onChunkTranscribed: ({ seq, ts, text, dropped }) => {
      appendTranscript({ seq, ts, text: dropped ? '[silence dropped]' : text, dropped })
    },
  })

  const recording = state === 'recording'

  const statusLabel = (() => {
    switch (state) {
      case 'recording': return `Recording… (chunk ${chunkCount})`
      case 'stopping': return 'Stopping…'
      case 'error': return error ? `Error: ${error}` : 'Error'
      default: return 'Idle'
    }
  })()

  const recentTranscript = transcript.slice(-10)
  const sessionShort = sessionId ? sessionId.slice(0, 8) : '…'
  const levelPct = Math.min(100, Math.round(audioLevel * 200))
  const mime = pickMimeType()

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-5 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white/90">/voice</h1>
          <span className="text-xs text-white/40">whisper-stream · diagnostic</span>
        </header>

        {/* Record button */}
        <div className="flex flex-col items-center justify-center pt-6">
          <motion.button
            type="button"
            onClick={recording ? stopRecording : () => { void startRecording() }}
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
            {statusLabel}
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
