import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackText?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Message-scoped error boundary for individual chat bubbles.
 *
 * ReactMarkdown can throw on pathological input (unbalanced code fences,
 * malformed tables, very large blobs). Without a local boundary, a single
 * bad message takes down the entire Cortex route via SceneErrorBoundary.
 *
 * This boundary falls back to rendering the raw text so the conversation
 * keeps flowing even when one message can't be parsed as markdown.
 */
export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="cortex-prose text-sm leading-[1.85] text-on-surface-variant">
          <p className="whitespace-pre-wrap">{this.props.fallbackText || '(message could not be rendered — raw text below)'}</p>
          <p className="mt-2 text-[10px] font-mono text-on-surface-muted/40">
            render error: {this.state.error?.message}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
