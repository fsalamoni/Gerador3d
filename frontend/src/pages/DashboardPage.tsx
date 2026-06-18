/**
 * Dashboard — entry point of the authenticated app with quick actions.
 */
import { Link } from 'react-router-dom'
import { Sparkles, Library, Video, ArrowRight, Wrench, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { IS_LOCAL } from '../lib/runtime'
import { useLocalReadiness } from '../lib/use-local-readiness'

export default function DashboardPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const diag = useLocalReadiness(IS_LOCAL ? 5000 : 0)

  const actions = [
    { to: '/app/generate', icon: Sparkles, label: 'dashboard.quickGenerate' },
    { to: '/app/library', icon: Library, label: 'dashboard.quickLibrary' },
    { to: '/app/studio', icon: Video, label: 'dashboard.quickStudio' },
  ] as const

  const rigReady = Boolean(diag?.rigging.ready)
  const genReady = Boolean(diag?.generation.ready)
  const allReady = rigReady && genReady

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {IS_LOCAL ? 'Bem-vindo! Tudo roda no seu PC.' : `${t('dashboard.welcome')}, ${user?.displayName ?? user?.email}.`}
      </p>

      {IS_LOCAL && diag && !allReady && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-amber-100">Conclua a configuração</h2>
            <p className="mt-1 text-sm text-amber-200/90">
              Rigging facial: {rigReady ? '✓ pronto' : 'pendente'} · Geração 3D: {genReady ? '✓ pronto' : 'pendente'}.
              Instale o que falta com um clique.
            </p>
          </div>
          <Link
            to="/app/setup"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30"
          >
            <Wrench className="h-4 w-4" /> Abrir Configuração
          </Link>
        </div>
      )}

      {IS_LOCAL && diag && allReady && (
        <div className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> Tudo pronto — gere modelos e crie o rigging à vontade.
        </div>
      )}

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
