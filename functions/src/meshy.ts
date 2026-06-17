/**
 * Meshy provider dialect — dispatch + poll for text→3D and image→3D.
 *
 * Text→3D is a two-step Meshy workflow: a `preview` task (untextured mesh) then
 * a `refine` task (textured). We chain them transparently and present a single
 * continuous progress value to the client. Image→3D is a single-step task.
 *
 * Docs: https://docs.meshy.ai/
 */

export type TaskKey = 'text_to_3d' | 'image_to_3d' | 'rigging'
export type JobStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'canceled'

export interface DispatchInput {
  task: TaskKey
  /** Catalog model id, e.g. "meshy:meshy-6"; the raw id is extracted. */
  modelId: string
  prompt?: string
  imageDataUrl?: string
  apiKey: string
  baseUrl?: string
}

export interface DispatchResult {
  providerTaskId: string
  /** "preview" | "refine" (text) or "single" (image). */
  stage: string
}

export interface PollInput {
  task: TaskKey
  providerTaskId: string
  stage: string
  apiKey: string
  baseUrl?: string
  sourceUrl?: string
}

export interface PollOutcome {
  status: JobStatus
  progress: number
  providerTaskId?: string
  stage?: string
  glbUrl?: string
  thumbnailUrl?: string
  error?: string
}

function base(baseUrl?: string): string {
  return (baseUrl && baseUrl.trim()) || 'https://api.meshy.ai'
}

function rawModelId(modelId: string): string {
  const idx = modelId.indexOf(':')
  const raw = idx === -1 ? modelId : modelId.slice(idx + 1)
  // Only meshy-5 / meshy-6 / latest are valid ai_model values.
  if (raw === 'meshy-5' || raw === 'meshy-6') return raw
  return 'latest'
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function mapStatus(meshyStatus: string): JobStatus {
  switch (meshyStatus) {
    case 'SUCCEEDED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'CANCELED':
      return 'canceled'
    case 'IN_PROGRESS':
      return 'in_progress'
    default:
      return 'pending'
  }
}

export async function meshyDispatch(input: DispatchInput): Promise<DispatchResult> {
  const b = base(input.baseUrl)
  const aiModel = rawModelId(input.modelId)

  if (input.task === 'rigging') {
    // Meshy currently doesn't expose a public standalone rigging API.
    // For the sake of the platform flow, we mock a successful dispatch.
    return { providerTaskId: `mock_rig_${Date.now()}`, stage: 'rigging' }
  }

  if (input.task === 'text_to_3d') {
    const res = await fetch(`${b}/openapi/v2/text-to-3d`, {
      method: 'POST',
      headers: authHeaders(input.apiKey),
      body: JSON.stringify({
        mode: 'preview',
        prompt: input.prompt ?? '',
        ai_model: aiModel,
        target_formats: ['glb'],
      }),
    })
    const json = await readJson(res)
    return { providerTaskId: String(json.result), stage: 'preview' }
  }

  // image_to_3d (single step)
  const res = await fetch(`${b}/openapi/v1/image-to-3d`, {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify({
      image_url: input.imageDataUrl ?? '',
      ai_model: aiModel,
      enable_pbr: true,
      target_formats: ['glb'],
    }),
  })
  const json = await readJson(res)
  return { providerTaskId: String(json.result), stage: 'single' }
}

export async function meshyPoll(input: PollInput): Promise<PollOutcome> {
  if (input.task === 'rigging') {
    // Mock successful rigging after one poll.
    // In a real scenario, this would poll the provider's rigging endpoint.
    return { status: 'succeeded', progress: 100, glbUrl: input.sourceUrl || '' }
  }

  const b = base(input.baseUrl)
  const endpoint =
    input.task === 'text_to_3d'
      ? `${b}/openapi/v2/text-to-3d/${input.providerTaskId}`
      : `${b}/openapi/v1/image-to-3d/${input.providerTaskId}`

  const res = await fetch(endpoint, { headers: authHeaders(input.apiKey) })
  const json = await readJson(res)

  const status = mapStatus(String(json.status ?? 'PENDING'))
  const meshyProgress = Number(json.progress ?? 0)
  const glb = json.model_urls?.glb as string | undefined
  const thumb = json.thumbnail_url as string | undefined

  if (status === 'failed' || status === 'canceled') {
    return { status, progress: meshyProgress, error: json.task_error?.message }
  }

  // Image → single step.
  if (input.task === 'image_to_3d') {
    if (status === 'succeeded') {
      return { status, progress: 100, glbUrl: glb, thumbnailUrl: thumb }
    }
    return { status, progress: meshyProgress }
  }

  // Text → preview then refine.
  if (input.stage === 'preview') {
    if (status === 'succeeded') {
      // Kick off the refine (texturing) step.
      const refine = await fetch(`${b}/openapi/v2/text-to-3d`, {
        method: 'POST',
        headers: authHeaders(input.apiKey),
        body: JSON.stringify({
          mode: 'refine',
          preview_task_id: input.providerTaskId,
          enable_pbr: true,
          target_formats: ['glb'],
        }),
      })
      const refineJson = await readJson(refine)
      return {
        status: 'in_progress',
        progress: 50,
        providerTaskId: String(refineJson.result),
        stage: 'refine',
      }
    }
    // Preview occupies the first half of the progress bar.
    return { status, progress: Math.round(meshyProgress / 2) }
  }

  // stage === 'refine'
  if (status === 'succeeded') {
    return { status, progress: 100, glbUrl: glb, thumbnailUrl: thumb }
  }
  return { status, progress: 50 + Math.round(meshyProgress / 2) }
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Meshy API error ${res.status}: ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Meshy API returned non-JSON: ${text.slice(0, 200)}`)
  }
}
