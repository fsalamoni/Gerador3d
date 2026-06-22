/**
 * REST client for the LOCAL DESKTOP engine (desktop/local_server.py).
 *
 * Mirrors what the Cloud Functions + Firestore did in the cloud build, but fully
 * offline: jobs live in a local JSON store and assets are served from disk at
 * `/files/...`. Only used when `IS_LOCAL` is true.
 */
import { LOCAL_API } from './runtime'
import type { GenerationJob } from './firestore-types'
import type { TaskKey } from './tasks-3d'

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text().catch(() => '')}`)
  return res.json() as Promise<T>
}

export async function localGenerate(input: {
  task: TaskKey
  prompt?: string
  imageDataUrl?: string
  imageDataUrls?: string[]
  mcResolution?: number
  seed?: number
  backend?: string
  /** Apply PBR texture during generation (Hunyuan3D-Paint; needs GPU + modules). */
  texture?: boolean
}): Promise<{ jobId: string }> {
  const res = await fetch(`${LOCAL_API}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: input.task,
      prompt: input.prompt ?? '',
      imageDataUrl: input.imageDataUrl ?? '',
      imageDataUrls: input.imageDataUrls ?? [],
      mcResolution: input.mcResolution ?? 0,
      seed: input.seed ?? -1,
      backend: input.backend ?? '',
      texture: input.texture ?? false,
    }),
  })
  return asJson(res)
}

export async function localGetConfig(): Promise<{ backend: string; backends: string[] }> {
  return asJson(await fetch(`${LOCAL_API}/config`))
}

export async function localSetBackend(backend: string): Promise<void> {
  await asJson(await fetch(`${LOCAL_API}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backend }),
  }))
}

export async function localRig(sourceUrl: string): Promise<{ jobId: string }> {
  const res = await fetch(`${LOCAL_API}/rig`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl }),
  })
  return asJson(res)
}

export async function localListJobs(): Promise<GenerationJob[]> {
  return asJson<GenerationJob[]>(await fetch(`${LOCAL_API}/jobs`))
}

export async function localGetJob(jobId: string): Promise<GenerationJob | null> {
  const res = await fetch(`${LOCAL_API}/jobs/${jobId}`)
  if (res.status === 404) return null
  return asJson<GenerationJob>(res)
}

export async function localDeleteJob(jobId: string): Promise<void> {
  await fetch(`${LOCAL_API}/jobs/${jobId}`, { method: 'DELETE' })
}

export async function localUpload(file: File): Promise<GenerationJob> {
  const form = new FormData()
  form.append('file', file, file.name)
  const res = await fetch(`${LOCAL_API}/upload`, { method: 'POST', body: form })
  return asJson<GenerationJob>(res)
}

// ── Setup / diagnóstico / provisionamento ──────────────────────────────────────

export interface BackendInfo {
  label: string
  minVramGb: number
  texture: boolean
  /** Whether the app can one-click install it (vs. manual/Linux setup). */
  installable?: boolean
  /** Uses multiple input images (front/back/sides) for higher fidelity. */
  multiview?: boolean
  note: string
}

export interface LocalDiagnostics {
  rigging: { blender: boolean; blenderPath: string | null; template: boolean; ready: boolean }
  generation: {
    torch: boolean
    diffusers: boolean
    triposr: boolean
    cuda: boolean
    ready: boolean
    /** Hunyuan3D-2mini repo + deps installed. */
    hunyuan?: boolean
    /** GPU name, e.g. "NVIDIA GeForce RTX 4080" (empty on CPU). */
    gpu?: string
    /** Total VRAM in GB (0 when unknown / CPU). */
    vramGb?: number
    /** Best backend for the detected VRAM. */
    recommendedBackend?: string
    /** Backend catalog keyed by backend id. */
    catalog?: Record<string, BackendInfo>
  }
  python: string
  backend: string
}

export interface ProvisionStatus {
  active: boolean
  target: string | null
  progress: number
  done: boolean
  ok: boolean
  error: string | null
  log: string[]
}

export async function localDiagnostics(): Promise<LocalDiagnostics> {
  return asJson<LocalDiagnostics>(await fetch(`${LOCAL_API}/diagnostics`))
}

export async function localProvision(target: 'generation' | 'hunyuan' | 'blender'): Promise<void> {
  const res = await fetch(`${LOCAL_API}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  })
  await asJson(res)
}

export async function localProvisionStatus(): Promise<ProvisionStatus> {
  return asJson<ProvisionStatus>(await fetch(`${LOCAL_API}/provision/status`))
}
