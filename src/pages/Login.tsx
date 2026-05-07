import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import api from '@/api/client'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { password })
      login(data.token, data.refreshToken)
      navigate('/dashboard')
    } catch {
      toast.error('Invalid password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-surface">
      {/* Static aurora for login */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 80%, rgba(46, 204, 113, 0.14), transparent),
            radial-gradient(ellipse 60% 80% at 80% 20%, rgba(251, 191, 36, 0.12), transparent),
            radial-gradient(ellipse 50% 50% at 50% 50%, rgba(27, 122, 61, 0.08), transparent)
          `,
        }}
      />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 80, damping: 20, mass: 1 }}
        className="relative z-10 w-full max-w-sm glass-elevated rounded-3xl p-10"
      >
        <div className="mb-10">
          <span className="text-label-md font-display uppercase tracking-[0.2em] text-on-surface-muted">
            Ecodia OS
          </span>
          <h1 className="mt-3 font-display text-display-md font-light text-on-surface">
            Welcome
          </h1>
        </div>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-surface-container-low px-5 py-3 text-sm text-on-surface placeholder-on-surface-muted transition-colors focus:bg-surface-container-lowest focus:outline-none"
          autoFocus
        />

        <button
          type="submit"
          disabled={loading || !password}
          className="btn-primary-gradient mt-6 w-full rounded-2xl px-6 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          {loading ? 'Authenticating...' : 'Enter'}
        </button>
      </motion.form>
    </div>
  )
}
