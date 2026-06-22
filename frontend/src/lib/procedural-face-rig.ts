/**
 * Procedural facial rig — generates the full high-impact ARKit blendshape set on
 * ANY mesh from a handful of user-placed landmarks. This is what lets the live
 * studio (and an exported VRM) drive real speech + expressions — open/close
 * mouth, smile/frown, blink/squint/wide, brows, jaw sideways/forward, cheeks,
 * nose, tongue — on humans AND non-human creatures, where transferring a human
 * face template never aligns.
 *
 * Approach: from the marks we build a face-local frame (right/up/forward, derived
 * from the landmarks so it's orientation-independent) and synthesize each
 * blendshape as anatomically-plausible vertex displacement with Gaussian falloff.
 * The upper/lower-lip landmarks make the mouth open by parting the lips (not just
 * dropping a block), which reads far better. Strength is tunable via `gain`.
 *
 * Shapes are named exactly like MediaPipe's ARKit categories, so
 * {@link applyFaceToGlbMorphs} drives them 1:1 from the webcam.
 */
import * as THREE from 'three'

export type LandmarkKey =
  | 'eyeLeft' | 'eyeRight'
  | 'mouthLeft' | 'mouthRight'
  | 'upperLip' | 'lowerLip'
  | 'browLeft' | 'browRight'
  | 'jaw'

/** Landmark positions in the target mesh's LOCAL space (geometry coordinates). */
export interface FaceLandmarks {
  eyeLeft: V3
  eyeRight: V3
  mouthLeft: V3
  mouthRight: V3
  upperLip: V3
  lowerLip: V3
  browLeft?: V3
  browRight?: V3
  jaw?: V3
}
type V3 = [number, number, number]

/** The ARKit morph targets this rig generates (the high-impact subset). */
export const GENERATED_SHAPES = [
  'jawOpen', 'mouthClose', 'jawForward', 'jawLeft', 'jawRight',
  'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthShrugUpper', 'mouthShrugLower', 'mouthRollUpper', 'mouthRollLower',
  'mouthPressLeft', 'mouthPressRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'browInnerUp', 'browDownLeft', 'browDownRight', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight',
  'tongueOut',
] as const

const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2])
const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Face-local frame + scales derived from the landmarks. Shared by the morph
 * generator and the procedural mouth-interior builder so they agree by
 * construction. `centroid` (mesh centroid) orients `fwd` outward.
 */
export interface FaceFrame {
  right: THREE.Vector3
  up: THREE.Vector3
  fwd: THREE.Vector3
  mouthC: THREE.Vector3
  eyeMid: THREE.Vector3
  mouthW: number
  mouthH: number
  eyeW: number
  faceH: number
}

export function computeFaceFrame(lm: FaceLandmarks, centroid?: THREE.Vector3): FaceFrame {
  const eyeL = v(lm.eyeLeft)
  const eyeR = v(lm.eyeRight)
  const mouthL = v(lm.mouthLeft)
  const mouthR = v(lm.mouthRight)
  const upLip = v(lm.upperLip)
  const loLip = v(lm.lowerLip)
  const mouthC = mouthL.clone().add(mouthR).multiplyScalar(0.5)
  const eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5)
  const right = mouthR.clone().sub(mouthL).normalize()
  const up = eyeMid.clone().sub(mouthC)
  up.addScaledVector(right, -up.dot(right)).normalize()
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize()
  if (centroid && mouthC.clone().sub(centroid).dot(fwd) < 0) fwd.negate()
  return {
    right, up, fwd, mouthC, eyeMid,
    mouthW: Math.max(1e-5, mouthL.distanceTo(mouthR)),
    mouthH: Math.max(mouthL.distanceTo(mouthR) * 0.18, upLip.distanceTo(loLip)),
    eyeW: Math.max(1e-5, eyeL.distanceTo(eyeR)),
    faceH: Math.max(1e-5, eyeMid.distanceTo(mouthC)),
  }
}

export function meshCentroid(pos: THREE.BufferAttribute): THREE.Vector3 {
  const c = new THREE.Vector3()
  const n = pos.count
  for (let i = 0; i < n; i++) c.x += pos.getX(i), (c.y += pos.getY(i)), (c.z += pos.getZ(i))
  return c.multiplyScalar(1 / Math.max(1, n))
}

/**
 * Generate procedural morph targets on `mesh` from `lm`. `gain` scales the
 * overall expression strength (1 = natural, higher = more exaggerated). Adds
 * (relative) morph attributes named per {@link GENERATED_SHAPES}, refreshes the
 * mesh's morphTargetDictionary/Influences, and returns the created names.
 */
export function buildProceduralMorphs(mesh: THREE.Mesh, lm: FaceLandmarks, gain = 1.5): string[] {
  const geo = mesh.geometry as THREE.BufferGeometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) throw new Error('A malha selecionada não tem vértices (position).')
  const n = pos.count

  const eyeL = v(lm.eyeLeft)
  const eyeR = v(lm.eyeRight)
  const mouthL = v(lm.mouthLeft)
  const mouthR = v(lm.mouthRight)
  const upLip = v(lm.upperLip)
  const loLip = v(lm.lowerLip)
  const mouthC = mouthL.clone().add(mouthR).multiplyScalar(0.5)
  const eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5)

  // Face-local frame from the landmarks (orientation-independent).
  const right = mouthR.clone().sub(mouthL).normalize()
  const up = eyeMid.clone().sub(mouthC)
  up.addScaledVector(right, -up.dot(right)).normalize()
  const fwd = new THREE.Vector3().crossVectors(right, up).normalize()
  const centroid = meshCentroid(pos)
  if (mouthC.clone().sub(centroid).dot(fwd) < 0) fwd.negate()

  // Scales.
  const mouthW = Math.max(1e-5, mouthL.distanceTo(mouthR))
  const mouthH = Math.max(mouthW * 0.18, upLip.distanceTo(loLip))
  const eyeW = Math.max(1e-5, eyeL.distanceTo(eyeR))
  const faceH = Math.max(1e-5, eyeMid.distanceTo(mouthC))
  const eyeR0 = eyeW * 0.18 // approx eye radius

  // Derived points (used when explicit landmarks aren't given).
  const browL = lm.browLeft ? v(lm.browLeft) : eyeL.clone().addScaledVector(up, eyeR0 * 1.8)
  const browR = lm.browRight ? v(lm.browRight) : eyeR.clone().addScaledVector(up, eyeR0 * 1.8)
  const browMid = browL.clone().add(browR).multiplyScalar(0.5)
  const nose = mouthC.clone().addScaledVector(up, faceH * 0.42)
  const cheekL = mouthL.clone().addScaledVector(up, faceH * 0.3).addScaledVector(right, -mouthW * 0.15)
  const cheekR = mouthR.clone().addScaledVector(up, faceH * 0.3).addScaledVector(right, mouthW * 0.15)
  const jawTip = lm.jaw ? v(lm.jaw) : mouthC.clone().addScaledVector(up, -faceH * 0.75)

  // Common directions (outward = away from mouth center at each corner).
  const outL = right.clone().negate()
  const outR = right.clone()

  const deltas: Record<string, Float32Array> = {}
  for (const name of GENERATED_SHAPES) deltas[name] = new Float32Array(n * 3)

  const p = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const mAmp = mouthW * 0.5 * gain // mouth displacement unit
  const eAmp = eyeR0 * gain // eye displacement unit
  const bAmp = eyeW * 0.18 * gain // brow displacement unit

  for (let i = 0; i < n; i++) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const belowMouth = mouthC.clone().sub(p).dot(up) // >0 below mouth line
    const belowUpLip = upLip.clone().sub(p).dot(up) // >0 below the upper lip

    // ── JAW / OPEN ──────────────────────────────────────────────────────────
    // Mouth opens by dropping the lower lip + chin while the upper lip stays.
    {
      let w = 0
      const wLip = gauss(p.distanceTo(loLip), mouthW * 0.6) * clamp01(belowUpLip / (mouthH * 0.5))
      const wJaw = gauss(p.distanceTo(jawTip), faceH * 1.0) * clamp01(belowMouth / (faceH * 0.5))
      w = wLip
      add(deltas.jawOpen, i, tmp.copy(up).multiplyScalar(-(mouthH * 1.6 + faceH * 0.12) * gain * w))
      add(deltas.jawOpen, i, tmp.copy(fwd).multiplyScalar(-faceH * 0.18 * gain * wJaw))
      add(deltas.jawOpen, i, tmp.copy(up).multiplyScalar(-faceH * 0.5 * gain * wJaw))
      // mouthClose: lower lip toward upper lip.
      add(deltas.mouthClose, i, tmp.copy(up).multiplyScalar(mouthH * 0.7 * gain * wLip))
    }
    // jaw sideways / forward (lower face region).
    {
      const wj = gauss(p.distanceTo(jawTip), faceH * 1.0) * clamp01(belowMouth / (faceH * 0.4))
      add(deltas.jawForward, i, tmp.copy(fwd).multiplyScalar(faceH * 0.3 * gain * wj))
      add(deltas.jawLeft, i, tmp.copy(right).multiplyScalar(-faceH * 0.28 * gain * wj))
      add(deltas.jawRight, i, tmp.copy(right).multiplyScalar(faceH * 0.28 * gain * wj))
    }

    // ── LIPS / MOUTH SHAPES ─────────────────────────────────────────────────
    radial(deltas.mouthSmileLeft, i, p, mouthL, mouthW * 0.55, dir(tmp, up, 1, right, -0.55), mAmp * 0.9)
    radial(deltas.mouthSmileRight, i, p, mouthR, mouthW * 0.55, dir(tmp, up, 1, right, 0.55), mAmp * 0.9)
    radial(deltas.mouthFrownLeft, i, p, mouthL, mouthW * 0.55, dir(tmp, up, -1, right, -0.4), mAmp * 0.8)
    radial(deltas.mouthFrownRight, i, p, mouthR, mouthW * 0.55, dir(tmp, up, -1, right, 0.4), mAmp * 0.8)
    radial(deltas.mouthStretchLeft, i, p, mouthL, mouthW * 0.5, outL, mAmp * 0.9)
    radial(deltas.mouthStretchRight, i, p, mouthR, mouthW * 0.5, outR, mAmp * 0.9)
    radial(deltas.mouthDimpleLeft, i, p, mouthL, mouthW * 0.4, dir(tmp, fwd, -1, right, -0.3), mAmp * 0.5)
    radial(deltas.mouthDimpleRight, i, p, mouthR, mouthW * 0.4, dir(tmp, fwd, -1, right, 0.3), mAmp * 0.5)
    // funnel (O) + pucker (U): forward, rounded / squeezed.
    {
      const wC = gauss(p.distanceTo(mouthC), mouthW * 0.55)
      add(deltas.mouthFunnel, i, tmp.copy(fwd).multiplyScalar(mAmp * 0.85 * wC))
      const lateral = mouthC.clone().sub(p).dot(right)
      add(deltas.mouthPucker, i, tmp.copy(fwd).multiplyScalar(mAmp * 0.7 * wC))
      add(deltas.mouthPucker, i, tmp.copy(right).multiplyScalar(lateral * 0.5 * gain * wC))
    }
    // mouth shift left/right (whole mouth).
    {
      const wM = gauss(p.distanceTo(mouthC), mouthW * 0.7)
      add(deltas.mouthLeft, i, tmp.copy(right).multiplyScalar(-mAmp * 0.8 * wM))
      add(deltas.mouthRight, i, tmp.copy(right).multiplyScalar(mAmp * 0.8 * wM))
    }
    // upper lip up / lower lip down (per side).
    radial(deltas.mouthUpperUpLeft, i, p, upLip.clone().addScaledVector(right, -mouthW * 0.25), mouthW * 0.4, up, mAmp * 0.7)
    radial(deltas.mouthUpperUpRight, i, p, upLip.clone().addScaledVector(right, mouthW * 0.25), mouthW * 0.4, up, mAmp * 0.7)
    radial(deltas.mouthLowerDownLeft, i, p, loLip.clone().addScaledVector(right, -mouthW * 0.25), mouthW * 0.4, up.clone().negate(), mAmp * 0.7)
    radial(deltas.mouthLowerDownRight, i, p, loLip.clone().addScaledVector(right, mouthW * 0.25), mouthW * 0.4, up.clone().negate(), mAmp * 0.7)
    // shrug / roll / press.
    radial(deltas.mouthShrugUpper, i, p, upLip, mouthW * 0.5, up, mAmp * 0.5)
    radial(deltas.mouthShrugLower, i, p, loLip, mouthW * 0.5, up, mAmp * 0.5)
    radial(deltas.mouthRollUpper, i, p, upLip, mouthW * 0.45, dir(tmp, fwd, -1, up, -0.4), mAmp * 0.5)
    radial(deltas.mouthRollLower, i, p, loLip, mouthW * 0.45, dir(tmp, fwd, -1, up, 0.4), mAmp * 0.5)
    radial(deltas.mouthPressLeft, i, p, mouthL.clone().addScaledVector(up, -mouthH * 0.1), mouthW * 0.45, up, mAmp * 0.35)
    radial(deltas.mouthPressRight, i, p, mouthR.clone().addScaledVector(up, -mouthH * 0.1), mouthW * 0.45, up, mAmp * 0.35)

    // ── EYES ────────────────────────────────────────────────────────────────
    blink(deltas.eyeBlinkLeft, i, p, eyeL, eyeR0, up)
    blink(deltas.eyeBlinkRight, i, p, eyeR, eyeR0, up)
    // squint: lower lid up.
    lowerLid(deltas.eyeSquintLeft, i, p, eyeL, eyeR0, up, eAmp * 0.6)
    lowerLid(deltas.eyeSquintRight, i, p, eyeR, eyeR0, up, eAmp * 0.6)
    // wide: upper lid up (open more).
    upperLid(deltas.eyeWideLeft, i, p, eyeL, eyeR0, up, eAmp * 0.5)
    upperLid(deltas.eyeWideRight, i, p, eyeR, eyeR0, up, eAmp * 0.5)

    // ── BROWS ───────────────────────────────────────────────────────────────
    radial(deltas.browInnerUp, i, p, browMid, eyeW * 0.4, up, bAmp * 1.1)
    radial(deltas.browDownLeft, i, p, browL, eyeW * 0.3, up.clone().negate(), bAmp)
    radial(deltas.browDownRight, i, p, browR, eyeW * 0.3, up.clone().negate(), bAmp)
    radial(deltas.browOuterUpLeft, i, p, browL.clone().addScaledVector(right, -eyeW * 0.2), eyeW * 0.28, up, bAmp)
    radial(deltas.browOuterUpRight, i, p, browR.clone().addScaledVector(right, eyeW * 0.2), eyeW * 0.28, up, bAmp)

    // ── CHEEKS / NOSE / TONGUE ──────────────────────────────────────────────
    radial(deltas.cheekPuff, i, p, cheekL, mouthW * 0.6, fwd, mAmp * 0.8)
    radial(deltas.cheekPuff, i, p, cheekR, mouthW * 0.6, fwd, mAmp * 0.8)
    radial(deltas.cheekSquintLeft, i, p, cheekL, mouthW * 0.5, up, eAmp * 0.5)
    radial(deltas.cheekSquintRight, i, p, cheekR, mouthW * 0.5, up, eAmp * 0.5)
    radial(deltas.noseSneerLeft, i, p, nose.clone().addScaledVector(right, -mouthW * 0.2), mouthW * 0.35, up, mAmp * 0.4)
    radial(deltas.noseSneerRight, i, p, nose.clone().addScaledVector(right, mouthW * 0.2), mouthW * 0.35, up, mAmp * 0.4)
    // tongueOut: approximate — push a small region just inside the lower lip forward+down.
    radial(deltas.tongueOut, i, p, loLip.clone().addScaledVector(fwd, -mouthW * 0.1), mouthW * 0.3, dir(tmp, fwd, 1, up, -0.3), mAmp * 0.7)
  }

  // Attach as relative morph targets and refresh the mesh.
  geo.morphTargetsRelative = true
  const existing = geo.morphAttributes.position ?? []
  const generated = new Set<string>(GENERATED_SHAPES)
  const kept = existing.filter((a) => !generated.has((a as THREE.BufferAttribute).name))
  for (const name of GENERATED_SHAPES) {
    const attr = new THREE.Float32BufferAttribute(deltas[name], 3)
    attr.name = name
    kept.push(attr)
  }
  geo.morphAttributes.position = kept
  mesh.updateMorphTargets()
  return [...GENERATED_SHAPES]
}

// ── primitives ────────────────────────────────────────────────────────────────

function add(arr: Float32Array, i: number, d: THREE.Vector3): void {
  arr[i * 3] += d.x
  arr[i * 3 + 1] += d.y
  arr[i * 3 + 2] += d.z
}

/** A direction `a*va + b*vb`, normalized, written into `out`. */
function dir(out: THREE.Vector3, va: THREE.Vector3, a: number, vb: THREE.Vector3, b: number): THREE.Vector3 {
  return out.copy(va).multiplyScalar(a).addScaledVector(vb, b).normalize()
}

function radial(arr: Float32Array, i: number, p: THREE.Vector3, center: THREE.Vector3, sigma: number, d: THREE.Vector3, amp: number): void {
  const w = gauss(p.distanceTo(center), sigma)
  if (w <= 1e-4) return
  arr[i * 3] += d.x * amp * w
  arr[i * 3 + 1] += d.y * amp * w
  arr[i * 3 + 2] += d.z * amp * w
}

/** Close the eye: the UPPER lid drops to the eye center. */
function blink(arr: Float32Array, i: number, p: THREE.Vector3, eye: THREE.Vector3, r: number, up: THREE.Vector3): void {
  const above = p.clone().sub(eye).dot(up) // >0 above eye center
  if (above <= -r * 0.2) return
  const w = gauss(p.distanceTo(eye), r * 1.5) * clamp01((above + r * 0.2) / (r * 1.2))
  if (w <= 1e-4) return
  const drop = (Math.max(0, above) + r * 0.5) * w
  arr[i * 3] -= up.x * drop
  arr[i * 3 + 1] -= up.y * drop
  arr[i * 3 + 2] -= up.z * drop
}

/** Raise the lower lid (squint). */
function lowerLid(arr: Float32Array, i: number, p: THREE.Vector3, eye: THREE.Vector3, r: number, up: THREE.Vector3, amp: number): void {
  const below = eye.clone().sub(p).dot(up)
  if (below <= 0) return
  const w = gauss(p.distanceTo(eye), r * 1.2) * clamp01(below / r)
  radialDir(arr, i, up, amp * w)
}

/** Raise the upper lid (eye wide). */
function upperLid(arr: Float32Array, i: number, p: THREE.Vector3, eye: THREE.Vector3, r: number, up: THREE.Vector3, amp: number): void {
  const above = p.clone().sub(eye).dot(up)
  if (above <= 0) return
  const w = gauss(p.distanceTo(eye), r * 1.2) * clamp01(above / r)
  radialDir(arr, i, up, amp * w)
}

function radialDir(arr: Float32Array, i: number, d: THREE.Vector3, s: number): void {
  arr[i * 3] += d.x * s
  arr[i * 3 + 1] += d.y * s
  arr[i * 3 + 2] += d.z * s
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORE_KEY = 'gr3d.faceRig.v2'
type RigStore = Record<string, FaceLandmarks>

function readStore(): RigStore {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as RigStore
  } catch {
    return {}
  }
}

export function rigKey(url: string): string {
  if (!url) return ''
  if (url.startsWith('blob:')) return url
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
    /* storage full — rig still applies this session */
  }
}

export function loadLandmarks(url: string): FaceLandmarks | null {
  const key = rigKey(url)
  if (!key) return null
  const lm = readStore()[key]
  // Require the v2 fields (upper/lower lip) to apply automatically.
  if (lm && lm.upperLip && lm.lowerLip) return lm
  return null
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
