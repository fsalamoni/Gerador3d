/**
 * Thin wrapper around Google Analytics for Firebase. No-ops in demo mode or
 * when Analytics isn't initialized, so callers can track freely without guards.
 */
import { logEvent } from 'firebase/analytics'
import { getAnalyticsInstance } from './firebase'

export function track(event: string, params?: Record<string, unknown>): void {
  try {
    const analytics = getAnalyticsInstance()
    if (analytics) logEvent(analytics, event, params)
  } catch {
    // Analytics is best-effort; never throw from tracking.
  }
}
