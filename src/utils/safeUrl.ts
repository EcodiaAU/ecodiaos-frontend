// URL transform for ReactMarkdown that blocks XSS vectors but allows the
// custom `download://` protocol the OS uses for inline download buttons.
const DANGEROUS = /^(\s*(javascript|vbscript|file|about):)/i

export function safeUrl(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (DANGEROUS.test(trimmed)) return ''
  if (/^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed)) return ''
  return trimmed
}
