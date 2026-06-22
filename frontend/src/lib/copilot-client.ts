/**
 * Copilot — use a vision LLM (OpenRouter / Groq, both OpenAI-compatible) to read
 * a REFERENCE PHOTO and propose facial landmarks, to seed the rig instead of
 * clicking each point. The user already has these provider keys.
 *
 * Structure here (testable without a key):
 *  - {@link parseLandmarkJson}: robust parser of the model's JSON answer
 *    (tolerates code fences / prose, validates ranges, requires the core keys).
 *  - {@link image2DToMeshLandmarks}: pure mapping of normalized 2D points
 *    (x→right, y→down from the top of the image) to mesh-local landmarks on the
 *    front plane of the mesh's bounding box — directly usable by the rig.
 *  - {@link proposeLandmarksFromImage}: the actual vision call, behind the key.
 *
 * The 2D→3D mapping assumes a roughly front-facing photo/mesh; the user can still
 * nudge any point afterwards. See docs/LIGACOES.md for connecting a key.
 */
import type { FaceLandmarks } from './procedural-face-rig'

/** A facial point in normalized image space: x∈[0,1] right, y∈[0,1] DOWN. */
export type Point2D = [number, number]

export interface ImageLandmarks2D {
  eyeLeft: Point2D
  eyeRight: Point2D
  mouthLeft: Point2D
  mouthRight: Point2D
  upperLip: Point2D
  lowerLip: Point2D
  browLeft?: Point2D
  browRight?: Point2D
  jaw?: Point2D
}

const REQUIRED: (keyof ImageLandmarks2D)[] = [
  'eyeLeft', 'eyeRight', 'mouthLeft', 'mouthRight', 'upperLip', 'lowerLip',
]
const OPTIONAL: (keyof ImageLandmarks2D)[] = ['browLeft', 'browRight', 'jaw']

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function asPoint(v: unknown): Point2D | null {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
    if (Number.isFinite(v[0]) && Number.isFinite(v[1])) return [clamp01(v[0]), clamp01(v[1])]
  }
  if (v && typeof v === 'object') {
    const o = v as { x?: unknown; y?: unknown }
    if (typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x) && Number.isFinite(o.y)) {
      return [clamp01(o.x), clamp01(o.y)]
    }
  }
  return null
}

/**
 * Parse the model's answer into landmarks. Tolerates ```json fences and prose
 * around the object. Returns null if the required points are missing/invalid.
 */
export function parseLandmarkJson(text: string): ImageLandmarks2D | null {
  if (!text) return null
  // Grab the outermost {...} so surrounding prose / fences don't break parsing.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const out = {} as ImageLandmarks2D
  for (const k of REQUIRED) {
    const p = asPoint(obj[k])
    if (!p) return null
    out[k] = p
  }
  for (const k of OPTIONAL) {
    const p = asPoint(obj[k])
    if (p) out[k] = p
  }
  return out
}

/** Axis-aligned bounds of the target mesh (geometry-local). */
export interface Bounds3 {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

/**
 * Map normalized 2D landmarks (image space, y DOWN) onto the FRONT plane of the
 * mesh bounds → mesh-local FaceLandmarks (y UP, z = front). The result is a
 * starting point; pair with surface snapping / manual nudge for accuracy.
 */
export function image2DToMeshLandmarks(lm: ImageLandmarks2D, b: Bounds3): FaceLandmarks {
  const zf = b.max.z
  const X = (u: number) => b.min.x + (b.max.x - b.min.x) * u
  const Y = (v: number) => b.max.y - (b.max.y - b.min.y) * v // image y down → mesh y up
  const P = (p: Point2D): [number, number, number] => [X(p[0]), Y(p[1]), zf]
  const out: FaceLandmarks = {
    eyeLeft: P(lm.eyeLeft),
    eyeRight: P(lm.eyeRight),
    mouthLeft: P(lm.mouthLeft),
    mouthRight: P(lm.mouthRight),
    upperLip: P(lm.upperLip),
    lowerLip: P(lm.lowerLip),
  }
  if (lm.browLeft) out.browLeft = P(lm.browLeft)
  if (lm.browRight) out.browRight = P(lm.browRight)
  if (lm.jaw) out.jaw = P(lm.jaw)
  return out
}

export interface CopilotOptions {
  apiKey: string
  /** OpenAI-compatible base URL. Default OpenRouter. Groq: https://api.groq.com/openai/v1 */
  baseUrl?: string
  /** Vision-capable model id (default a small GPT-4o-class model on OpenRouter). */
  model?: string
}

const PROMPT =
  'You are a precise facial-landmark detector. Look at the face in the image and ' +
  'return ONLY a JSON object (no prose) with normalized coordinates, origin at the ' +
  'TOP-LEFT, x to the right in [0,1], y DOWNWARD in [0,1]. Keys: eyeLeft, eyeRight ' +
  "(the character's own left/right, i.e. the viewer sees eyeLeft on the right), " +
  'mouthLeft, mouthRight, upperLip, lowerLip, and optionally browLeft, browRight, jaw. ' +
  'Each value is [x, y]. Example: {"eyeLeft":[0.62,0.42],"eyeRight":[0.38,0.42], ...}.'

/**
 * Ask a vision LLM to propose landmarks for a reference image (data URL). Throws
 * a clear error without a key. The request is OpenAI-compatible (OpenRouter/Groq).
 */
export async function proposeLandmarksFromImage(
  imageDataUrl: string,
  opts: CopilotOptions,
): Promise<ImageLandmarks2D> {
  if (!opts.apiKey) {
    throw new Error('Copiloto: configure a chave (OpenRouter/Groq) em Configurações → Provedores.')
  }
  if (!imageDataUrl) throw new Error('Copiloto: nenhuma imagem de referência.')
  const baseUrl = (opts.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const model = opts.model || 'openai/gpt-4o-mini'
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`Copiloto ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content ?? ''
  const parsed = parseLandmarkJson(content)
  if (!parsed) throw new Error('Copiloto: não consegui interpretar os pontos retornados.')
  return parsed
}
