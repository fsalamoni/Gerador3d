/**
 * StudioPage — live, in-browser avatar driven by the webcam (MediaPipe →
 * AvatarCanvas), with an avatar source selector and an OBS-capture link.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  Upload,
  Video,
  ExternalLink,
  Info,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AvatarCanvas, { type AvatarCanvasHandle } from '../components/AvatarCanvas'
import { useFaceTracking } from '../hooks/useFaceTracking'
import { subscribeJobs } from '../lib/jobs-store'
import type { GenerationJob } from '../lib/firestore-types'

type Source =
  | { kind: 'none' }
  | { kind: 'vrm'; url: string; label: string }
  | { kind: 'glb'; url: string; label: string }

export default function StudioPage() {
  const { t } = useTranslation()
  const avatarRef = useRef<AvatarCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { videoRef, status, error, start, stop } = useFaceTracking((frame) =>
    avatarRef.current?.applyFrame(frame),
  )

  const [source, setSource] = useState<Source>({ kind: 'none' })
  const [jobs, setJobs] = useState<GenerationJob[]>([])

  useEffect(() => subscribeJobs(setJobs), [])

  const generated = useMemo(
    () => jobs.filter((j) => j.status === 'succeeded' && j.outputs?.glbUrl),
    [jobs],
  )

  function onPickVrm(file: File) {
    const url = URL.createObjectURL(file)
    setSource({ kind: 'vrm', url, label: file.name })
  }

  const obsUrl = useMemo(() => {
    if (source.kind === 'none') return '/obs'
    const params = new URLSearchParams({ model: source.url, kind: source.kind })
    return `/obs?${params.toString()}`
  }, [source])

  const running = status === 'running'

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('studio.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('studio.subtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Avatar viewport */}
        <div className="lg:col-span-2">
          <div className="relative h-[28rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
            <AvatarCanvas
              ref={avatarRef}
              modelUrl={source.kind === 'none' ? undefined : source.url}
              modelKind={source.kind === 'none' ? undefined : source.kind}
            />

            {/* Webcam preview */}
            <div className="absolute bottom-3 right-3 w-32 overflow-hidden rounded-lg border border-white/20 bg-black/60">
              <video
                ref={videoRef}
                className="h-auto w-full -scale-x-100"
                playsInline
                muted
              />
            </div>

            {/* Status pill */}
            <div className="absolute left-3 top-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  running
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-500/20 text-slate-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    running ? 'bg-emerald-400' : 'bg-slate-400'
                  }`}
                />
                {status === 'loading'
                  ? t('studio.loadingModel')
                  : running
                    ? t('studio.tracking')
                    : t('studio.notTracking')}
              </span>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {t('studio.cameraError')}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Camera */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            {running ? (
              <button
                type="button"
                onClick={stop}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/5"
              >
                <CameraOff className="h-4 w-4" />
                {t('studio.stopCamera')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                <Camera className="h-4 w-4" />
                {t('studio.startCamera')}
              </button>
            )}
            <p className="mt-2 text-center text-[11px] text-slate-500">
              {t('studio.permissionHint')}
            </p>
          </div>

          {/* Avatar source */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
              {t('studio.source')}
            </p>

            <div className="space-y-2">
              <SourceButton
                active={source.kind === 'none'}
                label={t('studio.sourceNone')}
                onClick={() => setSource({ kind: 'none' })}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  source.kind === 'vrm'
                    ? 'border-brand-500/50 bg-brand-600/15 text-brand-100'
                    : 'border-white/10 bg-slate-800/40 text-slate-200 hover:bg-slate-800/70'
                }`}
              >
                <Upload className="h-4 w-4" />
                {source.kind === 'vrm' ? source.label : t('studio.uploadVrm')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vrm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPickVrm(file)
                }}
              />

              {generated.length > 0 && (
                <div className="pt-2">
                  <p className="mb-1.5 text-[11px] text-slate-500">
                    {t('studio.generatedModels')}
                  </p>
                  <div className="space-y-1.5">
                    {generated.map((job) => (
                      <SourceButton
                        key={job.id}
                        active={source.kind === 'glb' && source.url === job.outputs?.glbUrl}
                        label={
                          (job.params?.prompt as string)?.slice(0, 28) ||
                          t(`capabilities.${job.task}`)
                        }
                        onClick={() =>
                          setSource({
                            kind: 'glb',
                            url: job.outputs!.glbUrl as string,
                            label: (job.params?.prompt as string) ?? job.id,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-300">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{t('studio.blendshapeNote')}</span>
            </div>
          </div>

          {/* OBS */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <a
              href={obsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600/20 px-4 py-2.5 text-sm font-semibold text-brand-100 transition hover:bg-brand-600/30"
            >
              <Video className="h-4 w-4" />
              {t('studio.openObs')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="mt-2 text-[11px] text-slate-500">{t('studio.obsHint')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SourceButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 truncate rounded-lg border px-3 py-2 text-left text-sm transition ${
        active
          ? 'border-brand-500/50 bg-brand-600/15 text-brand-100'
          : 'border-white/10 bg-slate-800/40 text-slate-200 hover:bg-slate-800/70'
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
