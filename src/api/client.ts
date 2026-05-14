import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Singleton refresh promise. Parallel 401s share one refresh call so we don't
// invalidate the refresh-token rotation by firing N concurrent /auth/refresh
// requests, and don't replay each request with stale Authorization headers.
let _refreshPromise: Promise<string> | null = null

function refreshOnce(): Promise<string> {
  if (_refreshPromise) return _refreshPromise
  const { refreshToken, setToken, logout } = useAuthStore.getState()
  if (!refreshToken) {
    logout()
    return Promise.reject(new Error('no refresh token'))
  }
  _refreshPromise = axios
    .post(`${API_BASE}/auth/refresh`, { refreshToken })
    .then((r) => {
      const newToken = r.data?.token
      if (!newToken) throw new Error('refresh response missing token')
      setToken(newToken)
      return newToken as string
    })
    .catch((err) => {
      logout()
      throw err
    })
    .finally(() => {
      _refreshPromise = null
    })
  return _refreshPromise
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Observer Framework v2: forward API errors to systemPulse via the pulse
    // ingestion endpoint. Skip pulse-event POSTs themselves to avoid loops.
    try {
      const url = String(err.config?.url || '')
      if (!url.includes('/observer-pulse/fe-event')) {
        const status = err.response?.status
        const m = await import('@/pulse/observerPulseClient')
        m.emitPulseEvent({
          source: 'fe_api',
          level: status && status >= 500 ? 'error' : 'warn',
          kind: status === 401 ? 'auth_expired' : 'api_error',
          payload: {
            method: err.config?.method,
            url,
            status,
            message: err.message,
          },
        })
      }
    } catch { /* never throw from interceptor */ }

    if (err.response?.status === 401 && !err.config?._retried) {
      try {
        const newToken = await refreshOnce()
        // Mark to prevent infinite retry loop if backend keeps 401-ing.
        err.config._retried = true
        err.config.headers = err.config.headers || {}
        err.config.headers.Authorization = `Bearer ${newToken}`
        return api(err.config)
      } catch {
        // refreshOnce already called logout()
      }
    }
    return Promise.reject(err)
  },
)

export default api
