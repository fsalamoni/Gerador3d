/**
 * Tripo provider dialect — dispatch + poll for text→3D and image→3D.
 *
 * Tripo's Open API is a single async "task" endpoint (create → poll), similar
 * in spirit to Meshy but single-step for both text and image. Image→3D needs
 * the image uploaded first to obtain a token, which is then referenced by the
 * task.
 *
 * Docs: https://platform.tripo3d.ai/docs  (Open API v2)
 *
 * Implemented against Tripo's documented API shape. The field readers are
 * defensive (accept a few known key spellings) so minor API variations don't
 * break the flow. Verify with a real Tripo key.
 */
import type {
  DispatchInput,
  DispatchResult,
  PollInput,
  PollOutcome,
  JobStatus,
} from './meshy.js'

const DEFAULT_BASE = 'https://api.tripo3d.ai/v2/openapi'

function base(baseUrl?: string): string {
  return (baseUrl && baseUrl.trim()) || DEFAULT_BASE
}

/** Strip the catalog namespace ("tripo:v2.5-…") down to the raw model version. */
function modelVersion(modelId: string): string | undefined {
  const idx = modelId.indexOf(':')
  const raw = idx === -1 ? modelId : modelId.slice(idx + 1)
  // The "rig" pseudo-model isn't a generation version.
  if (!raw || raw === 'tripo-rig') return undefined
  return raw
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
}

function mapStatus(status: string): JobStatus {
  switch ((status || '').toLowerCase()) {
    case 'success':
      return 'succeeded'
    case 'failed':
    case 'cancelled':
    case 'canceled':
    case 'banned':
    case 'expired':
    case 'unknown':
      return 'failed'
    case 'running':
      return 'in_progress'
    default:
      return 'pending' // queued / waiting
  }
}

async function readJson(res: Response, ctx: string): Promise<any> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Tripo ${ctx} error ${res.status}: ${text.slice(0, 300)}`)
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Tripo ${ctx} returned non-JSON: ${text.slice(0, 200)}`)
  }
  // Tripo wraps payloads as { code, data, message }. code 0 == success.
  if (typeof json.code === 'number' && json.code !== 0) {
    throw new Error(`Tripo ${ctx} failed (code ${json.code}): ${json.message ?? ''}`)
  }
  return json.data ?? json
}

/** Upload a data-URL image to Tripo and return its token + file extension. */
async function uploadImage(
  b: string,
  apiKey: string,
  imageDataUrl: string,
): Promise<{ token: string; type: string }> {
  const match = /^data:(image\/(\w+));base64,(.*)$/i.exec(imageDataUrl)
  if (!match) throw new Error('Tripo image→3D requires a base64 image data URL.')
  const ext = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase()
  const buffer = Buffer.from(match[3], 'base64')

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: match[1] }), `image.${ext}`)

  const res = await fetch(`${b}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` }, // let fetch set multipart boundary
    body: form,
  })
  const data = await readJson(res, 'upload')
  const token = data.image_token ?? data.file_token ?? data.token
  if (!token) throw new Error('Tripo upload did not return an image token.')
  return { token, type: ext }
}

export async function tripoDispatch(input: DispatchInput): Promise<DispatchResult> {
  const b = base(input.baseUrl)
  const version = modelVersion(input.modelId)

  let body: Record<string, unknown>
  if (input.task === 'text_to_3d') {
    body = { type: 'text_to_model', prompt: input.prompt ?? '' }
    if (version) body.model_version = version
  } else if (input.task === 'image_to_3d') {
    const { token, type } = await uploadImage(b, input.apiKey, input.imageDataUrl ?? '')
    body = { type: 'image_to_model', file: { type, file_token: token } }
    if (version) body.model_version = version
  } else {
    throw new Error(`Tripo does not support task "${input.task}" in this proxy.`)
  }

  const res = await fetch(`${b}/task`, {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify(body),
  })
  const data = await readJson(res, 'create task')
  const taskId = data.task_id ?? data.taskId ?? data.id
  if (!taskId) throw new Error('Tripo did not return a task id.')
  return { providerTaskId: String(taskId), stage: 'single' }
}

export async function tripoPoll(input: PollInput): Promise<PollOutcome> {
  const b = base(input.baseUrl)
  const res = await fetch(`${b}/task/${input.providerTaskId}`, {
    headers: authHeaders(input.apiKey),
  })
  const data = await readJson(res, 'poll task')

  const status = mapStatus(String(data.status ?? 'queued'))
  const progress = Number(data.progress ?? 0)
  const output = data.output ?? {}
  const glb: string | undefined = output.pbr_model ?? output.model ?? output.base_model
  const thumb: string | undefined = output.rendered_image ?? data.rendering ?? undefined

  if (status === 'failed') {
    return { status, progress, error: `Tripo task ${data.status ?? 'failed'}` }
  }
  if (status === 'succeeded') {
    return { status, progress: 100, glbUrl: glb, thumbnailUrl: thumb }
  }
  return { status, progress }
}
