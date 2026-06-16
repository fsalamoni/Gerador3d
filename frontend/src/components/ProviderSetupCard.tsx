/**
 * ProviderSetupCard — one card per provider that combines:
 *  - enable/disable toggle
 *  - API key (or base URL for self-hosted) input with a link to the console
 *  - a collapsible, localized step-by-step setup guide
 *  - the provider's models with "add to personal catalog" controls
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  PROVIDERS,
  localize,
  localizeGuide,
  type ProviderId,
} from '../lib/providers'
import type {
  ApiKeyValues,
  ModelOption,
  ProviderSettingsMap,
} from '../lib/firestore-types'
import {
  getApiKeyForProvider,
  saveApiKeyValue,
  saveProviderSettings,
  setProviderEnabled,
} from '../lib/settings-store'
import {
  addModelToCatalog,
  buildModelId,
  removeModelFromCatalog,
  staticModelToOption,
} from '../lib/model-catalog'

interface Props {
  providerId: ProviderId
  apiKeys: ApiKeyValues
  providerSettings: ProviderSettingsMap
  catalog: ModelOption[]
  onChanged: () => void
}

export default function ProviderSetupCard({
  providerId,
  apiKeys,
  providerSettings,
  catalog,
  onChanged,
}: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'pt'
  const provider = PROVIDERS[providerId]

  const entry = providerSettings[providerId]
  const enabled = entry?.enabled ?? false

  const [keyValue, setKeyValue] = useState('')
  const [baseUrl, setBaseUrl] = useState(entry?.base_url ?? '')
  const [showGuide, setShowGuide] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setKeyValue(getApiKeyForProvider(providerId, apiKeys))
    setBaseUrl(providerSettings[providerId]?.base_url ?? '')
  }, [providerId, apiKeys, providerSettings])

  const catalogIds = useMemo(() => new Set(catalog.map((m) => m.id)), [catalog])

  function flashSaved() {
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1500)
  }

  async function handleToggle() {
    await setProviderEnabled(providerId, !enabled)
    onChanged()
  }

  async function handleSaveKey() {
    await saveApiKeyValue(providerId, keyValue)
    if (keyValue.trim()) await setProviderEnabled(providerId, true)
    flashSaved()
    onChanged()
  }

  async function handleSaveBaseUrl() {
    await saveProviderSettings({ [providerId]: { enabled: true, base_url: baseUrl.trim() } })
    flashSaved()
    onChanged()
  }

  async function handleAddModel(rawId: string) {
    const raw = provider.staticModels.find((m) => m.id === rawId)
    if (!raw) return
    await addModelToCatalog(staticModelToOption(providerId, raw))
    onChanged()
  }

  async function handleRemoveModel(rawId: string) {
    await removeModelFromCatalog(buildModelId(providerId, rawId))
    onChanged()
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${provider.color}`}
            >
              {provider.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{localize(provider.description, lang)}</p>
        </div>

        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <span className="text-xs text-slate-400">
            {enabled ? t('settings.enabled') : t('settings.disabled')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            className={`relative h-5 w-9 rounded-full transition ${
              enabled ? 'bg-brand-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                enabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Credential input */}
      <div className="mt-4 space-y-2">
        {provider.selfHosted ? (
          <>
            <label className="block text-xs text-slate-400">{t('settings.baseUrl')}</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={t('settings.baseUrlPlaceholder')}
                className="flex-1 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={handleSaveBaseUrl}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-500"
              >
                {savedFlash ? <Check className="h-4 w-4" /> : t('common.save')}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs text-slate-400">{t('settings.apiKey')}</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={
                  provider.keyPrefix
                    ? `${provider.keyPrefix}…`
                    : t('settings.apiKeyPlaceholder')
                }
                className="flex-1 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand-500"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={handleSaveKey}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-500"
              >
                {savedFlash ? <Check className="h-4 w-4" /> : t('common.save')}
              </button>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <a
            href={provider.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
          >
            {t('settings.getKey')}
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
          >
            {showGuide ? t('settings.hideGuide') : t('settings.showGuide')}
            {showGuide ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>

        {showGuide && (
          <ol className="mt-2 space-y-1.5 rounded-lg bg-slate-800/40 p-3 text-xs text-slate-300">
            {localizeGuide(provider.guide, lang).map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold text-brand-400">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Models */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          {t('settings.models')}
        </p>
        <div className="space-y-2">
          {provider.staticModels.map((m) => {
            const inCatalog = catalogIds.has(buildModelId(providerId, m.id))
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-slate-800/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm text-slate-200">{m.label}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {t(`tiers.${m.tier}`)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(m.capabilities ?? provider.capabilities).map((cap) => (
                      <span
                        key={cap}
                        className="rounded bg-brand-600/10 px-1.5 py-0.5 text-[10px] text-brand-300"
                      >
                        {t(`capabilities.${cap}`)}
                      </span>
                    ))}
                  </div>
                </div>
                {inCatalog ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveModel(m.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('settings.remove')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddModel(m.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600/20 px-2.5 py-1.5 text-xs font-medium text-brand-200 transition hover:bg-brand-600/30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('settings.addToCatalog')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
