import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { useAuthStore } from './store/authStore'
import { SceneErrorBoundary } from './components/shared/SceneErrorBoundary'

const CortexAmbientPage = lazy(() => import('./pages/CortexAmbient'))
const LoginPage = lazy(() => import('./pages/Login'))

function SceneSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ position: 'absolute', inset: 0, background: '#06070a' }} />}>
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
          <Route index element={<Scene name="CortexAmbient"><CortexAmbientPage /></Scene>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
