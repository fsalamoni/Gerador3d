/**
 * AdminPage — platform overview for administrators (role === 'admin').
 *
 * Shows anonymous platform-wide aggregates (maintained by Cloud Functions) plus
 * the admin's own configuration snapshot. Non-admins are redirected away.
 */
import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Boxes, Cpu, Database, Info, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { loadPlatformStats, type PlatformStats } from '../lib/platform-stats'
import { loadProviderSettings } from '../lib/settings-store'
import { loadModelCatalog } from '../lib/model-catalog'
import { topEntries } from '../lib/analytics'
import { BarList, StatCard } from '../components/analytics/Charts'

export default function AdminPage() {
  const { t } = useTranslation()
  const { user, loading } = useAuth()

  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [enabledProviders, setEnabledProviders] = useState(0)
  const [catalogSize, setCatalogSize] = useState(0)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    void loadPlatformStats().then(setStats)
    void loadProviderSettings().then((settings) => {
      setEnabledProviders(Object.values(settings).filter((s) => s?.enabled).length)
    })
    void loadModelCatalog().then((c) => setCatalogSize(c.length))
  }, [isAdmin])

  const providerEntries = useMemo(() => topEntries(stats?.byProvider ?? {}), [stats])
  const taskEntries = useMemo(() => topEntries(stats?.byTask ?? {}), [stats])
  const statusEntries = useMemo(() => topEntries(stats?.byStatus ?? {}), [stats])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        {t('common.loading')}
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('admin.subtitle')}</p>
      </header>

      {/* Headline metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Boxes}
          label={t('admin.platformTotal')}
          value={stats?.totalJobs ?? 0}
        />
        <StatCard
          icon={Cpu}
          label={t('admin.providersEnabled')}
          value={enabledProviders}
        />
        <StatCard icon={Database} label={t('admin.catalogSize')} value={catalogSize} />
      </div>

      {/* Platform breakdowns */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            {t('admin.platformByProvider')}
          </h2>
          <BarList entries={providerEntries} emptyLabel={t('analytics.noData')} />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            {t('admin.platformByTask')}
          </h2>
          <BarList
            entries={taskEntries}
            labelFor={(k) => t(`capabilities.${k}`, { defaultValue: k })}
            emptyLabel={t('analytics.noData')}
          />
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            {t('admin.platformByStatus')}
          </h2>
          <BarList
            entries={statusEntries}
            labelFor={(k) => t(`jobStatus.${k}`, { defaultValue: k })}
            emptyLabel={t('analytics.noData')}
          />
        </section>
      </div>

      {/* Footnotes */}
      <div className="mt-6 space-y-3">
        {stats?.updated_at && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            {t('admin.lastUpdate')}: {new Date(stats.updated_at).toLocaleString()}
          </div>
        )}
        <div className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5 text-xs text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('admin.note')}</span>
        </div>
      </div>
    </div>
  )
}
