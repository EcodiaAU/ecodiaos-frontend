import type { DownloadButtonBlock } from '@/types/cortex'
import { Download } from 'lucide-react'

// Resolve download URLs against the API origin so they hit the VPS,
// not the Vercel frontend (which would serve index.html via the SPA catch-all).
const API_BASE = import.meta.env.VITE_API_URL || '/api'
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

function resolveUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  return `${API_ORIGIN}${url}`
}

export function DownloadButton({ block }: { block: DownloadButtonBlock }) {
  return (
    <a
      href={resolveUrl(block.url)}
      download={block.filename}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2.5 rounded-2xl px-5 py-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'linear-gradient(135deg, rgba(27,122,61,0.20), rgba(46,204,113,0.10))',
        border: '1px solid rgba(46,204,113,0.28)',
        boxShadow: '0 4px 16px -4px rgba(27,122,61,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(95,232,157,0.18), rgba(95,232,157,0.08))',
          boxShadow: '0 0 12px rgba(95,232,157,0.18)',
        }}
      >
        <Download className="h-3.5 w-3.5" style={{ color: '#5FE89D' }} strokeWidth={1.75} />
      </div>
      <span className="text-sm font-medium" style={{ color: '#5FE89D' }}>
        {block.label}
      </span>
    </a>
  )
}
