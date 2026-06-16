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
const _target = new THREE.Quaternion()

/** Apply the facial transformation matrix to the head & neck bones. */
function applyHeadPose(vrm: VRM, matrix: number[] | null, lerp: number): void {
  if (!matrix || matrix.length < 16) return
  const head = vrm.humanoid?.getNormalizedBoneNode('head')
  const neck = vrm.humanoid?.getNormalizedBoneNode('neck')

  _matrix.fromArray(matrix)
  _matrix.decompose(_pos, _quat, _scale)
  _euler.setFromQuaternion(_quat, 'YXZ')

  // Webcam image is mirrored → flip yaw and roll. Dampen the magnitudes so the
  // avatar's head movement reads naturally.
  const pitch = _euler.x * 0.6
  const yaw = -_euler.y * 0.6
  const roll = -_euler.z * 0.6

  _target.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'))

  if (head) head.quaternion.slerp(splitRotation(_target, 0.7), lerp)
  if (neck) neck.quaternion.slerp(splitRotation(_target, 0.3), lerp)
}

const _identity = new THREE.Quaternion()
function splitRotation(q: THREE.Quaternion, factor: number): THREE.Quaternion {
  return new THREE.Quaternion().slerpQuaternions(_identity, q, factor)
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
    _target.setFromEuler(
      new THREE.Euler(_euler.x * 0.6, -_euler.y * 0.6, -_euler.z * 0.6, 'YXZ'),
    )
    head.quaternion.slerp(_target, lerp)
  }
}
