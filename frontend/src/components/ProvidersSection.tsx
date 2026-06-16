/**
 * ProvidersSection — loads the user's settings + catalog and renders one
 * ProviderSetupCard per provider, refreshing on settings/catalog changes.
 */
import { useCallback, useEffect, useState } from 'react'
import { PROVIDER_ORDER } from '../lib/providers'
import {
  loadApiKeyValues,
  loadProviderSettings,
  PROVIDER_SETTINGS_UPDATED_EVENT,
} from '../lib/settings-store'
import {
  CATALOG_UPDATED_EVENT,
  loadModelCatalog,
} from '../lib/model-catalog'
import type {
  ApiKeyValues,
  ModelOption,
  ProviderSettingsMap,
} from '../lib/firestore-types'
import ProviderSetupCard from './ProviderSetupCard'

export default function ProvidersSection() {
  const [apiKeys, setApiKeys] = useState<ApiKeyValues>({})
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsMap>({})
  const [catalog, setCatalog] = useState<ModelOption[]>([])

  const reload = useCallback(async () => {
    const [keys, settings, models] = await Promise.all([
      loadApiKeyValues(),
      loadProviderSettings(),
      loadModelCatalog(),
    ])
    setApiKeys(keys)
    setProviderSettings(settings)
    setCatalog(models)
  }, [])

  useEffect(() => {
    void reload()
    const handler = () => void reload()
    window.addEventListener(PROVIDER_SETTINGS_UPDATED_EVENT, handler)
    window.addEventListener(CATALOG_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(PROVIDER_SETTINGS_UPDATED_EVENT, handler)
      window.removeEventListener(CATALOG_UPDATED_EVENT, handler)
    }
  }, [reload])

  return (
    <div className="space-y-4">
      {PROVIDER_ORDER.map((id) => (
        <ProviderSetupCard
          key={id}
          providerId={id}
          apiKeys={apiKeys}
          providerSettings={providerSettings}
          catalog={catalog}
          onChanged={() => void reload()}
        />
      ))}
    </div>
  )
}
