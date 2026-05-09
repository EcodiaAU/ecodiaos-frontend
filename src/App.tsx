import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './store/authStore'
import { SceneErrorBoundary } from './components/shared/SceneErrorBoundary'
import { motion } from 'framer-motion'

// ─── Code-split every route-level page ──────────────────────────────────
// `/` is now the ambient cortex page (Tate 17:39 AEST 9 May 2026).
// CortexPage (legacy workspace shell) is no longer route-bound; the file
// stays on disk under ./pages/Cortex for safety/rollback but is not imported.
const CortexAmbientPage = lazy(() => import('./pages/CortexAmbient'))
const RescuePage = lazy(() => import('./pages/Rescue'))
const LoginPage = lazy(() => import('./pages/Login'))
const VoicePage = lazy(() => import('./pages/Voice'))

/** Ambient loading state — a soft breathing glow, not a spinner */
function SceneSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex h-[50vh] items-center justify-center"
        >
          <motion.div
            animate={{ opacity: [0.15, 0.3, 0.15] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            className="h-2 w-2 rounded-full bg-primary"
          />
        </motion.div>
      }
    >
      {children}
    </Suspense>
  )
}

/** Wrap a page with error boundary + suspense */
function Scene({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <SceneErrorBoundary sceneName={name}>
      <SceneSuspense>{children}</SceneSuspense>
    </SceneErrorBoundary>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<SceneSuspense><LoginPage /></SceneSuspense>} />
        {/* /voice — public mobile mic streamer (no auth gate; backend
            decides whether to accept anonymous chunks). Lives outside the
            AppShell so it renders full-bleed on mobile. */}
        <Route path="/voice" element={<SceneSuspense><VoicePage /></SceneSuspense>} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          {/* `/` is the ambient cortex page — Tate verbatim 17:39 AEST 9 May 2026:
              "EOS fe main and only page should be this ambient cortex page again,
               so the app defaults to it". */}
          <Route index element={<Scene name="CortexAmbient"><CortexAmbientPage /></Scene>} />
          {/* /cortex-ambient kept as explicit alias for any inbound link */}
          <Route path="/cortex-ambient" element={<Scene name="CortexAmbient"><CortexAmbientPage /></Scene>} />
          {/* /cortex (legacy workspace shell) redirects to / */}
          <Route path="/cortex" element={<Navigate to="/" replace />} />
          <Route path="/rescue" element={<Scene name="Rescue"><RescuePage /></Scene>} />
          <Route path="/settings" element={<Navigate to="/" replace />} />
          {/* All old standalone pages redirect to / (ambient) */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/gmail" element={<Navigate to="/" replace />} />
          <Route path="/linkedin" element={<Navigate to="/" replace />} />
          <Route path="/crm" element={<Navigate to="/" replace />} />
          <Route path="/crm/:clientId" element={<Navigate to="/" replace />} />
          <Route path="/bookkeeping" element={<Navigate to="/" replace />} />
          <Route path="/codebase" element={<Navigate to="/" replace />} />
          <Route path="/knowledge-graph" element={<Navigate to="/" replace />} />
          <Route path="/momentum" element={<Navigate to="/" replace />} />
          <Route path="/coding" element={<Navigate to="/" replace />} />
          <Route path="/factory-dev" element={<Navigate to="/" replace />} />
          <Route path="/finance" element={<Navigate to="/" replace />} />
          <Route path="/kg-explorer" element={<Navigate to="/" replace />} />
          <Route path="/workspace" element={<Navigate to="/" replace />} />
          <Route path="/claude-code" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
