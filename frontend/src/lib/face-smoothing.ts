/**
 * Face-tracking stabilization: One-Euro adaptive smoothing + neutral-face
 * calibration. Turns raw MediaPipe output into a stable, personalized signal.
 *
 * Two problems this solves, both very visible on a live avatar:
 *
 *  1. Jitter. MediaPipe blendshape coefficients and the head-pose matrix are
 *     noisy frame-to-frame. A fixed lerp either lags (when strong) or shakes
 *     (when weak). The One-Euro filter is adaptive: it smooths hard when the
 *     face is still (killing jitter) and barely at all when it moves fast
 *     (keeping it responsive). This is the same filter used by pro VTuber rigs.
 *
 *  2. A wrong "rest" pose. Nobody's resting face reads as all-zeros: people sit
 *     with a faint smile, a raised brow, a tilted head. Without calibration the
 *     avatar permanently wears that offset. Capturing a neutral baseline and
 *     subtracting it re-centers every expression on the user's real rest face.
 */
import * as THREE from 'three'
import type { FaceFrame } from './face-tracking'

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * One-Euro low-pass filter (Casiez et al., 2012). `minCutoff` sets the baseline
 * smoothing (lower = smoother/laggier at rest); `beta` sets how aggressively the
 * cutoff opens up with speed (higher = snappier on fast motion).
 */
export class OneEuroFilter {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev = 0

  constructor(
    private minCutoff = 1.4,
    private beta = 0.25,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /** Filter sample `x` taken at time `tMs` (ms, monotonic). */
  filter(x: number, tMs: number): number {
    if (this.xPrev === null || !Number.isFinite(this.xPrev)) {
      this.xPrev = x
      this.tPrev = tMs
      return x
    }
    const dt = Math.min(0.1, Math.max(1e-3, (tMs - this.tPrev) / 1000))
    this.tPrev = tMs

    const dx = (x - this.xPrev) / dt
    const aD = this.alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    this.dxPrev = dxHat

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = this.alpha(cutoff, dt)
    const xHat = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat
    return xHat
  }

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
  }
}

interface PoseEuler {
  pitch: number
  yaw: number
  roll: number
}

/**
 * Stabilizes a stream of {@link FaceFrame}s: per-channel One-Euro smoothing,
 * neutral-face calibration, and an optional expression gain. Stateful — keep
 * one instance per tracking session.
 */
export class FaceStabilizer {
  enabled = true
  /** Multiplies calibrated expression strength (1 = as tracked). */
  gain = 1.15

  private bsFilters = new Map<string, OneEuroFilter>()
  private poseFilters = {
    pitch: new OneEuroFilter(1.2, 0.2),
    yaw: new OneEuroFilter(1.2, 0.2),
    roll: new OneEuroFilter(1.2, 0.2),
    px: new OneEuroFilter(1.0, 0.1),
    py: new OneEuroFilter(1.0, 0.1),
    pz: new OneEuroFilter(1.0, 0.1),
  }

  private neutralBlend: Record<string, number> | null = null
  private neutralPose: PoseEuler | null = null

  // Calibration sampling state.
  private sampling = false
  private samplesLeft = 0
  private bsAccum: Record<string, number> = {}
  private poseAccum: PoseEuler = { pitch: 0, yaw: 0, roll: 0 }
  private sampleCount = 0
  private onCalibrated: (() => void) | null = null

  // Reusable THREE temporaries (avoid per-frame allocation).
  private readonly _m = new THREE.Matrix4()
  private readonly _pos = new THREE.Vector3()
  private readonly _quat = new THREE.Quaternion()
  private readonly _scale = new THREE.Vector3()
  private readonly _euler = new THREE.Euler()

  get isCalibrating(): boolean {
    return this.sampling
  }

  get isCalibrated(): boolean {
    return this.neutralBlend !== null
  }

  /**
   * Start capturing the neutral baseline over the next `frames` tracking frames.
   * The user should hold a relaxed, forward-facing face while it samples.
   */
  beginCalibration(frames = 30, onDone?: () => void): void {
    this.sampling = true
    this.samplesLeft = Math.max(1, frames)
    this.sampleCount = 0
    this.bsAccum = {}
    this.poseAccum = { pitch: 0, yaw: 0, roll: 0 }
    this.onCalibrated = onDone ?? null
  }

  /** Drop calibration and smoothing history. */
  reset(): void {
    this.neutralBlend = null
    this.neutralPose = null
    this.sampling = false
    this.bsFilters.clear()
    for (const f of Object.values(this.poseFilters)) f.reset()
  }

  /** Transform one raw frame into a calibrated, smoothed frame. */
  process(frame: FaceFrame, tMs: number): FaceFrame {
    if (!this.enabled) return frame
    const pose = this.decodePose(frame.matrix)

    if (this.sampling) {
      this.accumulate(frame.blendshapes, pose)
      // While calibrating, pass through lightly smoothed values so the avatar
      // keeps moving but no calibration is applied yet.
      return {
        blendshapes: this.smoothBlend(frame.blendshapes, tMs, false),
        matrix: frame.matrix,
      }
    }

    return {
      blendshapes: this.smoothBlend(frame.blendshapes, tMs, true),
      matrix: this.smoothPose(pose, frame.matrix, tMs),
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private filterFor(name: string): OneEuroFilter {
    let f = this.bsFilters.get(name)
    if (!f) {
      f = new OneEuroFilter()
      this.bsFilters.set(name, f)
    }
    return f
  }

  private smoothBlend(
    raw: Record<string, number>,
    tMs: number,
    calibrate: boolean,
  ): Record<string, number> {
    const out: Record<string, number> = {}
    for (const name in raw) {
      let v = raw[name]
      if (calibrate && this.neutralBlend) {
        const base = this.neutralBlend[name] ?? 0
        // Re-center on the user's rest face and rescale the remaining range so
        // a full expression still reaches ~1.0.
        v = (v - base) / Math.max(1e-3, 1 - base)
        v = clamp01(v * this.gain)
      }
      out[name] = clamp01(this.filterFor(name).filter(v, tMs))
    }
    return out
  }

  private decodePose(matrix: number[] | null): PoseEuler | null {
    if (!matrix || matrix.length < 16) return null
    this._m.fromArray(matrix)
    this._m.decompose(this._pos, this._quat, this._scale)
    this._euler.setFromQuaternion(this._quat, 'YXZ')
    return { pitch: this._euler.x, yaw: this._euler.y, roll: this._euler.z }
  }

  private smoothPose(
    pose: PoseEuler | null,
    rawMatrix: number[] | null,
    tMs: number,
  ): number[] | null {
    if (!pose || !rawMatrix) return rawMatrix
    let { pitch, yaw, roll } = pose
    if (this.neutralPose) {
      pitch -= this.neutralPose.pitch
      yaw -= this.neutralPose.yaw
      roll -= this.neutralPose.roll
    }
    pitch = this.poseFilters.pitch.filter(pitch, tMs)
    yaw = this.poseFilters.yaw.filter(yaw, tMs)
    roll = this.poseFilters.roll.filter(roll, tMs)

    // Recompose a matrix from the smoothed rotation; keep the original
    // translation/scale (decomposed into the temporaries by decodePose).
    this._pos.set(
      this.poseFilters.px.filter(this._pos.x, tMs),
      this.poseFilters.py.filter(this._pos.y, tMs),
      this.poseFilters.pz.filter(this._pos.z, tMs),
    )
    this._euler.set(pitch, yaw, roll, 'YXZ')
    this._quat.setFromEuler(this._euler)
    this._m.compose(this._pos, this._quat, this._scale)
    return this._m.toArray()
  }

  private accumulate(blend: Record<string, number>, pose: PoseEuler | null): void {
    for (const name in blend) {
      this.bsAccum[name] = (this.bsAccum[name] ?? 0) + blend[name]
    }
    if (pose) {
      this.poseAccum.pitch += pose.pitch
      this.poseAccum.yaw += pose.yaw
      this.poseAccum.roll += pose.roll
    }
    this.sampleCount += 1
    this.samplesLeft -= 1
    if (this.samplesLeft <= 0) this.finalizeCalibration()
  }

  private finalizeCalibration(): void {
    const n = Math.max(1, this.sampleCount)
    const blend: Record<string, number> = {}
    for (const name in this.bsAccum) blend[name] = this.bsAccum[name] / n
    this.neutralBlend = blend
    this.neutralPose = {
      pitch: this.poseAccum.pitch / n,
      yaw: this.poseAccum.yaw / n,
      roll: this.poseAccum.roll / n,
    }
    this.sampling = false
    for (const f of Object.values(this.poseFilters)) f.reset()
    const cb = this.onCalibrated
    this.onCalibrated = null
    if (cb) cb()
  }
}
