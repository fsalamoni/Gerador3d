/**
 * ModelSelectorModal — pick a model from the personal catalog for a given task,
 * filtered to only models whose capabilities include the task's requirement.
 */
import { useMemo } from 'react'
import { X, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ModelCapability, ModelOption } from '../lib/firestore-types'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (modelId: string) => void
  currentModelId?: string
  requiredCapability: ModelCapability
  catalog: ModelOption[]
}

export default function ModelSelectorModal({
  open,
  onClose,
  onSelect,
  currentModelId,
  requiredCapability,
  catalog,
}: Props) {
  const { t } = useTranslation()

  const compatible = useMemo(
    () => catalog.filter((m) => m.capabilities.includes(requiredCapability)),
    [catalog, requiredCapability],
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">
            {t('settings.selectModel')} · {t(`capabilities.${requiredCapability}`)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {compatible.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-400">
              {t('settings.noCompatibleModels')}
            </p>
          ) : (
            <div className="space-y-2">
              {compatible.map((m) => {
                const selected = m.id === currentModelId
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.id)
                      onClose()
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                      selected
                        ? 'border-brand-500/50 bg-brand-600/15'
                        : 'border-white/10 bg-slate-800/40 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">
                          {m.label}
                        </span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {m.provider}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">{t(`tiers.${m.tier}`)}</span>
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-brand-300" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
