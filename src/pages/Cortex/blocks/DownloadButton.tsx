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
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <Download className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.60)' }} strokeWidth={1.5} />
      <span className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
        {block.label}
      </span>
    </a>
  )
}
