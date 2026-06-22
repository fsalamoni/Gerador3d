/**
 * Procedural eye anatomy — generates the eye structures sealed/sculpted heads
 * usually lack: an eyeball (sclera + iris + pupil) and upper/lower eyelids that
 * actually *close as geometry*, per eye, oriented by the face frame.
 *
 * This *creates new geometry* — it does NOT deform the face surface. The eyelids
 * are spherical shells hugging the eyeball; the `eyeBlinkLeft`/`eyeBlinkRight`
 * morphs sweep their free edge down/up along the eyeball so the lids meet and
 * cover the cornea (a real blink), driven live by {@link applyFaceToGlbMorphs}.
 *
 * Reference for the structure (separate eyeball + lids driven by an aperture
 * blendshape, ARKit eyeBlink naming): USC ICT-FaceKit and the Unreal Digital
 * Human eye setup. It's an approximation: on a sealed head there is no socket,
 * so the eyeball is placed mostly embedded with only the cornea proud of the
 * surface. Conservative sizes keep it from poking through. Opt-in + tunable.
 */
import * as THREE from 'three'
import { computeFaceFrame, meshCentroid, type FaceLandmarks } from './procedural-face-rig'

export const EYE_ANATOMY_NAME = 'GR3D_EyeAnatomy'

const D2R = Math.PI / 180

export interface EyeOptions {
  /** Eyeball radius as a fraction of the inter-eye distance (default 0.16). */
  radiusFrac?: number
  /** Iris colour (default warm brown). */
  irisColor?: number
  /** Eyelid (skin) colour — neutral mid-tone by default; tune per model. */
  skinColor?: number
}

/** Direction on the unit sphere around the front pole (+z=fwd). h=horizontal
 * (+=right), w=vertical (+=up); (0,0) → straight ahead. */
function dirHW(h: number, w: number, out: THREE.Vector3): THREE.Vector3 {
  const cw = Math.cos(w)
  return out.set(cw * Math.sin(h), Math.sin(w), cw * Math.cos(h))
}

/**
 * Build the eye-anatomy group in `faceMesh` local space. Add it as a child of
 * `faceMesh`. Returns null if the eye landmarks are degenerate.
 */
export function buildEyeAnatomy(
  faceMesh: THREE.Mesh,
  lm: FaceLandmarks,
  opts: EyeOptions = {},
): THREE.Group | null {
  const pos = (faceMesh.geometry as THREE.BufferGeometry).getAttribute('position') as
    | THREE.BufferAttribute
    | undefined
  if (!pos) return null
  const f = computeFaceFrame(lm, meshCentroid(pos))
  const R = Math.max(1e-4, f.eyeW * (opts.radiusFrac ?? 0.16))
  if (!(R > 1e-4)) return null

  const group = new THREE.Group()
  group.name = EYE_ANATOMY_NAME
  group.userData.gr3dEyeAnatomy = true

  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.32, metalness: 0 })
  const irisMat = new THREE.MeshStandardMaterial({ color: opts.irisColor ?? 0x5b3a1e, roughness: 0.45, metalness: 0 })
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3, metalness: 0 })
  const lidMat = new THREE.MeshStandardMaterial({ color: opts.skinColor ?? 0xc8967a, roughness: 0.85, metalness: 0, side: THREE.DoubleSide })

  for (const side of ['Left', 'Right'] as const) {
    const eyePt = vec(side === 'Left' ? lm.eyeLeft : lm.eyeRight)
    // Embed the ball so only the cornea sits proud of a (possibly socket-less) face.
    const center = eyePt.clone().addScaledVector(f.fwd, -R * 0.75)
    const basis = new THREE.Matrix4().makeBasis(f.right, f.up, f.fwd).setPosition(center)
    const rot = new THREE.Matrix3().setFromMatrix4(basis)
    const blink = side === 'Left' ? 'eyeBlinkLeft' : 'eyeBlinkRight'

    // Eyeball: white sphere + iris + pupil discs on the cornea (front pole).
    const ball = new THREE.SphereGeometry(R, 28, 20)
    ball.applyMatrix4(basis)
    ball.computeVertexNormals()
    addMesh(group, ball, scleraMat, `${side}_eyeball`)

    const iris = new THREE.CircleGeometry(R * 0.42, 24)
    iris.translate(0, 0, R * 0.985)
    iris.applyMatrix4(basis)
    addMesh(group, iris, irisMat, `${side}_iris`)

    const pupil = new THREE.CircleGeometry(R * 0.18, 20)
    pupil.translate(0, 0, R * 0.995)
    pupil.applyMatrix4(basis)
    addMesh(group, pupil, pupilMat, `${side}_pupil`)

    // Eyelids — spherical bands hugging the ball; blink sweeps the free edge.
    group.add(buildLid('upper', R, basis, rot, lidMat, blink, side))
    group.add(buildLid('lower', R, basis, rot, lidMat, blink, side))
  }

  return group
}

/**
 * One eyelid as a grid on a shell of radius ~R, from a fixed root angle to a
 * free edge. The `eyeBlink` morph moves the free edge (and graded interior) to
 * the closed angle, staying on the eyeball surface.
 */
function buildLid(
  which: 'upper' | 'lower',
  R: number,
  basis: THREE.Matrix4,
  rot: THREE.Matrix3,
  material: THREE.Material,
  blinkName: string,
  side: string,
): THREE.Mesh {
  const Rlid = R * 1.03
  const N = 14 // horizontal segments (eye width)
  const M = 6 // vertical segments (root → edge)
  const Hf = 64 * D2R // half-width of the palpebral fissure

  // Angles (radians). Upper lid sits above centre and closes downward; lower
  // lid sits below and rises a little. Almond shape: edge is highest/lowest at
  // the centre and tapers toward the corners (cos falloff).
  const up = which === 'upper'
  const wRoot = (up ? 80 : -74) * D2R
  const wOpen0 = (up ? 30 : -22) * D2R // edge angle at the centre, eye open
  const wClose0 = (up ? -9 : -5) * D2R // edge angle at the centre, eye closed

  const cols = N + 1
  const rows = M + 1
  const count = cols * rows
  const positions = new Float32Array(count * 3)
  const deltas = new Float32Array(count * 3)
  const tmp = new THREE.Vector3()
  const tmpC = new THREE.Vector3()

  const edgeAt = (h: number, w0: number) => w0 * (0.45 + 0.55 * Math.cos((h / Hf) * (Math.PI / 2)))

  let k = 0
  for (let j = 0; j < rows; j++) {
    const t = j / M
    for (let i = 0; i < cols; i++, k++) {
      const h = -Hf * 1.05 + (2 * Hf * 1.05 * i) / N
      const wEdgeOpen = edgeAt(h, wOpen0)
      const wEdgeClose = edgeAt(h, wClose0)
      const wOpen = wRoot + (wEdgeOpen - wRoot) * t
      const wClose = wRoot + (wEdgeClose - wRoot) * t
      dirHW(h, wOpen, tmp).multiplyScalar(Rlid)
      positions[k * 3] = tmp.x
      positions[k * 3 + 1] = tmp.y
      positions[k * 3 + 2] = tmp.z
      dirHW(h, wClose, tmpC).multiplyScalar(Rlid).sub(tmp) // closed − open
      deltas[k * 3] = tmpC.x
      deltas[k * 3 + 1] = tmpC.y
      deltas[k * 3 + 2] = tmpC.z
    }
  }

  // Two triangles per grid cell (wind so the outer face points away from ball).
  const idx: number[] = []
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * cols + i
      const b = a + 1
      const c = a + cols
      const d = c + 1
      if (up) idx.push(a, c, b, b, c, d)
      else idx.push(a, b, c, b, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(idx)
  // Rotate the morph deltas into mesh-local (positions get the full basis below).
  const d = new THREE.Vector3()
  const mdelta = new Float32Array(count * 3)
  for (let v = 0; v < count; v++) {
    d.set(deltas[v * 3], deltas[v * 3 + 1], deltas[v * 3 + 2]).applyMatrix3(rot)
    mdelta[v * 3] = d.x
    mdelta[v * 3 + 1] = d.y
    mdelta[v * 3 + 2] = d.z
  }
  geo.morphTargetsRelative = true
  const attr = new THREE.Float32BufferAttribute(mdelta, 3)
  attr.name = blinkName
  geo.morphAttributes.position = [attr]
  geo.applyMatrix4(basis)
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, material)
  mesh.name = `${EYE_ANATOMY_NAME}_${side}_${which}Lid`
  mesh.updateMorphTargets()
  return mesh
}

function addMesh(group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, name: string): void {
  const m = new THREE.Mesh(geo, mat)
  m.name = `${EYE_ANATOMY_NAME}_${name}`
  group.add(m)
}

function vec(p: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2])
}
