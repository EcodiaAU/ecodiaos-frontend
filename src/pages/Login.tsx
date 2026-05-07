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
            radial-gradient(ellipse 60% 60% at 50% 50%, rgba(46, 204, 113, 0.04), transparent)
          `,
        }}
      />
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 80, damping: 20, mass: 1 }}
        className="relative z-10 w-full max-w-xs rounded-lg p-8"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="mb-8">
          <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Ecodia OS
          </span>
        </div>

        <input
          type="password"
          placeholder=""
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-transparent px-0 py-2 text-sm text-on-surface placeholder-on-surface-muted/30 outline-none"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}
          autoFocus
        />

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 w-full rounded-md px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-20"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.80)',
          }}
        >
          {loading ? '...' : 'Enter'}
        </button>
      </motion.form>
    </div>
  )
}
