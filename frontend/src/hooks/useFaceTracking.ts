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

  // Set on unmount so an in-flight start() can abort and release the camera.
  const disposedRef = useRef(false)
  useEffect(() => () => {
    disposedRef.current = true
    trackerRef.current?.stop()
    stopWebcam(streamRef.current)
    streamRef.current = null
  }, [])

  const startingRef = useRef(false)
  const start = useCallback(async () => {
    // Guard against re-entrancy (double click / auto+manual start): two starts
    // would open a second webcam stream and a second detection loop, orphaning
    // the first (camera light stays on, doubled inference).
    if (!videoRef.current || startingRef.current) return
    startingRef.current = true
    // Stop any existing tracker/stream before starting fresh.
    trackerRef.current?.stop()
    if (streamRef.current) { stopWebcam(streamRef.current); streamRef.current = null }
    setStatus('loading')
    setError(null)
    try {
      const tracker = trackerRef.current ?? new FaceTracker()
      trackerRef.current = tracker
      await tracker.init()
      const stream = await startWebcam(videoRef.current)
      // Race guard: if the component unmounted while we were awaiting, stop the
      // stream we just acquired (otherwise the camera light stays on forever).
      if (disposedRef.current) {
        stopWebcam(stream)
        return
      }
      streamRef.current = stream
      tracker.start(videoRef.current, (frame) => {
        const stable = stabilizerRef.current.process(frame, performance.now())
        onFrameRef.current(stable)
      })
      setStatus('running')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tracking failed.')
      setStatus('error')
    } finally {
      startingRef.current = false
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
