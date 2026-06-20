/**
 * GeneratePage — text→3D and image→3D generation with live job progress.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Type, Image as ImageIcon, Sparkles, Upload, ArrowRight, Settings, Wrench, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCatalogModels } from '../lib/model-catalog'
import { resolveTaskModel, startGeneration } from '../lib/generation-client'
import { subscribeJobs } from '../lib/jobs-store'
import { useJobPolling } from '../lib/job-poller'
import { IS_LOCAL } from '../lib/runtime'
import { useLocalReadiness } from '../lib/use-local-readiness'
import type { GenerationJob, ModelOption } from '../lib/firestore-types'
import type { TaskKey } from '../lib/tasks-3d'
import ModelViewer from '../components/ModelViewer'

type Mode = 'text' | 'image'

export default function GeneratePage() {
  const { t } = useTranslation()
  const catalog = useCatalogModels()

  const [mode, setMode] = useState<Mode>('text')
  const [prompt, setPrompt] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null)
  const [modelId, setModelId] = useState<string>('')
  // Quality preset (local mode) → marching-cubes resolution.
  const [quality, setQuality] = useState<256 | 384 | 512>(384)

  const task: TaskKey = mode === 'text' ? 'text_to_3d' : 'image_to_3d'

  // Desktop app: know whether the local generation engine is installed.
  const diag = useLocalReadiness(IS_LOCAL ? 4000 : 0)
  const genReady = !IS_LOCAL || Boolean(diag?.generation.ready)

  // Active generation backend + whether a better installable one is recommended.
  const activeBackend = diag?.backend ?? 'triposr'
  const backendLabel =
    diag?.generation.catalog?.[activeBackend]?.label ?? activeBackend
  const recommended = diag?.generation.recommendedBackend
  const recommendLabel = recommended
    ? (diag?.generation.catalog?.[recommended]?.label ?? recommended)
    : ''
  const suggestUpgrade =
    IS_LOCAL && genReady && recommended && recommended !== activeBackend

  useEffect(() => {
    void resolveTaskModel(task).then(setModelId)
  }, [task])

  const model = useMemo<ModelOption | undefined>(
    () => catalog.find((m) => m.id === modelId),
    [catalog, modelId],
  )

  // Follow the active job's progress.
  useEffect(() => {
    if (!activeJob) return
    const unsub = subscribeJobs((jobs) => {
      const updated = jobs.find((j) => j.id === activeJob.id)
      if (updated) setActiveJob(updated)
    })
    return unsub
  }, [activeJob?.id])

  // Drive the server-side poll so the proxy actually advances the job.
  useJobPolling(activeJob ? [activeJob] : [])

  const fileInputRef = useRef<HTMLInputElement>(null)

  function onPickImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    if (!IS_LOCAL && !model) return // cloud needs a catalog model; local doesn't
    setBusy(true)
    try {
      const jobId = await startGeneration({
        task,
        prompt: mode === 'text' ? prompt : undefined,
        imageDataUrl: mode === 'image' ? imageDataUrl ?? undefined : undefined,
        extra: IS_LOCAL ? { mcResolution: quality } : undefined,
      })
      setActiveJob({
        id: jobId,
        uid: '',
        task: task === 'text_to_3d' ? 'text-to-3d' : 'image-to-3d',
        providerId: IS_LOCAL ? 'local' : (model?.providerId ?? ''),
        modelId: model?.id ?? 'local',
        status: 'pending',
        progress: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } finally {
      setBusy(false)
    }
  }

  const canGenerate =
    (IS_LOCAL ? genReady : Boolean(model)) &&
    (mode === 'text' ? prompt.trim().length > 0 : Boolean(imageDataUrl))

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('generate.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('generate.subtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === 'text' ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Type className="h-4 w-4" />
              {t('generate.tabText')}
            </button>
            <button
              type="button"
              onClick={() => setMode('image')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === 'image' ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              {t('generate.tabImage')}
            </button>
          </div>

          {mode === 'text' ? (
            <div>
              <label className="mb-1 block text-sm text-slate-300">
                {t('generate.promptLabel')}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder={t('generate.promptPlaceholder')}
                className="w-full resize-none rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm text-slate-300">
                {t('generate.imageLabel')}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file && file.type.startsWith('image/')) onPickImage(file)
                }}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-slate-800/40 px-4 py-10 text-sm text-slate-400 transition hover:border-brand-500/50 hover:text-slate-200"
              >
                {imageDataUrl ? (
                  <>
                    <img
                      src={imageDataUrl}
                      alt="reference"
                      className="max-h-40 rounded-lg object-contain"
                    />
                    <span>{t('generate.changeImage')}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6" />
                    <span>{t('generate.dropImage')}</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPickImage(file)
                }}
              />
            </div>
          )}

          {/* Engine / model indicator */}
          {IS_LOCAL ? (
            genReady ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                  <Cpu className="h-3.5 w-3.5 text-brand-300" />
                  Geração local · {backendLabel} (na sua GPU)
                  {diag?.generation.vramGb ? (
                    <span className="ml-auto text-slate-500">{diag.generation.vramGb} GB VRAM</span>
                  ) : null}
                </div>
                {suggestUpgrade && (
                  <Link
                    to="/app/setup"
                    className="flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-600/10 px-3 py-1.5 text-[11px] text-brand-200 transition hover:bg-brand-600/20"
                  >
                    <Sparkles className="h-3 w-3" />
                    Sua GPU comporta {recommendLabel} (mais qualidade). Instalar na Configuração →
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <span>A geração 3D ainda não está instalada neste PC.</span>
                <Link
                  to="/app/setup"
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 font-medium text-amber-200"
                >
                  <Wrench className="h-3 w-3" />
                  Configurar
                </Link>
              </div>
            )
          ) : model ? (
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
              <span className="text-slate-400">{t('generate.modelUsed')}</span>
              <span className="font-medium text-slate-200">
                {model.label} · {model.provider}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span>{t('generate.noModelForTask')}</span>
              <Link
                to="/app/settings"
                className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-1 font-medium text-amber-200"
              >
                <Settings className="h-3 w-3" />
                {t('generate.configure')}
              </Link>
            </div>
          )}

          {IS_LOCAL && genReady && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                Qualidade
              </label>
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                {([['Rápido', 256], ['Equilibrado', 384], ['Alto', 512]] as const).map(
                  ([label, res]) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setQuality(res)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        quality === res ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Mais qualidade = mais detalhe, porém mais lento e mais VRAM.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {busy ? t('generate.generating') : t('generate.generate')}
          </button>
        </div>

        {/* Preview / progress */}
        <div className="flex flex-col">
          <div className="relative h-80 overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
            <ModelViewer url={activeJob?.outputs?.glbUrl} />
            {activeJob && activeJob.status !== 'succeeded' && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-4">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{t(`jobStatus.${activeJob.status}`)}</span>
                  <span>{activeJob.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-brand-500 transition-all"
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {activeJob?.status === 'failed' && (
            <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {(activeJob.error as string) || 'A geração falhou.'}
            </p>
          )}

          {activeJob?.status === 'succeeded' && (
            <Link
              to="/app/library"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/5"
            >
              {t('generate.viewInLibrary')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
