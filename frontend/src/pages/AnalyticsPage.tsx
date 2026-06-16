/**
 * AnalyticsPage — per-user usage analytics computed from the user's own jobs.
 */
import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Coins, Percent } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { subscribeJobs } from '../lib/jobs-store'
import { useCatalogModels } from '../lib/model-catalog'
import { computeUsage, topEntries } from '../lib/analytics'
import type { GenerationJob } from '../lib/firestore-types'
import { BarList, Sparkline, StatCard } from '../components/analytics/Charts'

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const catalog = useCatalogModels()
  const [jobs, setJobs] = useState<GenerationJob[]>([])

  useEffect(() => subscribeJobs(setJobs), [])

  const metrics = useMemo(() => computeUsage(jobs, catalog), [jobs, catalog])

  const providerEntries = useMemo(() => topEntries(metrics.byProvider), [metrics])
  const taskEntries = useMemo(() => topEntries(metrics.byTask), [metrics])
  const statusEntries = useMemo(
    () => topEntries(metrics.byStatus as Record<string, number>),
    [metrics],
  )

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('analytics.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('analytics.subtitle')}</p>
      </header>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Activity} label={t('analytics.total')} value={metrics.total} />
        <StatCard
          icon={CheckCircle2}
          label={t('analytics.succeeded')}
          value={metrics.byStatus.succeeded}
        />
        <StatCard
          icon={Percent}
          label={t('analytics.successRate')}
          value={`${Math.round(metrics.successRate * 100)}%`}
        />
        <StatCard
          icon={Coins}
          label={t('analytics.estimatedCost')}
          value={metrics.estimatedCost > 0 ? `$${metrics.estimatedCost.toFixed(2)}` : '—'}
        />
      </div>

      {/* Timeline */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">{t('analytics.timeline')}</h2>
        {metrics.total === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('analytics.empty')}</p>
        ) : (
          <Sparkline data={metrics.perDay} />
        )}
      </section>

      {/* Breakdowns */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">{t('analytics.byProvider')}</h2>
          <BarList entries={providerEntries} emptyLabel={t('analytics.noData')} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">{t('analytics.byTask')}</h2>
          <BarList
            entries={taskEntries}
            labelFor={(k) => t(`capabilities.${k}`, { defaultValue: k })}
            emptyLabel={t('analytics.noData')}
          />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">{t('analytics.byStatus')}</h2>
          <BarList
            entries={statusEntries}
            labelFor={(k) => t(`jobStatus.${k}`, { defaultValue: k })}
            emptyLabel={t('analytics.noData')}
          />
        </section>
      </div>
    </div>
  )
}
