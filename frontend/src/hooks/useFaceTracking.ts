/**
 * useFaceTracking — manages the webcam + FaceTracker lifecycle and forwards
 * each tracking frame to a callback. Shared by the Studio and the OBS view.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FaceTracker,
  startWebcam,
  stopWebcam,
  type FaceFrame,
} from '../lib/face-tracking'

export type TrackingStatus = 'idle' | 'loading' | 'running' | 'error'

export function useFaceTracking(onFrame: (frame: FaceFrame) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackerRef = useRef<FaceTracker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onFrameRef = useRef(onFrame)
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)

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
      tracker.start(videoRef.current, (frame) => onFrameRef.current(frame))
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

  useEffect(() => {
    return () => {
      trackerRef.current?.dispose()
      stopWebcam(streamRef.current)
    }
  }, [])

  return { videoRef, status, error, start, stop }
}
