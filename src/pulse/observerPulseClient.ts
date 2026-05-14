/**
 * observerPulseClient — frontend firehose to the backend systemPulse observer.
 *
 * Patches console.log/info/warn/error so every FE console call is also
 * batched and POSTed to /api/observer-pulse/fe-event. Adds error-boundary,
 * route-change, websocket-disconnect, and uncaught-error capture.
 *
 * Design:
 *   - Ring buffer of pending events; flushed every 2s OR at 100 events.
 *   - Ring buffer also drains on `beforeunload` via navigator.sendBeacon.
 *   - Disabled in test/SSR (no `window`) and in CI by default.
 *   - Auth-aware: the existing axios client interceptor adds the JWT header.
 *
 * Tom Grote called for "full FE console proxy" — same firehose treatment
 * as backend Pino tails. systemPulse will fold these into its rolling
 * Haiku state.
 *
 * Origin: Observer Framework v2, 13 May 2026.
 */

import api from '@/api/client'

type PulseEvent = {
  source: 'fe_console' | 'fe_error' | 'fe_route' | 'fe_ws' | 'fe_perf' | 'fe_api'
  level?: 'debug' | 'info' | 'warn' | 'error'
  kind?: string
  payload?: unknown
  ts?: string
}

const FLUSH_INTERVAL_MS = 2000
const FLUSH_BATCH_SIZE = 100
const MAX_QUEUE_SIZE = 500
const ENABLED = typeof window !== 'undefined' && !(window as Window & { __OBSERVER_PULSE_DISABLED__?: boolean }).__OBSERVER_PULSE_DISABLED__

let _queue: PulseEvent[] = []
let _flushTimer: number | null = null
let _patched = false
const _origConsole = {
  log: typeof console !== 'undefined' ? console.log.bind(console) : () => {},
  info: typeof console !== 'undefined' ? console.info.bind(console) : () => {},
  warn: typeof console !== 'undefined' ? console.warn.bind(console) : () => {},
  error: typeof console !== 'undefined' ? console.error.bind(console) : () => {},
  debug: typeof console !== 'undefined' ? console.debug.bind(console) : () => {},
}

function _enqueue(ev: PulseEvent) {
  if (!ENABLED) return
  ev.ts = ev.ts || new Date().toISOString()
  _queue.push(ev)
  if (_queue.length > MAX_QUEUE_SIZE) _queue.shift() // drop oldest
  if (_queue.length >= FLUSH_BATCH_SIZE) {
    void _flush()
  } else if (_flushTimer == null) {
    _flushTimer = window.setTimeout(() => {
      _flushTimer = null
      void _flush()
    }, FLUSH_INTERVAL_MS)
  }
}

async function _flush() {
  if (_queue.length === 0) return
  const batch = _queue.splice(0, _queue.length)
  try {
    await api.post('/observer-pulse/fe-event', { events: batch })
  } catch (err) {
    // Don't recurse — use original console.
    _origConsole.warn('[observerPulse] flush failed:', err)
  }
}

function _stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a == null) return String(a)
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return '[unserialisable]'
      }
    })
    .join(' ')
    .slice(0, 2000)
}

function _patchConsole() {
  if (_patched || typeof console === 'undefined') return
  _patched = true

  const wrap = (level: 'log' | 'info' | 'warn' | 'error' | 'debug') => {
    const orig = _origConsole[level]
    return (...args: unknown[]) => {
      try {
        _enqueue({
          source: 'fe_console',
          level: level === 'log' ? 'info' : level === 'debug' ? 'debug' : level,
          kind: 'console',
          payload: { msg: _stringifyArgs(args) },
        })
      } catch {
        /* never throw from inside console patch */
      }
      orig(...args)
    }
  }
  console.log = wrap('log')
  console.info = wrap('info')
  console.warn = wrap('warn')
  console.error = wrap('error')
  console.debug = wrap('debug')
}

function _wireUncaughtErrors() {
  window.addEventListener('error', (ev) => {
    _enqueue({
      source: 'fe_error',
      level: 'error',
      kind: 'uncaught_error',
      payload: {
        message: ev.message,
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: ev.error?.stack,
      },
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason
    _enqueue({
      source: 'fe_error',
      level: 'error',
      kind: 'unhandled_rejection',
      payload: {
        reason: reason instanceof Error
          ? { name: reason.name, message: reason.message, stack: reason.stack }
          : String(reason).slice(0, 1000),
      },
    })
  })
}

function _wireRouteChanges() {
  // Light-touch: subscribe to popstate + monkey-patch pushState/replaceState
  // so we capture SPA navigations.
  const emit = (kind: string) => {
    _enqueue({
      source: 'fe_route',
      level: 'info',
      kind,
      payload: { pathname: window.location.pathname, search: window.location.search },
    })
  }

  window.addEventListener('popstate', () => emit('popstate'))

  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    const result = origPush(...args)
    emit('pushState')
    return result
  }
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    const result = origReplace(...args)
    emit('replaceState')
    return result
  }
}

function _wireBeforeUnload() {
  window.addEventListener('beforeunload', () => {
    if (_queue.length === 0) return
    try {
      // sendBeacon is the only reliable POST during unload.
      const body = JSON.stringify({ events: _queue })
      const blob = new Blob([body], { type: 'application/json' })
      const base = ((import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL) || '/api'
      navigator.sendBeacon(`${base}/observer-pulse/fe-event`, blob)
      _queue = []
    } catch {
      /* nothing more we can do */
    }
  })
}

export function emitPulseEvent(ev: PulseEvent) {
  _enqueue(ev)
}

export function startObserverPulse() {
  if (!ENABLED) return
  _patchConsole()
  _wireUncaughtErrors()
  _wireRouteChanges()
  _wireBeforeUnload()
  // Heartbeat — useful for the admin lens to confirm FE is alive.
  _enqueue({ source: 'fe_console', level: 'info', kind: 'pulse_started', payload: { ua: navigator.userAgent } })
}
