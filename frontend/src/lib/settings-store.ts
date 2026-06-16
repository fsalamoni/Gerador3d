/**
 * Higher-level settings helpers: API keys and per-provider settings.
 *
 * Wraps `firestore-service` and emits a DOM event whenever provider settings
 * change so cards across the app can refresh (mirrors Lexio's settings-store).
 */
import { getSettings, saveSettings } from './firestore-service'
import type {
  ApiKeyValues,
  ProviderSettingEntry,
  ProviderSettingsMap,
} from './firestore-types'
import { apiKeyFieldForProvider, type ProviderId } from './providers'

export const PROVIDER_SETTINGS_UPDATED_EVENT = 'gerador3d:provider_settings_updated'

function emitProviderSettingsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROVIDER_SETTINGS_UPDATED_EVENT))
  }
}

// ── API keys ──────────────────────────────────────────────────────────────────

export async function loadApiKeyValues(uid?: string): Promise<ApiKeyValues> {
  const settings = await getSettings(uid)
  return settings.api_keys ?? {}
}

export async function saveApiKeyValue(
  providerId: ProviderId,
  value: string,
  uid?: string,
): Promise<void> {
  const current = await loadApiKeyValues(uid)
  const field = apiKeyFieldForProvider(providerId)
  const next: ApiKeyValues = { ...current }
  const trimmed = value.trim()
  if (trimmed) next[field] = trimmed
  else delete next[field]
  await saveSettings({ api_keys: next }, uid)
  emitProviderSettingsUpdated()
}

export function getApiKeyForProvider(
  providerId: ProviderId,
  apiKeys: ApiKeyValues,
): string {
  return apiKeys[apiKeyFieldForProvider(providerId)] ?? ''
}

// ── Provider settings ─────────────────────────────────────────────────────────

export async function loadProviderSettings(uid?: string): Promise<ProviderSettingsMap> {
  const settings = await getSettings(uid)
  return settings.provider_settings ?? {}
}

export async function saveProviderSettings(
  patch: ProviderSettingsMap,
  uid?: string,
): Promise<void> {
  const current = await loadProviderSettings(uid)
  const next: ProviderSettingsMap = { ...current }
  for (const [id, entry] of Object.entries(patch)) {
    next[id] = { ...(next[id] ?? { enabled: false }), ...entry }
  }
  await saveSettings({ provider_settings: next }, uid)
  emitProviderSettingsUpdated()
}

export async function setProviderEnabled(
  providerId: ProviderId,
  enabled: boolean,
  uid?: string,
): Promise<void> {
  await saveProviderSettings({ [providerId]: { enabled } as ProviderSettingEntry }, uid)
}

/** A provider is "available" when enabled or has an API key / base URL set. */
export function isProviderAvailable(
  providerId: ProviderId,
  providerSettings: ProviderSettingsMap,
  apiKeys: ApiKeyValues,
): boolean {
  const entry = providerSettings[providerId]
  if (entry?.enabled) return true
  if (entry?.base_url) return true
  return Boolean(getApiKeyForProvider(providerId, apiKeys))
}
