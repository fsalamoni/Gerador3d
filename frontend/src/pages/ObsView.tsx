/**
 * ObsView — a minimal, transparent, full-screen avatar render meant to be
 * captured by an OBS Browser Source (with "transparent background" enabled).
 *
 * It runs its own webcam + face tracking independently of the Studio, and
 * reads the model to display from the query string (?model=URL&kind=vrm|glb).
 * Falls back to the procedural head when no model URL is provided.
 */
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import AvatarCanvas, { type AvatarCanvasHandle } from '../components/AvatarCanvas'
import { useFaceTracking } from '../hooks/useFaceTracking'

export default function ObsView() {
  const [params] = useSearchParams()
  const model = params.get('model') ?? undefined
  const kindParam = params.get('kind')
  const kind = kindParam === 'vrm' || kindParam === 'glb' ? kindParam : undefined

  const avatarRef = useRef<AvatarCanvasHandle>(null)
  const { videoRef, status, start } = useFaceTracking((frame) =>
    avatarRef.current?.applyFrame(frame),
  )

  // Auto-start tracking when the OBS source loads.
  useEffect(() => {
    void start()
  }, [start])

  return (
    <div className="h-screen w-screen bg-transparent">
      <AvatarCanvas ref={avatarRef} modelUrl={model} modelKind={kind} transparent />
      {/* Hidden webcam element (tracking input only). */}
      <video ref={videoRef} className="hidden" playsInline muted />
      {status === 'error' && (
        <div className="absolute left-2 top-2 rounded bg-red-600/80 px-2 py-1 text-xs text-white">
          camera error
        </div>
      )}
    </div>
  )
}
