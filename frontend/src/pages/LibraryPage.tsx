/**
 * LibraryPage — grid of generated 3D models with live status + 3D preview.
 */
import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Sparkles, Video, Bone, UploadCloud, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { subscribeJobs, deleteJob } from '../lib/jobs-store'
import { useJobPolling } from '../lib/job-poller'
import type { GenerationJob } from '../lib/firestore-types'
import ModelViewer from '../components/ModelViewer'
import { upload3DModel } from '../lib/upload-service'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-500/20 text-slate-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
  succeeded: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  canceled: 'bg-slate-500/20 text-slate-400',
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeJobs(setJobs), [])

  // Advance any in-progress job (generation or rigging) until it completes.
  useJobPolling(jobs)

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    e.target.value = ''

    try {
      await upload3DModel(file)
    } catch (err) {
      console.error('Upload failed:', err)
      alert(t('library.uploadFailed') || 'Upload failed')
    }
  }

  // "Preparar rig" → open the Studio's facial-rig flow on this model: the user
  // marks eyes/mouth/jaw and we synthesize expressions + a downloadable VRM. This
  // works for ANY topology (humans and creatures), unlike the old human-template
  // transfer, and lets the user verify/test the result live.
  const handleRigging = (job: GenerationJob) => {
    const url = job.outputs?.glbUrl
    if (!url) return
    const kind = url.toLowerCase().endsWith('.vrm') ? 'vrm' : 'glb'
    navigate(`/app/studio?model=${encodeURIComponent(url)}&kind=${kind}&rig=1`)
  }

  const handleDelete = async (jobId: string) => {
    if (confirm(t('library.confirmDelete') || 'Tem certeza que deseja excluir este modelo da sua biblioteca?')) {
      try {
        await deleteJob(jobId)
      } catch (err) {
        console.error('Delete failed:', err)
        alert(t('library.deleteFailed') || 'Falha ao excluir o modelo.')
      }
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-24 text-center">
        <input 
          type="file" 
          ref={fileInputRef} 
          accept=".glb,.gltf,.vrm" 
          className="hidden" 
          onChange={handleFileChange} 
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/15">
          <Sparkles className="h-8 w-8 text-brand-400" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">{t('library.title')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('library.empty')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/app/generate"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {t('library.emptyCta')}
          </Link>
          <button
            onClick={handleUploadClick}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <UploadCloud className="h-4 w-4" />
            {t('library.uploadCta') || 'Upload Model'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('library.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('library.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".glb,.gltf,.vrm" 
            className="hidden" 
            onChange={handleFileChange} 
          />
          <button
            onClick={handleUploadClick}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
          >
            <UploadCloud className="h-4 w-4" />
            {t('library.uploadModel') || 'Upload Model'}
          </button>
        </div>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
          >
            <div className="group relative h-52 bg-slate-900">
              <ModelViewer url={job.outputs?.vrmUrl || job.outputs?.glbUrl} autoRotate />
              
              <div className="absolute right-2 top-2 flex flex-col items-end gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    STATUS_STYLES[job.status] ?? STATUS_STYLES.pending
                  }`}
                >
                  {t(`jobStatus.${job.status}`)}
                  {job.status === 'in_progress' ? ` · ${job.progress}%` : ''}
                </span>

                <button
                  onClick={() => handleDelete(job.id)}
                  className="rounded-full bg-red-500/20 p-1.5 text-red-300 opacity-0 transition hover:bg-red-500/40 group-hover:opacity-100"
                  title={t('library.delete') || 'Excluir'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded bg-brand-600/10 px-1.5 py-0.5 text-brand-300">
                  {t(`capabilities.${job.task}`)}
                </span>
                <span>{job.providerId}</span>
              </div>
              {typeof job.params?.prompt === 'string' && job.params.prompt && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                  {job.params.prompt as string}
                </p>
              )}

              {job.status === 'failed' && job.error && (
                <p className="mt-2 line-clamp-3 text-xs text-red-300/90">
                  {job.error}
                </p>
              )}

              {job.status === 'succeeded' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(job.outputs?.vrmUrl || job.outputs?.glbUrl) && (
                    <a
                      href={job.outputs.vrmUrl || job.outputs.glbUrl}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('library.download')}
                    </a>
                  )}
                  {job.outputs?.glbUrl && !job.outputs?.vrmUrl && (
                    <button
                      onClick={() => handleRigging(job)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
                    >
                      <Bone className="h-3.5 w-3.5" />
                      {t('library.prepareRig')}
                    </button>
                  )}
                  {(job.outputs?.vrmUrl || job.outputs?.glbUrl) && (
                    <Link
                      to="/app/studio"
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-600/20 px-2.5 py-1.5 text-xs font-medium text-brand-200 transition hover:bg-brand-600/30"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {t('library.openStudio')}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
