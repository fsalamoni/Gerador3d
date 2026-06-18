/**
 * Job poller — drives the server-side poll for non-terminal jobs.
 *
 * The Cloud Function proxy (`pollJob3d`) is what actually advances a job: it
 * asks the provider (Meshy/Tripo) or the local worker for the latest status,
 * persists finished assets and writes the result back to Firestore. The browser
 * must call it on an interval — without this, every job created by the proxy
 * would stay stuck at "in_progress" forever (this was the missing piece that
 * prevented generation *and* rigging from ever completing).
 *
 * `subscribeJobs` (Firestore realtime) then reflects each advance into the UI,
 * so the poller only needs to nudge the proxy; it doesn't touch the UI state.
 */
import { useEffect } from 'react'
import { IS_FIREBASE } from './firebase'
import { IS_LOCAL } from './runtime'
import { pollJobOnce } from './generation-client'
import type { GenerationJob } from './firestore-types'

const TERMINAL = new Set(['succeeded', 'failed', 'canceled'])

/**
 * While mounted, poll every non-terminal job in `jobs` until it reaches a
 * terminal state. Safe in demo mode (no-op) and when there is nothing to poll.
 *
 * The effect re-arms only when the *set of active job ids* changes, so ordinary
 * progress updates don't restart the timer.
 */
export function useJobPolling(jobs: GenerationJob[], intervalMs = 4000): void {
  const activeIds = jobs.filter((j) => !TERMINAL.has(j.status)).map((j) => j.id)
  const key = activeIds.slice().sort().join(',')

  useEffect(() => {
    // In local mode the engine advances jobs itself and subscribeJobs polls the
    // store, so there is nothing to nudge here.
    if (IS_LOCAL || !IS_FIREBASE || activeIds.length === 0) return
    let stopped = false

    const poll = () => {
      for (const id of activeIds) {
        // Swallow per-job errors: the proxy already records failures in
        // Firestore, and one bad job shouldn't stop polling the others.
        void pollJobOnce(id).catch(() => {})
      }
    }

    poll() // immediate nudge so the bar starts moving without a 4s wait
    const timer = setInterval(() => {
      if (!stopped) poll()
    }, intervalMs)

    return () => {
      stopped = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intervalMs])
}
