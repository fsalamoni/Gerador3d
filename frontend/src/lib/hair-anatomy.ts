/**
 * Procedural hair — a scalp "cap" that hugs the crown of the head, generated from
 * the same face landmarks the rig uses. It is *new geometry* (a shell), not a
 * deformation, following the eye/mouth-interior pattern.
 *
 * Honest scope: this is an APPROXIMATION — a solid hair volume (cap), not
 * individual strands. It covers the crown/back/sides down to roughly the hairline
 * and leaves the face open, so any humanoid (photo- or drawing-derived) gets a
 * basic head of hair that exports with the model and can be recoloured. Strand
 * cards / styling are future work.
 */
import * as THREE from 'three'
import { computeFaceFrame, meshCentroid, type FaceLandmarks } from './procedural-face-rig'

export const HAIR_NAME = 'GR3D_Hair'

export interface HairOptions {
  /** Hair colour (hex or THREE.Color). Default dark brown. */
  color?: number | THREE.Color
  /** How far down the cap reaches (0.4 high hairline … 0.8 low). Default 0.6. */
  coverage?: number
  /** Volume scale relative to the scalp (default 1.06 = slightly proud). */
  volume?: number
}

/**
 * Build the hair group in `faceMesh` local space. Returns null if the landmarks
 * are degenerate.
 */
export function buildHair(faceMesh: THREE.Mesh, lm: FaceLandmarks, opts: HairOptions = {}): THREE.Group | null {
  const pos = (faceMesh.geometry as THREE.BufferGeometry).getAttribute('position') as
    | THREE.BufferAttribute
    | undefined
  if (!pos) return null
  const f = computeFaceFrame(lm, meshCentroid(pos))
  if (!(f.eyeW > 1e-5) || !(f.faceH > 1e-5)) return null

  const vol = opts.volume ?? 1.06
  const rx = f.eyeW * 1.05 * vol // half-width
  const ry = f.faceH * 0.95 * vol // height
  const rz = f.eyeW * 1.15 * vol // depth
  // Polar sweep from the top pole; ~0.6π reaches just below the temples, leaving
  // the face (below the brows) uncovered.
  const coverage = Math.min(0.8, Math.max(0.4, opts.coverage ?? 0.6))
  const thetaLen = Math.PI * (0.5 + coverage * 0.18)

  const cap = new THREE.SphereGeometry(1, 36, 24, 0, Math.PI * 2, 0, thetaLen)
  cap.scale(rx, ry, rz)
  // head-frame → mesh-local: columns right/up/fwd, origin at the crown centre
  // (above the eyes, nudged slightly back so it doesn't sit on the forehead).
  const center = f.eyeMid
    .clone()
    .addScaledVector(f.up, f.faceH * 0.55)
    .addScaledVector(f.fwd, -f.eyeW * 0.05)
  const basis = new THREE.Matrix4().makeBasis(f.right, f.up, f.fwd).setPosition(center)
  cap.applyMatrix4(basis)
  cap.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0x2a1a12,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(cap, mat)
  mesh.name = `${HAIR_NAME}_cap`

  const group = new THREE.Group()
  group.name = HAIR_NAME
  group.userData.gr3dHair = true
  group.add(mesh)
  return group
}
