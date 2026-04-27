import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { Check, Copy } from 'lucide-react'
import { MarkdownLink } from '@/components/shared/MarkdownLink'
import type { TextBlock as TextBlockType } from '@/types/cortex'

const STRIP_TAGS = ['analysis', 'thinking', 'scratchpad', 'reasoning', 'reflection', 'summary', 'aside', 'plan', 'inner_monologue']
const STRIP_TAGS_RE = new RegExp(`</?(?:${STRIP_TAGS.join('|')})\\b[^>]*>`, 'gi')

// Minimal dark theme tuned to our light surface bg
const codeTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': {
    color: '#e2e8f0',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '0.8rem',
    lineHeight: '1.7',
  },
  'pre[class*="language-"]': {
    background: 'transparent',
    margin: 0,
    padding: 0,
    overflow: 'auto',
  },
  comment: { color: '#64748b', fontStyle: 'italic' },
  prolog: { color: '#64748b' },
  punctuation: { color: '#94a3b8' },
  property: { color: '#7dd3fc' },
  tag: { color: '#f472b6' },
  'attr-name': { color: '#a5f3fc' },
  'attr-value': { color: '#86efac' },
  string: { color: '#86efac' },
  boolean: { color: '#fb923c' },
  number: { color: '#fb923c' },
  keyword: { color: '#c084fc' },
  operator: { color: '#94a3b8' },
  function: { color: '#7dd3fc' },
  'class-name': { color: '#f9a8d4' },
  variable: { color: '#e2e8f0' },
  builtin: { color: '#fb923c' },
  selector: { color: '#f472b6' },
  atrule: { color: '#c084fc' },
  regex: { color: '#86efac' },
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all
        text-slate-400 hover:text-slate-200 hover:bg-white/5 active:scale-95"
    >
      {copied
        ? <><Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />Copied</>
        : <><Copy className="h-3 w-3" strokeWidth={1.75} />Copy</>
      }
    </button>
  )
}

export function TextBlock({ block }: { block: TextBlockType }) {
  const sanitisedContent = (block.content ?? '').replace(STRIP_TAGS_RE, '')
  return (
    <div className="
      text-sm leading-[1.8] text-on-surface-variant
      [&_p]:my-0
      [&_p+p]:mt-3
      [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5
      [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
      [&_li>p]:my-0
      [&_strong]:text-on-surface [&_strong]:font-semibold
      [&_em]:text-on-surface/80
      [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary [&_a]:transition-colors
      [&_blockquote]:border-l-2 [&_blockquote]:border-primary/25 [&_blockquote]:pl-4 [&_blockquote]:text-on-surface-muted [&_blockquote]:italic
      [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-on-surface [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:leading-snug
      [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-on-surface [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:leading-snug
      [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-on-surface/80 [&_h3]:mt-3 [&_h3]:mb-1
      [&_hr]:border-none [&_hr]:h-px [&_hr]:bg-black/6 [&_hr]:my-5
      [&_img]:rounded-xl [&_img]:max-w-full [&_img]:my-3
      ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => url}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeStr = String(children).replace(/\n$/, '')
            const isBlock = !!className

            // HTML preview — render as sandboxed iframe with macOS chrome
            if (match?.[1] === 'html' && isBlock && codeStr.includes('<')) {
              return (
                <div className="my-3 rounded-xl overflow-hidden border border-white/[0.08]" style={{ background: '#1a1a1a' }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]" style={{ background: '#2a2a2a' }}>
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                      <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                      <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
                    </div>
                    <span className="font-mono text-[10px] text-white/30 ml-2 flex-1">Preview</span>
                    <CopyButton text={codeStr} />
                  </div>
                  <iframe
                    srcDoc={codeStr}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ minHeight: '400px', maxHeight: '80vh', background: '#fff' }}
                    onLoad={(e) => {
                      const frame = e.target as HTMLIFrameElement
                      if (frame.contentDocument?.body) {
                        frame.style.height = Math.min(frame.contentDocument.body.scrollHeight + 20, window.innerHeight * 0.8) + 'px'
                      }
                    }}
                  />
                </div>
              )
            }

            if (match && isBlock) {
              return (
                <div className="my-3 rounded-xl overflow-hidden" style={{ background: '#0f172a' }}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                    <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                      {match[1]}
                    </span>
                    <CopyButton text={codeStr} />
                  </div>
                  <div className="px-4 py-3 overflow-x-auto">
                    <SyntaxHighlighter
                      language={match[1]}
                      style={codeTheme}
                      PreTag="div"
                      customStyle={{ margin: 0, padding: 0, background: 'transparent' }}
                      codeTagProps={{ style: { fontFamily: 'JetBrains Mono, monospace' } }}
                    >
                      {codeStr}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )
            }

            // Unfenced code block fallback (no language)
            if (isBlock) {
              return (
                <div className="my-3 rounded-xl overflow-hidden" style={{ background: '#0f172a' }}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                    <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">code</span>
                    <CopyButton text={codeStr} />
                  </div>
                  <div className="px-4 py-3 overflow-x-auto">
                    <pre className="font-mono text-[0.8rem] leading-[1.7] text-slate-300 whitespace-pre">{codeStr}</pre>
                  </div>
                </div>
              )
            }

            // Inline code
            return (
              <code
                className="rounded-md bg-black/6 px-1.5 py-0.5 font-mono text-[0.78em] text-primary/90 border border-black/5"
                {...props}
              >
                {children}
              </code>
            )
          },

          img({ src, alt }) {
            return (
              <span className="block my-3">
                <img
                  src={src}
                  alt={alt ?? ''}
                  className="rounded-xl max-w-full max-h-96 object-contain"
                  loading="lazy"
                />
                {alt && (
                  <span className="block mt-1.5 text-center font-mono text-[10px] text-on-surface-muted/50">
                    {alt}
                  </span>
                )}
              </span>
            )
          },

          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-xl border border-black/6">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            )
          },

          th({ children }) {
            return (
              <th className="text-left font-medium text-on-surface py-2 px-3 border-b border-black/8 bg-black/[0.02]">
                {children}
              </th>
            )
          },

          td({ children }) {
            return (
              <td className="py-2 px-3 border-b border-black/4 text-on-surface-variant">
                {children}
              </td>
            )
          },

          a: MarkdownLink,
        }}
      >
        {sanitisedContent}
      </ReactMarkdown>
    </div>
  )
}
