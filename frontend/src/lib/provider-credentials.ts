/**
 * Resolve which provider + credentials should dispatch a given catalog model,
 * using the namespaced model id (`providerId:rawId`) and the user's settings.
 *
 * Throws friendly errors when a provider is missing its key or has been disabled
 * so the UI can guide the user to fix configuration (same idea as Lexio).
 */
import { getSettings } from './firestore-service'
import type { ModelOption } from './firestore-types'
import {
  PROVIDERS,
  apiKeyFieldForProvider,
  isProviderId,
  type ProviderDefinition,
  type ProviderId,
} from './providers'
import { parseModelId } from './model-catalog'

export interface ResolvedProviderCall {
  provider: ProviderDefinition
  providerId: ProviderId
  apiKey: string
  baseUrl: string
}

export class ProviderNotConfiguredError extends Error {
  providerId: ProviderId
  reason: 'missing-key' | 'missing-base-url' | 'disabled'

  constructor(providerId: ProviderId, reason: 'missing-key' | 'missing-base-url' | 'disabled') {
    super(`Provider "${providerId}" is not configured (${reason}).`)
    this.name = 'ProviderNotConfiguredError'
    this.providerId = providerId
    this.reason = reason
  }
}

/** Determine which provider owns a model id, preferring the namespaced prefix. */
export function resolveProviderForModel(
  modelId: string,
  catalog: ModelOption[] = [],
): ProviderId | null {
  const { providerId } = parseModelId(modelId)
  if (providerId && isProviderId(providerId)) return providerId

  const fromCatalog = catalog.find((m) => m.id === modelId)?.providerId
  if (fromCatalog && isProviderId(fromCatalog)) return fromCatalog

  return null
}

/**
 * Resolve the full call routing for a model: provider definition, API key and
 * base URL (respecting self-hosted overrides). Throws when unconfigured.
 */
export async function resolveProviderCall(
  modelId: string,
  uid?: string,
): Promise<ResolvedProviderCall> {
  const providerId = resolveProviderForModel(modelId)
  if (!providerId) {
    throw new Error(`Could not resolve a provider for model "${modelId}".`)
  }

  const provider = PROVIDERS[providerId]
  const settings = await getSettings(uid)
  const apiKeys = settings.api_keys ?? {}
  const providerSettings = settings.provider_settings ?? {}
  const entry = providerSettings[providerId]

  if (entry && entry.enabled === false && !entry.base_url) {
    throw new ProviderNotConfiguredError(providerId, 'disabled')
  }

  const apiKey = apiKeys[apiKeyFieldForProvider(providerId)] ?? ''
  const baseUrl = (entry?.base_url || provider.baseUrl || '').replace(/\/+$/, '')

  if (provider.selfHosted) {
    if (!baseUrl) throw new ProviderNotConfiguredError(providerId, 'missing-base-url')
  } else if (!apiKey) {
    throw new ProviderNotConfiguredError(providerId, 'missing-key')
  }

  return { provider, providerId, apiKey, baseUrl }
}
