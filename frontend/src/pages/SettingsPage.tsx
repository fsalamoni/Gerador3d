/**
 * Settings — provider/BYOK configuration and per-task model selection.
 */
import { Cpu, ListChecks, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ProvidersSection from '../components/ProvidersSection'
import TaskModelConfigCard from '../components/TaskModelConfigCard'
import LocalAIRiggingSection from '../components/LocalAIRiggingSection'

export default function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
      </header>

      {/* Providers */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="h-5 w-5 text-brand-400" />
          <div>
            <h2 className="text-base font-semibold text-white">
              {t('settings.providersTitle')}
            </h2>
            <p className="text-xs text-slate-400">{t('settings.providersSubtitle')}</p>
          </div>
        </div>
        <ProvidersSection />
      </section>

      {/* Tasks */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-brand-400" />
          <div>
            <h2 className="text-base font-semibold text-white">
              {t('settings.tasksTitle')}
            </h2>
            <p className="text-xs text-slate-400">{t('settings.tasksSubtitle')}</p>
          </div>
        </div>
        <TaskModelConfigCard />
      </section>

      {/* Local AI Explanations */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-semibold text-white">
              Guia: IA Local & Auto-Rigging
            </h2>
            <p className="text-xs text-slate-400">Como funciona o processo de rigging e opções locais/gratuitas.</p>
          </div>
        </div>
        <LocalAIRiggingSection />
      </section>
    </div>
  )
}
