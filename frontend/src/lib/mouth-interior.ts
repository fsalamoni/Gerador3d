/**
 * Procedural mouth interior — generates the anatomy that uploaded/sculpted
 * heads usually lack: a dark mouth cavity, upper/lower teeth and a tongue,
 * placed at the marked mouth and oriented by the face frame.
 *
 * Unlike {@link buildProceduralMorphs} (which only *deforms* the existing
 * surface), this *creates new geometry*. The pieces carry their own ARKit-named
 * morphs (`jawOpen`, `tongueOut`) so the live driver animates them in sync with
 * the face: the lips part (face morph) → the dark cavity shows; the lower teeth
 * and tongue drop with the jaw; `tongueOut` extends the tongue past the lips.
 *
 * It's an approximation (real per-species anatomy can't be inferred from an
 * arbitrary mesh), built conservatively *behind* the lip surface so it stays
 * hidden until the mouth opens.
 */
import * as THREE from 'three'
import { computeFaceFrame, meshCentroid, type FaceLandmarks } from './procedural-face-rig'

export const MOUTH_INTERIOR_NAME = 'GR3D_MouthInterior'

/** Per-vertex morph delta in mouth-frame coords (x=right, y=up, z=fwd). */
type DeltaFn = (x: number, y: number, z: number) => [number, number, number]

export interface MouthOptions {
  /** Add pointed canine fangs (creatures: feline/canine/reptile). */
  fangs?: boolean
  /** Teeth colour (default off-white). */
  teethColor?: number
  /** Tongue colour (default pink-red). */
  tongueColor?: number
  /** Cavity colour (default near-black). */
  cavityColor?: number
}

/**
 * Build the mouth-interior group in `faceMesh`'s local space. Add it as a child
 * of `faceMesh` so it inherits the head transform. Returns null if the mouth
 * landmarks are degenerate.
 */
export function buildMouthInterior(
  faceMesh: THREE.Mesh,
  lm: FaceLandmarks,
  opts: MouthOptions = {},
): THREE.Group | null {
  const pos = (faceMesh.geometry as THREE.BufferGeometry).getAttribute('position') as
    | THREE.BufferAttribute
    | undefined
  if (!pos) return null
  const f = computeFaceFrame(lm, meshCentroid(pos))
  const W = f.mouthW
  const H = Math.max(f.mouthH, W * 0.22)
  const D = H // cavity depth scale
  if (!(W > 1e-5) || !(H > 1e-5)) return null

  // mouth-frame → mesh-local: columns right/up/fwd, origin at the mouth centre.
  const basis = new THREE.Matrix4().makeBasis(f.right, f.up, f.fwd).setPosition(f.mouthC)
  const rot = new THREE.Matrix3().setFromMatrix4(basis)

  const group = new THREE.Group()
  group.name = MOUTH_INTERIOR_NAME
  group.userData.gr3dMouthInterior = true

  const cavityMat = new THREE.MeshStandardMaterial({ color: opts.cavityColor ?? 0x1a0a0a, roughness: 1, metalness: 0, side: THREE.DoubleSide })
  const teethMat = new THREE.MeshStandardMaterial({ color: opts.teethColor ?? 0xf2ece2, roughness: 0.5, metalness: 0 })
  const tongueMat = new THREE.MeshStandardMaterial({ color: opts.tongueColor ?? 0xc05a5a, roughness: 0.7, metalness: 0 })

  // 1) Dark cavity — a recessed back wall the parted lips reveal.
  {
    const g = new THREE.PlaneGeometry(W * 0.92, H * 2.4)
    g.translate(0, 0, -D * 0.85)
    group.add(part(g, basis, rot, [], cavityMat, 'cavity'))
  }
  // 2) Upper teeth — static white strip just inside the upper lip.
  {
    const g = new THREE.BoxGeometry(W * 0.72, H * 0.34, D * 0.3)
    g.translate(0, H * 0.5, -D * 0.22)
    group.add(part(g, basis, rot, [], teethMat, 'upperTeeth'))
  }
  // 3) Lower teeth — drop with the jaw.
  {
    const g = new THREE.BoxGeometry(W * 0.72, H * 0.34, D * 0.3)
    g.translate(0, -H * 0.5, -D * 0.22)
    const jawDrop: DeltaFn = () => [0, -H * 1.0, 0]
    group.add(part(g, basis, rot, [{ name: 'jawOpen', delta: jawDrop }], teethMat, 'lowerTeeth'))
  }
  // 4) Tongue — flattened, follows the jaw a little; tongueOut extends it out.
  {
    const g = new THREE.SphereGeometry(W * 0.27, 18, 12)
    g.scale(1, 0.42, 1.15)
    g.translate(0, -H * 0.32, -D * 0.5)
    const jawDrop: DeltaFn = () => [0, -H * 0.7, 0]
    // Front of the tongue (z > centre) reaches a little further for a natural
    // curl. Kept modest so a full tongueOut peeks past the lips, not a huge slab.
    const stickOut: DeltaFn = (_x, _y, z) => [0, H * 0.1, D * 0.8 + Math.max(0, z) * 0.8]
    group.add(
      part(
        g,
        basis,
        rot,
        [
          { name: 'jawOpen', delta: jawDrop },
          { name: 'tongueOut', delta: stickOut },
        ],
        tongueMat,
        'tongue',
      ),
    )
  }
  // 5) Fangs (creatures) — pointed canines; upper static, lower drops with jaw.
  if (opts.fangs) {
    const fangH = H * 0.55
    const fangR = Math.max(W * 0.045, H * 0.06)
    const fx = W * 0.26
    for (const sx of [-1, 1] as const) {
      const side = sx < 0 ? 'L' : 'R'
      const upper = new THREE.ConeGeometry(fangR, fangH, 12)
      upper.rotateX(Math.PI) // apex points down
      upper.translate(sx * fx, H * 0.5 - fangH * 0.5, -D * 0.18)
      group.add(part(upper, basis, rot, [], teethMat, `fangUpper${side}`))

      const lower = new THREE.ConeGeometry(fangR, fangH, 12) // apex up
      lower.translate(sx * fx, -H * 0.5 + fangH * 0.5, -D * 0.18)
      const jawDrop: DeltaFn = () => [0, -H * 1.0, 0]
      group.add(part(lower, basis, rot, [{ name: 'jawOpen', delta: jawDrop }], teethMat, `fangLower${side}`))
    }
  }

  return group
}

/**
 * Turn a mouth-frame geometry into a mesh-local mesh. Morph deltas are computed
 * in mouth-frame (before the basis transform) then rotated into mesh-local, so
 * they line up with the baked base positions.
 */
function part(
  geo: THREE.BufferGeometry,
  basis: THREE.Matrix4,
  rot: THREE.Matrix3,
  morphs: { name: string; delta: DeltaFn }[],
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const n = pos.count
  if (morphs.length) {
    geo.morphTargetsRelative = true
    const attrs: THREE.BufferAttribute[] = []
    const d = new THREE.Vector3()
    for (const m of morphs) {
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const [dx, dy, dz] = m.delta(pos.getX(i), pos.getY(i), pos.getZ(i))
        d.set(dx, dy, dz).applyMatrix3(rot)
        arr[i * 3] = d.x
        arr[i * 3 + 1] = d.y
        arr[i * 3 + 2] = d.z
      }
      const a = new THREE.Float32BufferAttribute(arr, 3)
      a.name = m.name
      attrs.push(a)
    }
    geo.morphAttributes.position = attrs
  }
  geo.applyMatrix4(basis)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = `${MOUTH_INTERIOR_NAME}_${name}`
  mesh.updateMorphTargets()
  return mesh
}
