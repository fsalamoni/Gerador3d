/**
 * Onboarding wizard — three quick steps that guide a new user to connect a
 * provider, add models and start creating. Shown after first sign-up.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Library, Rocket, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { saveSettings } from '../lib/firestore-service'

export default function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const steps = [
    { icon: Cpu, title: 'onboarding.step1Title', body: 'onboarding.step1Body' },
    { icon: Library, title: 'onboarding.step2Title', body: 'onboarding.step2Body' },
    { icon: Rocket, title: 'onboarding.step3Title', body: 'onboarding.step3Body' },
  ] as const

  async function complete(target: string) {
    await saveSettings({ onboarding_completed: true })
    navigate(target)
  }

  const Current = steps[step]

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">{t('onboarding.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('onboarding.subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-8 bg-brand-500' : 'w-2 bg-white/15'
              }`}
            />
          ))}
        </div>

        {/* Current step */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/15">
            <Current.icon className="h-7 w-7 text-brand-400" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-white">{t(Current.title)}</h2>
          <p className="mt-2 text-sm text-slate-400">{t(Current.body)}</p>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-3">
          {step < steps.length - 1 ? (
            <>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                {t('common.next')}
              </button>
              <button
                type="button"
                onClick={() => void complete('/app')}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
              >
                {t('onboarding.skip')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void complete('/app/settings')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                <Cpu className="h-4 w-4" />
                {t('onboarding.goToSettings')}
              </button>
              <button
                type="button"
                onClick={() => void complete('/app/generate')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/5"
              >
                <Check className="h-4 w-4" />
                {t('onboarding.start')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
