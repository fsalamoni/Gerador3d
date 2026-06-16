/**
 * Platform-wide aggregate stats reader.
 *
 * Firebase mode → reads `/platform/stats` (written by Cloud Functions).
 * Demo mode     → derives an equivalent shape from the local jobs so the Admin
 *                 panel is meaningful without a backend.
 */
import { doc, getDoc } from 'firebase/firestore'
import { IS_FIREBASE, db } from './firebase'
import { listJobs } from './jobs-store'

export interface PlatformStats {
  totalJobs: number
  byProvider: Record<string, number>
  byTask: Record<string, number>
  byStatus: Record<string, number>
  updated_at?: string
}

const EMPTY: PlatformStats = {
  totalJobs: 0,
  byProvider: {},
  byTask: {},
  byStatus: {},
}

export async function loadPlatformStats(): Promise<PlatformStats> {
  if (IS_FIREBASE && db) {
    const snap = await getDoc(doc(db, 'platform', 'stats'))
    if (!snap.exists()) return EMPTY
    const data = snap.data() as Partial<PlatformStats>
    return {
      totalJobs: data.totalJobs ?? 0,
      byProvider: data.byProvider ?? {},
      byTask: data.byTask ?? {},
      byStatus: data.byStatus ?? {},
      updated_at: data.updated_at,
    }
  }

  // Demo: derive from local jobs.
  const jobs = await listJobs()
  const stats: PlatformStats = { ...EMPTY, byProvider: {}, byTask: {}, byStatus: {} }
  stats.totalJobs = jobs.length
  for (const job of jobs) {
    if (job.providerId) stats.byProvider[job.providerId] = (stats.byProvider[job.providerId] ?? 0) + 1
    if (job.task) stats.byTask[job.task] = (stats.byTask[job.task] ?? 0) + 1
    stats.byStatus[job.status] = (stats.byStatus[job.status] ?? 0) + 1
  }
  return stats
}
