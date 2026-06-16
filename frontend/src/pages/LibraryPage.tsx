/**
 * LibraryPage — grid of generated 3D models with live status + 3D preview.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Sparkles, Video, Bone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { subscribeJobs } from '../lib/jobs-store'
import type { GenerationJob } from '../lib/firestore-types'
import ModelViewer from '../components/ModelViewer'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-500/20 text-slate-300',
  in_progress: 'bg-amber-500/20 text-amber-300',
  succeeded: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  canceled: 'bg-slate-500/20 text-slate-400',
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState<GenerationJob[]>([])

  useEffect(() => subscribeJobs(setJobs), [])

  if (jobs.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600/15">
          <Sparkles className="h-8 w-8 text-brand-400" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-white">{t('library.title')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('library.empty')}</p>
        <Link
          to="/app/generate"
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          {t('library.emptyCta')}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('library.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('library.subtitle')}</p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
          >
            <div className="relative h-52 bg-slate-900">
              <ModelViewer url={job.outputs?.glbUrl} autoRotate />
              <span
                className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  STATUS_STYLES[job.status] ?? STATUS_STYLES.pending
                }`}
              >
                {t(`jobStatus.${job.status}`)}
                {job.status === 'in_progress' ? ` · ${job.progress}%` : ''}
              </span>
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

              {job.status === 'succeeded' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.outputs?.glbUrl && (
                    <a
                      href={job.outputs.glbUrl}
                      download
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('library.download')}
                    </a>
                  )}
                  <Link
                    to="/app/studio"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
                  >
                    <Bone className="h-3.5 w-3.5" />
                    {t('library.prepareRig')}
                  </Link>
                  <Link
                    to="/app/studio"
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600/20 px-2.5 py-1.5 text-xs font-medium text-brand-200 transition hover:bg-brand-600/30"
                  >
                    <Video className="h-3.5 w-3.5" />
                    {t('library.openStudio')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
