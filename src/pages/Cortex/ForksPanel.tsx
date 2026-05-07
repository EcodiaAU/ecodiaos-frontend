/**
 * ForksPanel — lightweight fork status display for the holographic deck.
 * Floats in 3D space beside the main chat.
 */
import { motion } from 'framer-motion'
import type { ForkSnapshot } from '@/store/forksStore'

interface Props {
  forks: ForkSnapshot[]
}

export default function ForksPanel({ forks }: Props) {
  return (
    <div className="h-full flex flex-col gap-2 overflow-y-auto py-2 pr-2">
      <div
        className="text-[9px] uppercase tracking-[0.15em] px-3 py-2"
        style={{ color: 'rgba(255,255,255,0.30)' }}
      >
        {forks.length} fork{forks.length !== 1 ? 's' : ''} active
      </div>
      {forks.map(fork => (
        <motion.div
          key={fork.fork_id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-md px-3 py-2.5"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <motion.div
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(46,204,113,0.80)' }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.60)' }}>
              {fork.fork_id.slice(0, 8)}
            </span>
          </div>
          {fork.position && (
            <p className="text-[11px] leading-relaxed truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {fork.position}
            </p>
          )}
          <p className="text-[10px] mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {fork.tool_calls} tools · {fork.tokens_input + fork.tokens_output} tok
          </p>
        </motion.div>
      ))}
    </div>
  )
}
