/**
 * TaskModelConfigCard — lists every generation task and lets the user bind a
 * catalog model to it (validated by capability via ModelSelectorModal).
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TASK_DEFS, getDefaultTaskModels, type TaskKey } from '../lib/tasks-3d'
import { localize } from '../lib/providers'
import { getSettings, saveSettings } from '../lib/firestore-service'
import { useCatalogModels } from '../lib/model-catalog'
import type { ModelOption } from '../lib/firestore-types'
import ModelSelectorModal from './ModelSelectorModal'

export default function TaskModelConfigCard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'pt'
  const catalog = useCatalogModels()

  const [taskModels, setTaskModels] = useState<Record<string, string>>(
    getDefaultTaskModels(),
  )
  const [activeTask, setActiveTask] = useState<TaskKey | null>(null)

  useEffect(() => {
    void getSettings().then((s) => {
      setTaskModels({ ...getDefaultTaskModels(), ...(s.task_models ?? {}) })
    })
  }, [])

  const catalogById = useMemo(() => {
    const map = new Map<string, ModelOption>()
    for (const m of catalog) map.set(m.id, m)
    return map
  }, [catalog])

  async function selectModel(taskKey: TaskKey, modelId: string) {
    const next = { ...taskModels, [taskKey]: modelId }
    setTaskModels(next)
    await saveSettings({ task_models: next })
  }

  const activeDef = activeTask ? TASK_DEFS.find((d) => d.key === activeTask) : null

  return (
    <div className="space-y-3">
      {TASK_DEFS.map((task) => {
        const modelId = taskModels[task.key]
        const model = modelId ? catalogById.get(modelId) : undefined
        return (
          <button
            key={task.key}
            type="button"
            onClick={() => setActiveTask(task.key)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:border-brand-500/40 hover:bg-white/[0.05]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {localize(task.label, lang)}
                </span>
                {task.optional && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {t('capabilities.' + task.requiredCapability)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">{localize(task.description, lang)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                {model ? (
                  <>
                    <div className="text-sm text-slate-200">{model.label}</div>
                    <div className="text-[11px] text-slate-500">{model.provider}</div>
                  </>
                ) : (
                  <span className="text-xs text-amber-400">
                    {t('settings.noModelSelected')}
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </div>
          </button>
        )
      })}

      {activeDef && (
        <ModelSelectorModal
          open={Boolean(activeTask)}
          onClose={() => setActiveTask(null)}
          onSelect={(modelId) => void selectModel(activeDef.key, modelId)}
          currentModelId={taskModels[activeDef.key]}
          requiredCapability={activeDef.requiredCapability}
          catalog={catalog}
        />
      )}
    </div>
  )
}
