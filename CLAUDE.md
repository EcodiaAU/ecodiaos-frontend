# Ecodia OS — Frontend

Spatial, autonomous command center for Ecodia Pty Ltd. React 18 + TS + Vite + Zustand + TanStack Query + Tailwind + Framer Motion. Deployed on Vercel.

## The two absolutes
1. **Only two write surfaces exist:** Cortex (conversational) + ActionStream (approve/dismiss). Every other page is a **lens** — observational only. No forms, no sync buttons, no trigger buttons on pages.
2. **The system runs itself.** Workers auto-poll. Cortex creates things. Pages just reflect.

## Aesthetic in one line
Translucent sanctuary — 90% negative space, tonal-opacity glass (no `backdrop-filter`), prismatic aurora washes, Framer Motion spring physics (never linear easing), `#F9F9F9` base (never pure white/black).

## When you need detail
The full design bible (colors, typography, spacing, motion tokens, component specs, page intents, anti-patterns, backend contract) lives in [.claude/EcodiaOS_Spec_Frontend.md](../.claude/EcodiaOS_Spec_Frontend.md). Read it when building anything non-trivial; don't rely on memory of it.

## Dev
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- API base: [src/api/client.ts](src/api/client.ts) (Axios + auth interceptor)
- Auth: JWT in Zustand `authStore`
- WebSocket: `useWebSocket` in `AppShell`
- New page: add route in `App.tsx`, create dir in `src/pages/`, co-locate sub-components
