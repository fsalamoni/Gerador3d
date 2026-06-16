/**
 * Dashboard — entry point of the authenticated app with quick actions.
 */
import { Link } from 'react-router-dom'
import { Sparkles, Library, Video, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const actions = [
    { to: '/app/generate', icon: Sparkles, label: 'dashboard.quickGenerate' },
    { to: '/app/library', icon: Library, label: 'dashboard.quickLibrary' },
    { to: '/app/studio', icon: Video, label: 'dashboard.quickStudio' },
  ] as const

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {t('dashboard.welcome')}, {user?.displayName ?? user?.email}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-brand-500/40 hover:bg-white/[0.05]"
          >
            <a.icon className="h-7 w-7 text-brand-400" />
            <div className="mt-8 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">{t(a.label)}</span>
              <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-brand-300" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
