/**
 * Procedural facial rig — generates ARKit-named blendshapes (morph targets) on
 * ANY mesh from a handful of user-placed landmarks. This is what makes the live
 * studio drive expressions (mouth, eyes, jaw, smile) on meshes that ship without
 * blendshapes — generated TripoSR/Hunyuan models AND non-human creatures, where
 * transferring a human face template never aligns.
 *
 * Why landmarks instead of a template? A dragon's snout, a robot's faceplate and
 * a human face share no topology, so deformation-transfer from a human template
 * produces garbage. But "where the mouth corners / eyes / jaw are" is something a
 * human can mark in five clicks — and from those we can synthesize plausible
 * expressions procedurally, with a face-local coordinate frame derived from the
 * marks (so it works regardless of the model's orientation or scale).
 *
 * The generated morphs are named exactly like the ARKit blendshapes MediaPipe
 * emits (jawOpen, mouthSmileLeft, …), so {@link applyFaceToGlbMorphs} drives them
 * 1:1 from the webcam with no extra mapping.
 */
import * as THREE from 'three'

export type LandmarkKey = 'eyeLeft' | 'eyeRight' | 'mouthLeft' | 'mouthRight' | 'jaw'

/** Landmark positions in the target mesh's LOCAL space (geometry coordinates). */
export interface FaceLandmarks {
  eyeLeft: [number, number, number]
  eyeRight: [number, number, number]
  mouthLeft: [number, number, number]
  mouthRight: [number, number, number]
  /** Chin / lowest jaw point. Optional — improves the jaw-open motion. */
  jaw?: [number, number, number]
}

/** The morph targets this rig generates (subset of ARKit, the high-impact ones). */
export const GENERATED_SHAPES = [
  'jawOpen',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthFunnel',
  'mouthPucker',
  'eyeBlinkLeft',
  'eyeBlinkRight',
] as const

const v = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2])
const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Generate procedural morph targets on `mesh` from `lm`. Adds (relative) morph
 * attributes named per {@link GENERATED_SHAPES}, refreshes the mesh's
 * morphTargetDictionary/Influences, and returns the created names.
 *
 * Replaces any morphs of the same name created by a previous run (so re-marking
 * is idempotent). No-op-safe: throws only if the geometry has no positions.
 */
export function buildProceduralMorphs(mesh: THREE.Mesh, lm: FaceLandmarks): string[] {
  const geo = mesh.geometry as THREE.BufferGeometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) throw new Error('A malha selecionada não tem vértices (position).')
  const n = pos.count

  const eyeL = v(lm.eyeLeft)
  const eyeR = v(lm.eyeRight)
  const mouthL = v(lm.mouthLeft)
  const mouthR = v(lm.mouthRight)
  const mouthC = mouthL.clone().add(mouthR).multiplyScalar(0.5)
  const eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5)

  // Face-local frame derived from the landmarks (orientation-independent).
  const right = mouthR.clone().sub(mouthL).normalize() // mouthLeft → mouthRight
  let up = eyeMid.clone().sub(mouthC)
  up.addScaledVector(right, -up.dot(right)).normalize() // orthogonalize vs right
  const forward = new THREE.Vector3().crossVectors(right, up).normalize()
  // Make `forward` point OUT of the face: away from the mesh centroid.
  const centroid = meshCentroid(pos)
  if (mouthC.clone().sub(centroid).dot(forward) < 0) forward.negate()

  // Characteristic sizes — keep displacements proportional to the model.
  const mouthW = Math.max(1e-5, mouthL.distanceTo(mouthR))
  const eyeW = Math.max(1e-5, eyeL.distanceTo(eyeR))
  const faceH = Math.max(1e-5, eyeMid.distanceTo(mouthC))
  const jawTip = lm.jaw ? v(lm.jaw) : mouthC.clone().addScaledVector(up, -faceH * 0.7)

  // Smile directions: corner goes up and OUTWARD (away from mouth center).
  const smileLDir = up.clone().multiplyScalar(1.0).addScaledVector(right, -0.6).normalize()
  const smileRDir = up.clone().multiplyScalar(1.0).addScaledVector(right, 0.6).normalize()

  // One Float32Array of deltas per generated shape.
  const deltas: Record<string, Float32Array> = {}
  for (const name of GENERATED_SHAPES) deltas[name] = new Float32Array(n * 3)

  const p = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i))

    // jawOpen: (a) lower face swings down+back around the jaw, hinge-like, and
    // (b) the lower lip parts just below the mouth so the mouth visibly opens.
    {
      const below = mouthC.clone().sub(p).dot(up) // >0 below the mouth line
      const region = gauss(p.distanceTo(jawTip), faceH * 1.1)
      const gateJaw = clamp01(below / (faceH * 0.5))
      const wJaw = region * gateJaw
      if (wJaw > 1e-4) {
        tmp.copy(up).multiplyScalar(-faceH * 0.9 * wJaw)
        tmp.addScaledVector(forward, -faceH * 0.28 * wJaw)
        addDelta(deltas.jawOpen, i, tmp)
      }
      if (below > 0) {
        const wLip = gauss(p.distanceTo(mouthC), mouthW * 0.7) * clamp01(below / (mouthW * 0.5))
        if (wLip > 1e-4) {
          tmp.copy(up).multiplyScalar(-mouthW * 0.6 * wLip)
          addDelta(deltas.jawOpen, i, tmp)
        }
      }
    }
    // smile L/R: pull the mouth corner up and out.
    addRadial(deltas.mouthSmileLeft, i, p, mouthL, mouthW * 0.55, smileLDir, mouthW * 0.42)
    addRadial(deltas.mouthSmileRight, i, p, mouthR, mouthW * 0.55, smileRDir, mouthW * 0.42)
    // funnel ("oh"): lips push forward, rounded.
    addRadial(deltas.mouthFunnel, i, p, mouthC, mouthW * 0.5, forward, mouthW * 0.32)
    // pucker ("ou"): forward + squeezed horizontally toward the mouth center.
    {
      const w = gauss(p.distanceTo(mouthC), mouthW * 0.5)
      if (w > 1e-4) {
        const lateral = mouthC.clone().sub(p)
        const along = lateral.dot(right)
        tmp.copy(forward).multiplyScalar(mouthW * 0.22 * w)
        tmp.addScaledVector(right, along * 0.5 * w)
        addDelta(deltas.mouthPucker, i, tmp)
      }
    }
    // blink L/R: upper-eyelid vertices drop toward the eye center.
    addBlink(deltas.eyeBlinkLeft, i, p, eyeL, eyeW * 0.33, up)
    addBlink(deltas.eyeBlinkRight, i, p, eyeR, eyeW * 0.33, up)
  }

  // Attach as relative morph targets and refresh the mesh.
  geo.morphTargetsRelative = true
  const existing = geo.morphAttributes.position ?? []
  // Drop any morphs we created before (same names), keep foreign ones.
  const generated = new Set<string>(GENERATED_SHAPES)
  const kept = existing.filter((a) => !generated.has((a as THREE.BufferAttribute).name))
  for (const name of GENERATED_SHAPES) {
    const attr = new THREE.Float32BufferAttribute(deltas[name], 3)
    attr.name = name
    kept.push(attr)
  }
  geo.morphAttributes.position = kept
  mesh.updateMorphTargets() // rebuilds morphTargetDictionary + influences from names
  return [...GENERATED_SHAPES]
}

function addDelta(arr: Float32Array, i: number, d: THREE.Vector3): void {
  arr[i * 3] += d.x
  arr[i * 3 + 1] += d.y
  arr[i * 3 + 2] += d.z
}

/** Displace vertices near `center` (Gaussian falloff) along a fixed direction. */
function addRadial(
  arr: Float32Array,
  i: number,
  p: THREE.Vector3,
  center: THREE.Vector3,
  sigma: number,
  dir: THREE.Vector3,
  amp: number,
): void {
  const w = gauss(p.distanceTo(center), sigma)
  if (w <= 1e-4) return
  arr[i * 3] += dir.x * amp * w
  arr[i * 3 + 1] += dir.y * amp * w
  arr[i * 3 + 2] += dir.z * amp * w
}

/** Pull only the UPPER-lid vertices (those above the eye center) down to close. */
function addBlink(
  arr: Float32Array,
  i: number,
  p: THREE.Vector3,
  eye: THREE.Vector3,
  sigma: number,
  up: THREE.Vector3,
): void {
  const above = p.clone().sub(eye).dot(up) // >0 above eye center
  if (above <= 0) return
  const w = gauss(p.distanceTo(eye), sigma) * clamp01(above / sigma)
  if (w <= 1e-4) return
  const drop = Math.min(above, sigma) * w
  arr[i * 3] -= up.x * drop
  arr[i * 3 + 1] -= up.y * drop
  arr[i * 3 + 2] -= up.z * drop
}

function meshCentroid(pos: THREE.BufferAttribute): THREE.Vector3 {
  const c = new THREE.Vector3()
  const n = pos.count
  for (let i = 0; i < n; i++) c.x += pos.getX(i), (c.y += pos.getY(i)), (c.z += pos.getZ(i))
  return c.multiplyScalar(1 / Math.max(1, n))
}

// ── Persistence ───────────────────────────────────────────────────────────────
// Landmarks (not the heavy morphs) are saved per model URL, so a generated model
// keeps its facial rig across reloads and in the OBS view. Uploaded blob: URLs
// change each session, so for those the rig lasts only the session.

const STORE_KEY = 'gr3d.faceRig.v1'

type RigStore = Record<string, FaceLandmarks>

function readStore(): RigStore {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as RigStore
  } catch {
    return {}
  }
}

/** A stable key for a model URL (strips volatile query strings / blob noise). */
export function rigKey(url: string): string {
  if (!url) return ''
  if (url.startsWith('blob:')) return url // session-only, still de-dupes within a session
  return url.split('?')[0]
}

export function saveLandmarks(url: string, lm: FaceLandmarks): void {
  const key = rigKey(url)
  if (!key) return
  const store = readStore()
  store[key] = lm
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* storage full / unavailable — rig still applies this session */
  }
}

export function loadLandmarks(url: string): FaceLandmarks | null {
  const key = rigKey(url)
  if (!key) return null
  return readStore()[key] ?? null
}

export function clearLandmarks(url: string): void {
  const key = rigKey(url)
  if (!key) return
  const store = readStore()
  delete store[key]
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}
