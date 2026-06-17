/**
 * Jobs store — CRUD for generation jobs.
 *
 * Firebase mode → Firestore `/users/{uid}/jobs/{jobId}`.
 * Demo mode     → localStorage array keyed by uid.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore'
import { IS_FIREBASE, db } from './firebase'
import { getCurrentUserId } from './firestore-service'
import type { GenerationJob } from './firestore-types'

const DEMO_JOBS_PREFIX = 'gerador3d_jobs_'

function demoKey(uid: string): string {
  return `${DEMO_JOBS_PREFIX}${uid}`
}

function readDemoJobs(uid: string): GenerationJob[] {
  try {
    const raw = localStorage.getItem(demoKey(uid))
    return raw ? (JSON.parse(raw) as GenerationJob[]) : []
  } catch {
    return []
  }
}

function writeDemoJobs(uid: string, jobs: GenerationJob[]): void {
  try {
    localStorage.setItem(demoKey(uid), JSON.stringify(jobs))
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(JOBS_UPDATED_EVENT))
  }
}

export const JOBS_UPDATED_EVENT = 'gerador3d:jobs_updated'

/** Create a new job document. */
export async function createJob(job: GenerationJob, uid?: string): Promise<void> {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return

  if (IS_FIREBASE && db) {
    await setDoc(doc(db, 'users', resolved, 'jobs', job.id), job)
    return
  }

  const jobs = readDemoJobs(resolved)
  writeDemoJobs(resolved, [job, ...jobs])
}

/** Patch an existing job document. */
export async function updateJob(
  jobId: string,
  patch: Partial<GenerationJob>,
  uid?: string,
): Promise<void> {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return

  if (IS_FIREBASE && db) {
    await updateDoc(doc(db, 'users', resolved, 'jobs', jobId), patch)
    return
  }

  const jobs = readDemoJobs(resolved)
  const next = jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
  writeDemoJobs(resolved, next)
}

/** Delete a job document. */
export async function deleteJob(jobId: string, uid?: string): Promise<void> {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return

  if (IS_FIREBASE && db) {
    await deleteDoc(doc(db, 'users', resolved, 'jobs', jobId))
    return
  }

  const jobs = readDemoJobs(resolved)
  writeDemoJobs(resolved, jobs.filter((j) => j.id !== jobId))
}

/** Fetch a single job. */
export async function getJob(jobId: string, uid?: string): Promise<GenerationJob | null> {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return null

  if (IS_FIREBASE && db) {
    const snap = await getDoc(doc(db, 'users', resolved, 'jobs', jobId))
    return snap.exists() ? (snap.data() as GenerationJob) : null
  }

  return readDemoJobs(resolved).find((j) => j.id === jobId) ?? null
}

/** List all jobs (newest first). */
export async function listJobs(uid?: string): Promise<GenerationJob[]> {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return []

  if (IS_FIREBASE && db) {
    const q = query(
      collection(db, 'users', resolved, 'jobs'),
      orderBy('created_at', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as GenerationJob)
  }

  return readDemoJobs(resolved)
}

/** Subscribe to job changes. Returns an unsubscribe function. */
export function subscribeJobs(
  onChange: (jobs: GenerationJob[]) => void,
  uid?: string,
): () => void {
  const resolved = uid ?? getCurrentUserId()
  if (!resolved) return () => {}

  if (IS_FIREBASE && db) {
    const q = query(
      collection(db, 'users', resolved, 'jobs'),
      orderBy('created_at', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => d.data() as GenerationJob))
    })
  }

  // Demo mode — poll-free: listen to our custom event + storage events.
  const handler = () => onChange(readDemoJobs(resolved))
  handler()
  window.addEventListener(JOBS_UPDATED_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(JOBS_UPDATED_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
