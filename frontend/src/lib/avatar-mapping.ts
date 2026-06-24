/**
 * Maps MediaPipe ARKit-style blendshapes + head pose onto a VRM avatar.
 *
 * VRM 1.0 expressions are a smaller, semantic set (aa / blink / happy / …), so
 * we translate the 52 ARKit coefficients into the closest VRM expressions and
 * apply the head pose to the humanoid head/neck bones.
 */
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { FaceFrame } from './face-tracking'

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function avg(a = 0, b = 0): number {
  return (a + b) / 2
}

/**
 * Apply a tracking frame to a VRM. `lerp` controls smoothing (0..1, higher is
 * snappier). Mutates the VRM expression weights and head/neck rotation.
 */
export function applyFaceToVrm(vrm: VRM, frame: FaceFrame, lerp = 0.5): void {
  const em = vrm.expressionManager
  const bs = frame.blendshapes

  if (em) {
    const set = (name: string, value: number) => {
      const current = em.getValue(name) ?? 0
      em.setValue(name, current + (clamp01(value) - current) * lerp)
    }

    // Mouth
    set('aa', bs['jawOpen'] ?? 0)
    set('oh', bs['mouthFunnel'] ?? 0)
    set('ou', bs['mouthPucker'] ?? 0)
    set('ih', avg(bs['mouthStretchLeft'], bs['mouthStretchRight']))

    // Eyes (blink)
    set('blinkLeft', bs['eyeBlinkLeft'] ?? 0)
    set('blinkRight', bs['eyeBlinkRight'] ?? 0)

    // Emotions (approximate)
    set('happy', avg(bs['mouthSmileLeft'], bs['mouthSmileRight']))
    set('angry', avg(bs['browDownLeft'], bs['browDownRight']))
    set('surprised', bs['browInnerUp'] ?? 0)

    // Gaze
    set('lookUp', avg(bs['eyeLookUpLeft'], bs['eyeLookUpRight']))
    set('lookDown', avg(bs['eyeLookDownLeft'], bs['eyeLookDownRight']))
    set('lookLeft', avg(bs['eyeLookOutLeft'], bs['eyeLookInRight']))
    set('lookRight', avg(bs['eyeLookInLeft'], bs['eyeLookOutRight']))

    em.update()
  }

  applyHeadPose(vrm, frame.matrix, lerp)
}

const _matrix = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _euler = new THREE.Euler()
const _targetEuler = new THREE.Euler()
const _target = new THREE.Quaternion()
const _identity = new THREE.Quaternion()
const _headTmp = new THREE.Quaternion()
const _neckTmp = new THREE.Quaternion()

/** Apply the facial transformation matrix to the head & neck bones.
 * This is the SINGLE owner of VRM head pose — do not also rotate the head/neck
 * elsewhere (the canvas only rotates the whole root for non-VRM GLBs). */
export function applyHeadPose(vrm: VRM, matrix: number[] | null, lerp: number): void {
  if (!matrix || matrix.length < 16) return
  const head = vrm.humanoid?.getNormalizedBoneNode('head')
  const neck = vrm.humanoid?.getNormalizedBoneNode('neck')

  _matrix.fromArray(matrix)
  _matrix.decompose(_pos, _quat, _scale)
  _euler.setFromQuaternion(_quat, 'YXZ')

  // Webcam image is mirrored → flip yaw and roll. Dampen the magnitudes so the
  // avatar's head movement reads naturally. No per-frame allocation.
  _target.setFromEuler(_targetEuler.set(_euler.x * 0.6, -_euler.y * 0.6, -_euler.z * 0.6, 'YXZ'))

  if (head) head.quaternion.slerp(_headTmp.slerpQuaternions(_identity, _target, 0.7), lerp)
  if (neck) neck.quaternion.slerp(_neckTmp.slerpQuaternions(_identity, _target, 0.3), lerp)
}

/**
 * Drive a GLB's ARKit-named morph targets directly from the tracking frame.
 *
 * Generated/rigged GLBs carry morph targets named exactly like the ARKit
 * blendshapes MediaPipe outputs (jawOpen, eyeBlinkLeft, mouthSmileLeft, …), so
 * we can map them 1:1 without VRM. No-op for meshes without morph targets.
 */
export function applyFaceToGlbMorphs(
  root: THREE.Object3D,
  frame: FaceFrame,
  lerp = 0.5,
): boolean {
  const bs = frame.blendshapes
  let drove = false
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    const dict = (mesh as THREE.Mesh).morphTargetDictionary
    const inf = (mesh as THREE.Mesh).morphTargetInfluences
    if (!dict || !inf) return
    for (const name in dict) {
      // Só dirige morphs cujo nome é um blendshape que estamos rastreando
      // (jawOpen, mouthSmileLeft, eyeBlinkLeft, ...). Morphs de outros nomes —
      // ex.: VRMs "semânticos" com 'Fcl_MTH_A' ou morphs de roupa/cabelo — NÃO
      // são tocados; do contrário os zeraríamos, brigando com o expressionManager.
      if (!(name in bs)) continue
      const idx = dict[name]
      const target = clamp01(bs[name])
      const cur = inf[idx] ?? 0
      inf[idx] = cur + (target - cur) * lerp
      if (target > 0) drove = true
    }
  })
  return drove
}

/** Whether a GLB scene has any morph targets (so we can drive expressions). */
export function glbHasMorphTargets(root: THREE.Object3D): boolean {
  let has = false
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 0) {
      has = true
    }
  })
  return has
}

/**
 * Apply a tracking frame to a procedural head group (the demo fallback used
 * when no VRM is loaded). Drives jaw, eye blinks and head rotation directly.
 */
export function applyFaceToProcedural(
  head: THREE.Group,
  jaw: THREE.Object3D | null,
  eyeL: THREE.Object3D | null,
  eyeR: THREE.Object3D | null,
  frame: FaceFrame,
  lerp = 0.4,
): void {
  const bs = frame.blendshapes

  if (jaw) {
    const open = clamp01(bs['jawOpen'] ?? 0)
    jaw.scale.y += (0.4 + open * 1.4 - jaw.scale.y) * lerp
    jaw.position.y += (-0.18 - open * 0.18 - jaw.position.y) * lerp
  }
  if (eyeL) {
    const blink = 1 - clamp01(bs['eyeBlinkLeft'] ?? 0)
    eyeL.scale.y += (blink - eyeL.scale.y) * lerp
  }
  if (eyeR) {
    const blink = 1 - clamp01(bs['eyeBlinkRight'] ?? 0)
    eyeR.scale.y += (blink - eyeR.scale.y) * lerp
  }

  if (frame.matrix && frame.matrix.length >= 16) {
    _matrix.fromArray(frame.matrix)
    _matrix.decompose(_pos, _quat, _scale)
    _euler.setFromQuaternion(_quat, 'YXZ')
    _target.setFromEuler(_targetEuler.set(_euler.x * 0.6, -_euler.y * 0.6, -_euler.z * 0.6, 'YXZ'))
    head.quaternion.slerp(_target, lerp)
  }
}
