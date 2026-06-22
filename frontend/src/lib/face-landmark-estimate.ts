/**
 * Geometry-based face-landmark estimation — places the rig landmarks (eyes,
 * mouth corners, lips, brows, jaw) on ANY humanoid mesh, regardless of where it
 * came from (photo-derived OR drawing/illustration-derived, any art style).
 *
 * Why this matters: the live webcam tracking uses the *user's* real face, so it
 * never cared about the avatar's style. But the rig needs landmarks placed on the
 * *avatar mesh* — and a stylized/drawn humanoid (huge eyes, flat face, exaggerated
 * chin) breaks a naive bounding-box guess. This estimator is style-agnostic
 * because it works from geometry: it positions each landmark by facial proportion
 * and then SNAPS it onto the actual front surface of the mesh, and mirrors the
 * left/right pairs so the derived face frame is clean. It only *estimates* — the
 * user can still nudge any point in the rig panel.
 *
 * Convention (shared with procedural-face-rig): mesh-local X=right, Y=up,
 * Z=forward. We assume the face looks toward +Z (the common output of the
 * generators); if a model faces the other way the user flips it / re-marks. All
 * outputs are guarded against NaN/degenerate meshes (returns null instead).
 */
import * as THREE from 'three'
import { meshCentroid, type FaceLandmarks } from './procedural-face-rig'

type V3 = [number, number, number]

/** Vertical position (fraction of mesh height, 0=bottom) and half-width (fraction
 * of mesh width) of each feature on a humanoid face. Tuned to the canon used by
 * the previous guess; snapping to the surface absorbs per-style differences. */
const PROPORTIONS = {
  eyeY: 0.62,
  eyeDX: 0.2,
  browY: 0.7,
  browDX: 0.2,
  mouthCornerY: 0.38,
  mouthCornerDX: 0.13,
  upperLipY: 0.43,
  lowerLipY: 0.35,
  jawY: 0.13,
}

/**
 * Estimate landmarks for `mesh`. Returns null if the geometry is missing or
 * degenerate (caller should fall back to a manual/bounding-box guess).
 */
export function estimateFaceLandmarks(mesh: THREE.Mesh): FaceLandmarks | null {
  const geo = mesh.geometry as THREE.BufferGeometry | undefined
  const pos = geo?.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos || pos.count < 4) return null

  geo!.computeBoundingBox()
  const bb = geo!.boundingBox
  if (!bb) return null
  const size = new THREE.Vector3()
  bb.getSize(size)
  const W = size.x
  const H = size.y
  if (!(W > 1e-6) || !(H > 1e-6)) return null

  const cx = (bb.min.x + bb.max.x) / 2
  const centroid = meshCentroid(pos)

  // Front hemisphere = vertices on the +Z side of the centroid (the face side).
  const front: number[] = []
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) - centroid.z >= 0) front.push(i)
  }
  const pool = front.length >= 8 ? front : range(pos.count) // safety net

  // Surface point whose (x,y) is nearest the target (x,y); keeps the real z.
  const snap = (x: number, y: number): V3 => {
    let best = pool[0]
    let bd = Infinity
    for (const i of pool) {
      const dx = pos.getX(i) - x
      const dy = pos.getY(i) - y
      const d = dx * dx + dy * dy
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return [pos.getX(best), pos.getY(best), pos.getZ(best)]
  }

  const yAt = (f: number) => bb.min.y + H * f

  // Symmetric pair: snap both sides, then mirror x and average y/z for a clean,
  // symmetric face frame even if the mesh is a little lopsided.
  const pair = (dxFrac: number, yFrac: number): [V3, V3] => {
    const y = yAt(yFrac)
    const l = snap(cx - W * dxFrac, y)
    const r = snap(cx + W * dxFrac, y)
    const offset = (Math.abs(l[0] - cx) + Math.abs(r[0] - cx)) / 2
    const my = (l[1] + r[1]) / 2
    const mz = (l[2] + r[2]) / 2
    return [
      [cx - offset, my, mz],
      [cx + offset, my, mz],
    ]
  }

  // Centre point: snap at the symmetry plane, force x onto it.
  const mid = (yFrac: number): V3 => {
    const p = snap(cx, yAt(yFrac))
    return [cx, p[1], p[2]]
  }

  const [eyeLeft, eyeRight] = pair(PROPORTIONS.eyeDX, PROPORTIONS.eyeY)
  const [browLeft, browRight] = pair(PROPORTIONS.browDX, PROPORTIONS.browY)
  const [mouthLeft, mouthRight] = pair(PROPORTIONS.mouthCornerDX, PROPORTIONS.mouthCornerY)
  const upperLip = mid(PROPORTIONS.upperLipY)
  const lowerLip = mid(PROPORTIONS.lowerLipY)
  const jaw = mid(PROPORTIONS.jawY)

  const lm: FaceLandmarks = {
    eyeLeft, eyeRight, mouthLeft, mouthRight, upperLip, lowerLip, browLeft, browRight, jaw,
  }
  return allFinite(lm) ? lm : null
}

function range(n: number): number[] {
  const a = new Array<number>(n)
  for (let i = 0; i < n; i++) a[i] = i
  return a
}

function allFinite(lm: FaceLandmarks): boolean {
  for (const v of Object.values(lm)) {
    if (!v) continue
    if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) return false
  }
  return true
}
