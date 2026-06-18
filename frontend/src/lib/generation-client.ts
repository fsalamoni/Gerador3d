/**
 * Generation client — starts a 3D generation job and tracks its progress.
 *
 * Firebase mode → calls the `generate3d` callable (the Cloud Function proxy
 *                 dispatches to the provider and writes the job to Firestore),
 *                 then polls `pollJob3d` until the job reaches a terminal state.
 * Demo mode     → simulates a job locally so the whole flow + 3D preview works
 *                 without any backend or API keys.
 */
import { httpsCallable } from 'firebase/functions'
import { IS_FIREBASE, functions } from './firebase'
import { IS_LOCAL } from './runtime'
import { localGenerate, localRig } from './local-api'
import { getSettings } from './firestore-service'
import { getDefaultTaskModels, type TaskKey } from './tasks-3d'
import { resolveProviderForModel } from './provider-credentials'
import { createJob, getJob, updateJob } from './jobs-store'
import { track } from './analytics-events'
import type { GenerationJob, JobStatus } from './firestore-types'

export interface StartGenerationInput {
  task: TaskKey
  prompt?: string
  /** Data URL of the source image for image→3D. */
  imageDataUrl?: string
  /** Extra provider-specific params. */
  extra?: Record<string, unknown>
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Resolve the catalog model id bound to a task. */
export async function resolveTaskModel(task: TaskKey): Promise<string> {
  const settings = await getSettings()
  const map = { ...getDefaultTaskModels(), ...(settings.task_models ?? {}) }
  return map[task]
}

/**
 * Start a generation job. Returns the created job id. Use `subscribeJobs`
 * (jobs-store) or `pollUntilDone` to follow progress.
 */
export async function startGeneration(input: StartGenerationInput): Promise<string> {
  const modelId = await resolveTaskModel(input.task)
  const providerId = resolveProviderForModel(modelId) ?? 'unknown'
  const now = new Date().toISOString()
  const jobId = newId()

  track('generation_started', { task: input.task, providerId, modelId })

  // Local desktop engine — everything runs offline on this machine.
  if (IS_LOCAL) {
    if (input.task === 'rigging') {
      const { jobId: rid } = await localRig(input.prompt ?? '')
      return rid
    }
    const extra = input.extra ?? {}
    const { jobId: gid } = await localGenerate({
      task: input.task,
      prompt: input.prompt,
      imageDataUrl: input.imageDataUrl,
      mcResolution: typeof extra.mcResolution === 'number' ? extra.mcResolution : undefined,
      seed: typeof extra.seed === 'number' ? extra.seed : undefined,
      backend: typeof extra.backend === 'string' ? extra.backend : undefined,
    })
    return gid
  }

  const baseJob: GenerationJob = {
    id: jobId,
    uid: '',
    task: taskToCapability(input.task),
    providerId,
    modelId,
    status: 'pending',
    progress: 0,
    params: {
      prompt: input.prompt,
      hasImage: Boolean(input.imageDataUrl),
      ...input.extra,
    },
    created_at: now,
    updated_at: now,
  }

  if (IS_FIREBASE && functions) {
    const call = httpsCallable<Record<string, unknown>, { jobId: string }>(
      functions,
      'generate3d',
    )
    await call({
      jobId,
      task: input.task,
      modelId,
      providerId,
      prompt: input.prompt ?? '',
      imageDataUrl: input.imageDataUrl ?? '',
      extra: input.extra ?? {},
    })
    return jobId
  }

  // Demo mode — create locally and simulate.
  await createJob(baseJob)
  void simulateDemoJob(jobId)
  return jobId
}

/** Advance a Firebase job by asking the proxy to poll the provider once. */
export async function pollJobOnce(jobId: string): Promise<GenerationJob | null> {
  if (IS_LOCAL) return getJob(jobId) // local engine advances jobs server-side
  if (IS_FIREBASE && functions) {
    const call = httpsCallable<{ jobId: string }, GenerationJob>(functions, 'pollJob3d')
    const res = await call({ jobId })
    return res.data
  }
  return getJob(jobId)
}

const TERMINAL: JobStatus[] = ['succeeded', 'failed', 'canceled']

/** Poll a job until it reaches a terminal state (Firebase mode). */
export async function pollUntilDone(
  jobId: string,
  onUpdate?: (job: GenerationJob) => void,
  intervalMs = 4000,
  timeoutMs = 5 * 60_000,
): Promise<GenerationJob | null> {
  const start = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await pollJobOnce(jobId)
    if (job) onUpdate?.(job)
    if (job && TERMINAL.includes(job.status)) return job
    if (Date.now() - start > timeoutMs) return job
    await delay(intervalMs)
  }
}

// ── Demo simulation ───────────────────────────────────────────────────────────

async function simulateDemoJob(jobId: string): Promise<void> {
  const steps: Array<{ progress: number; status: JobStatus }> = [
    { progress: 20, status: 'in_progress' },
    { progress: 55, status: 'in_progress' },
    { progress: 85, status: 'in_progress' },
    { progress: 100, status: 'succeeded' },
  ]
  for (const step of steps) {
    await delay(900)
    await updateJob(jobId, {
      status: step.status,
      progress: step.progress,
      updated_at: new Date().toISOString(),
      // No real asset in demo — the viewer shows a procedural placeholder.
      outputs: step.status === 'succeeded' ? {} : undefined,
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function taskToCapability(task: TaskKey): GenerationJob['task'] {
  switch (task) {
    case 'text_to_3d':
      return 'text-to-3d'
    case 'image_to_3d':
      return 'image-to-3d'
    case 'texturing':
      return 'texturing'
    case 'rigging':
      return 'rigging'
    case 'animation':
      return 'animation'
  }
}
