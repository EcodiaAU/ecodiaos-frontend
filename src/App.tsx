import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './store/authStore'
import { SceneErrorBoundary } from './components/shared/SceneErrorBoundary'
import { motion } from 'framer-motion'

// ─── Code-split every route-level page ──────────────────────────────────
// All workspace pages are now consolidated inside Cortex as tabs.
const CortexPage = lazy(() => import('./pages/Cortex'))
const RescuePage = lazy(() => import('./pages/Rescue'))
const LoginPage = lazy(() => import('./pages/Login'))

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
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/cortex" />} />
          <Route path="/cortex" element={<Scene name="Cortex"><CortexPage /></Scene>} />
          <Route path="/rescue" element={<Scene name="Rescue"><RescuePage /></Scene>} />
          <Route path="/settings" element={<Navigate to="/cortex" replace />} />
          {/* All old standalone pages redirect to Cortex with workspace param */}
          <Route path="/dashboard" element={<Navigate to="/cortex?ws=vitals" replace />} />
          <Route path="/gmail" element={<Navigate to="/cortex?ws=socials" replace />} />
          <Route path="/linkedin" element={<Navigate to="/cortex?ws=socials" replace />} />
          <Route path="/crm" element={<Navigate to="/cortex?ws=crm" replace />} />
          <Route path="/crm/:clientId" element={<Navigate to="/cortex?ws=crm" replace />} />
          <Route path="/bookkeeping" element={<Navigate to="/cortex?ws=bookkeeping" replace />} />
          <Route path="/codebase" element={<Navigate to="/cortex?ws=coding" replace />} />
          <Route path="/knowledge-graph" element={<Navigate to="/cortex?ws=memory" replace />} />
          <Route path="/momentum" element={<Navigate to="/cortex?ws=momentum" replace />} />
          <Route path="/coding" element={<Navigate to="/cortex?ws=coding" replace />} />
          <Route path="/factory-dev" element={<Navigate to="/cortex?ws=coding" replace />} />
          <Route path="/finance" element={<Navigate to="/cortex?ws=bookkeeping" replace />} />
          <Route path="/kg-explorer" element={<Navigate to="/cortex?ws=memory" replace />} />
          <Route path="/workspace" element={<Navigate to="/cortex?ws=admin" replace />} />
          <Route path="/claude-code" element={<Navigate to="/cortex?ws=admin" replace />} />
          <Route path="*" element={<Navigate to="/cortex" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
