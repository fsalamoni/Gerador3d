/**
 * Usage metrics — computes per-user analytics from the user's generation jobs.
 *
 * All client-side and rules-safe (operates only on the signed-in user's own
 * jobs), so it works identically in Firebase and demo modes.
 */
import type { GenerationJob, JobStatus, ModelOption } from './firestore-types'

export interface DailyCount {
  /** ISO date (YYYY-MM-DD). */
  date: string
  count: number
}

export interface UsageMetrics {
  total: number
  byStatus: Record<JobStatus, number>
  byProvider: Record<string, number>
  byTask: Record<string, number>
  /** Last 14 days, oldest → newest. */
  perDay: DailyCount[]
  /** Sum of approxCost for succeeded jobs whose model is in the catalog. */
  estimatedCost: number
  successRate: number
}

const EMPTY_STATUS: Record<JobStatus, number> = {
  pending: 0,
  in_progress: 0,
  succeeded: 0,
  failed: 0,
  canceled: 0,
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Build the last `days` day buckets (inclusive of today). */
function emptyTimeline(days: number): DailyCount[] {
  const out: DailyCount[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({ date: isoDay(d), count: 0 })
  }
  return out
}

export function computeUsage(
  jobs: GenerationJob[],
  catalog: ModelOption[] = [],
  timelineDays = 14,
): UsageMetrics {
  const byStatus: Record<JobStatus, number> = { ...EMPTY_STATUS }
  const byProvider: Record<string, number> = {}
  const byTask: Record<string, number> = {}
  const timeline = emptyTimeline(timelineDays)
  const timelineIndex = new Map(timeline.map((b, i) => [b.date, i]))
  const costById = new Map(catalog.map((m) => [m.id, m.approxCost ?? 0]))

  let estimatedCost = 0

  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] ?? 0) + 1
    if (job.providerId) byProvider[job.providerId] = (byProvider[job.providerId] ?? 0) + 1
    if (job.task) byTask[job.task] = (byTask[job.task] ?? 0) + 1

    const day = (job.created_at ?? '').slice(0, 10)
    const idx = timelineIndex.get(day)
    if (idx !== undefined) timeline[idx].count += 1

    if (job.status === 'succeeded') {
      estimatedCost += costById.get(job.modelId) ?? 0
    }
  }

  const total = jobs.length
  const finished = byStatus.succeeded + byStatus.failed + byStatus.canceled
  const successRate = finished > 0 ? byStatus.succeeded / finished : 0

  return {
    total,
    byStatus,
    byProvider,
    byTask,
    perDay: timeline,
    estimatedCost,
    successRate,
  }
}

/** Sort a count map into descending [key, value] pairs. */
export function topEntries(map: Record<string, number>): Array<[string, number]> {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
}
