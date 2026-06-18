/**
 * useLocalReadiness — reads the local engine diagnostics (desktop app only) so
 * pages can show whether generation/rigging are installed and guide the user to
 * the Setup page instead of dead-ending. No-op (returns null) in the cloud build.
 */
import { useEffect, useState } from 'react'
import { IS_LOCAL } from './runtime'
import { localDiagnostics, type LocalDiagnostics } from './local-api'

export function useLocalReadiness(pollMs = 0): LocalDiagnostics | null {
  const [diag, setDiag] = useState<LocalDiagnostics | null>(null)

  useEffect(() => {
    if (!IS_LOCAL) return
    let stop = false
    const tick = () => {
      void localDiagnostics().then((d) => { if (!stop) setDiag(d) }).catch(() => {})
    }
    tick()
    if (pollMs > 0) {
      const timer = setInterval(tick, pollMs)
      return () => { stop = true; clearInterval(timer) }
    }
    return () => { stop = true }
  }, [pollMs])

  return diag
}
