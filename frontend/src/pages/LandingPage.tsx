/**
 * Public landing page — hero, features, how-it-works, and BYO-provider section.
 */
import { Link } from 'react-router-dom'
import {
  Box,
  Camera,
  Cpu,
  ArrowRight,
  Image as ImageIcon,
  PersonStanding,
  Video,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function LandingPage() {
  const { t } = useTranslation()

  const features = [
    { icon: ImageIcon, title: 'landing.feature1Title', body: 'landing.feature1Body' },
    { icon: PersonStanding, title: 'landing.feature2Title', body: 'landing.feature2Body' },
    { icon: Camera, title: 'landing.feature3Title', body: 'landing.feature3Body' },
    { icon: Video, title: 'landing.feature4Title', body: 'landing.feature4Body' },
  ]

  const steps = ['landing.step1', 'landing.step2', 'landing.step3', 'landing.step4']

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Box className="h-6 w-6 text-brand-400" />
          <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            {t('nav.login')}
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {t('nav.register')}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.35) 0%, rgba(2,6,23,0) 70%)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <h1 className="bg-gradient-to-b from-white to-slate-300 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            {t('landing.heroTitle')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            {t('landing.heroSubtitle')}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-500"
            >
              {t('landing.ctaPrimary')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
            >
              {t('landing.ctaSecondary')}
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-brand-500/40 hover:bg-white/[0.05]"
            >
              <f.icon className="h-7 w-7 text-brand-400" />
              <h3 className="mt-4 text-base font-semibold text-white">{t(f.title)}</h3>
              <p className="mt-2 text-sm text-slate-400">{t(f.body)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-bold text-white sm:text-3xl">
            {t('landing.howTitle')}
          </h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={s}
                className="relative rounded-2xl border border-white/10 bg-slate-900/40 p-6"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600/20 text-sm font-bold text-brand-300">
                  {i + 1}
                </span>
                <p className="mt-4 text-sm text-slate-300">{t(s)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bring your own provider */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-start gap-6 rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/15 to-transparent p-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-brand-300">
              <Cpu className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {t('nav.pricing')}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-bold text-white">
              {t('landing.bringYourOwnTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-300">{t('landing.bringYourOwnBody')}</p>
          </div>
          <Link
            to="/register"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {t('landing.ctaPrimary')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-slate-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5 text-brand-400" />
            <span className="font-medium text-slate-300">{t('app.name')}</span>
          </div>
          <p>
            © {new Date().getFullYear()} {t('app.name')}. {t('landing.footerRights')}
          </p>
        </div>
      </footer>
    </div>
  )
}
