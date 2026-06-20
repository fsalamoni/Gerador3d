/**
 * useFaceTracking — manages the webcam + FaceTracker lifecycle and forwards
 * each tracking frame to a callback. Shared by the Studio and the OBS view.
 *
 * Every frame is passed through a {@link FaceStabilizer} first (One-Euro
 * smoothing + neutral-face calibration), so consumers receive a stable,
 * personalized signal. Call `calibrate()` while holding a relaxed face.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaceTracker,
  startWebcam,
  stopWebcam,
  type FaceFrame,
} from '../lib/face-tracking'
import { FaceStabilizer } from '../lib/face-smoothing'

export type TrackingStatus = 'idle' | 'loading' | 'running' | 'error'

export function useFaceTracking(onFrame: (frame: FaceFrame) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackerRef = useRef<FaceTracker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onFrameRef = useRef(onFrame)
  const stabilizerRef = useRef<FaceStabilizer>(new FaceStabilizer())
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrated, setCalibrated] = useState(false)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  const start = useCallback(async () => {
    if (!videoRef.current) return
    setStatus('loading')
    setError(null)
    try {
      const tracker = trackerRef.current ?? new FaceTracker()
      trackerRef.current = tracker
      await tracker.init()
      streamRef.current = await startWebcam(videoRef.current)
      tracker.start(videoRef.current, (frame) => {
        const stable = stabilizerRef.current.process(frame, performance.now())
        onFrameRef.current(stable)
      })
      setStatus('running')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tracking failed.')
      setStatus('error')
    }
  }, [])

  const stop = useCallback(() => {
    trackerRef.current?.stop()
    stopWebcam(streamRef.current)
    streamRef.current = null
    setStatus('idle')
  }, [])

  /** Capture the user's neutral face as the expression baseline. */
  const calibrate = useCallback(() => {
    setCalibrating(true)
    stabilizerRef.current.beginCalibration(30, () => {
      setCalibrating(false)
      setCalibrated(true)
    })
  }, [])

  /** Drop calibration and smoothing history. */
  const resetCalibration = useCallback(() => {
    stabilizerRef.current.reset()
    setCalibrated(false)
    setCalibrating(false)
  }, [])

  useEffect(() => {
    return () => {
      trackerRef.current?.dispose()
      stopWebcam(streamRef.current)
    }
  }, [])

  return {
    videoRef,
    status,
    error,
    start,
    stop,
    calibrate,
    resetCalibration,
    calibrating,
    calibrated,
  }
}
