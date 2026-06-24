/**
 * ErrorBoundary — stops a single component's render-time throw from blanking the
 * whole app (white screen). Also handles the common "stale chunk after deploy"
 * case: a lazy import() whose hashed chunk no longer exists rejects here, and we
 * offer a one-click reload (or auto-reload once) instead of a dead screen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

const CHUNK_RE = /(ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch)/i

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Stale lazy-chunk after a redeploy → reload once to fetch the new chunks.
    if (CHUNK_RE.test(error.message) && !sessionStorage.getItem('gr3d_chunk_reloaded')) {
      sessionStorage.setItem('gr3d_chunk_reloaded', '1')
      window.location.reload()
      return
    }
    console.error('[Gerador3D] erro de renderização:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-300">
        <p className="text-lg font-semibold text-white">Algo deu errado nesta tela.</p>
        <p className="max-w-md text-sm text-slate-400">
          O resto do app continua funcionando. Recarregue para tentar de novo. Se persistir,
          me diga o que estava fazendo.
        </p>
        <pre className="max-h-32 max-w-md overflow-auto rounded-lg bg-black/40 p-3 text-left text-[11px] text-slate-500">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          Recarregar
        </button>
      </div>
    )
  }
}
