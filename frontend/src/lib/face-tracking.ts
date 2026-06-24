/**
 * Face tracking via MediaPipe FaceLandmarker (runs fully in the browser).
 *
 * Produces the 52 ARKit-style blendshape coefficients plus a facial
 * transformation matrix (head pose), which we map onto a VRM (or a procedural
 * head) in AvatarCanvas. The WASM runtime and model are loaded from a CDN.
 */
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'

const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export interface FaceFrame {
  /** Map of ARKit blendshape name → weight (0..1). */
  blendshapes: Record<string, number>
  /** 4x4 column-major facial transformation matrix, or null if unavailable. */
  matrix: number[] | null
}

export type FaceFrameHandler = (frame: FaceFrame) => void

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private rafId = 0
  private running = false
  private lastVideoTime = -1

  /** Whether the underlying model has been initialized. */
  get ready(): boolean {
    return this.landmarker !== null
  }

  async init(): Promise<void> {
    if (this.landmarker) return
    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN)
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }

  /** Begin the detection loop against a playing <video> element. */
  start(video: HTMLVideoElement, onFrame: FaceFrameHandler): void {
    if (!this.landmarker) throw new Error('FaceTracker not initialized.')
    // Cancel any prior loop first, so calling start() twice doesn't leave two
    // requestAnimationFrame loops running on the same tracker.
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.running = true

    const tick = () => {
      if (!this.running || !this.landmarker) return
      if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime
        const result = this.landmarker.detectForVideo(video, performance.now())
        onFrame(toFaceFrame(result))
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  dispose(): void {
    this.stop()
    this.landmarker?.close()
    this.landmarker = null
  }
}

function toFaceFrame(result: FaceLandmarkerResult): FaceFrame {
  const blendshapes: Record<string, number> = {}
  const categories = result.faceBlendshapes?.[0]?.categories
  if (categories) {
    for (const c of categories) {
      if (c.categoryName) blendshapes[c.categoryName] = c.score
    }
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data
  return { blendshapes, matrix: matrix ? Array.from(matrix) : null }
}

/**
 * Acquire a webcam stream and bind it to a <video> element.
 * Returns the MediaStream so callers can stop tracks on teardown.
 */
export async function startWebcam(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopWebcam(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
