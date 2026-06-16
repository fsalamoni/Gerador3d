/**
 * Personal model catalog — the unified list of models the user can pick for any
 * task. Seeded from every provider's static models and persisted in the user's
 * settings, becoming the single source of truth for selectors and validation
 * (same contract as Lexio's model catalog).
 *
 * Catalog model ids are namespaced `${providerId}:${rawId}`.
 */
import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from './firestore-service'
import type { ModelOption } from './firestore-types'
import { PROVIDERS, PROVIDER_ORDER, type ProviderId, type StaticModel } from './providers'

export const CATALOG_UPDATED_EVENT = 'gerador3d:catalog_updated'

let catalogCache: ModelOption[] | null = null

function emitCatalogUpdated(next: ModelOption[]): void {
  catalogCache = next
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT, { detail: next }))
  }
}

/** Build a catalog model id from a provider + raw model id. */
export function buildModelId(providerId: ProviderId, rawId: string): string {
  return `${providerId}:${rawId}`
}

/** Split a catalog model id back into provider + raw id. */
export function parseModelId(modelId: string): { providerId: string; rawId: string } {
  const idx = modelId.indexOf(':')
  if (idx === -1) return { providerId: '', rawId: modelId }
  return { providerId: modelId.slice(0, idx), rawId: modelId.slice(idx + 1) }
}

/** Convert a provider static model into a catalog ModelOption. */
export function staticModelToOption(
  providerId: ProviderId,
  raw: StaticModel,
): ModelOption {
  const provider = PROVIDERS[providerId]
  return {
    id: buildModelId(providerId, raw.id),
    label: raw.label,
    provider: provider.label,
    providerId,
    tier: raw.tier,
    description: raw.description?.pt ?? '',
    capabilities: raw.capabilities ?? provider.capabilities,
    approxCost: raw.approxCost,
    isFree: raw.isFree,
  }
}

/** The default seed catalog — every provider's static models. */
export function getSeedCatalog(): ModelOption[] {
  const out: ModelOption[] = []
  for (const providerId of PROVIDER_ORDER) {
    for (const raw of PROVIDERS[providerId].staticModels) {
      out.push(staticModelToOption(providerId, raw))
    }
  }
  return out
}

/** Load the user's personal catalog (seeded on first use). */
export async function loadModelCatalog(uid?: string): Promise<ModelOption[]> {
  const settings = await getSettings(uid)
  if (settings.model_catalog && settings.model_catalog.length > 0) {
    catalogCache = settings.model_catalog
    return settings.model_catalog
  }
  const seed = getSeedCatalog()
  catalogCache = seed
  return seed
}

/** Persist the catalog and notify listeners. */
export async function saveModelCatalog(models: ModelOption[], uid?: string): Promise<void> {
  await saveSettings({ model_catalog: models }, uid)
  emitCatalogUpdated(models)
}

/** Add a model to the personal catalog if not already present. */
export async function addModelToCatalog(model: ModelOption, uid?: string): Promise<void> {
  const current = await loadModelCatalog(uid)
  if (current.some((m) => m.id === model.id)) return
  await saveModelCatalog([...current, model], uid)
}

/** Remove a model from the personal catalog. */
export async function removeModelFromCatalog(modelId: string, uid?: string): Promise<void> {
  const current = await loadModelCatalog(uid)
  await saveModelCatalog(
    current.filter((m) => m.id !== modelId),
    uid,
  )
}

/**
 * React hook returning the current catalog, refreshing on CATALOG_UPDATED_EVENT.
 */
export function useCatalogModels(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(catalogCache ?? getSeedCatalog())

  useEffect(() => {
    let active = true
    void loadModelCatalog().then((list) => {
      if (active) setModels(list)
    })

    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<ModelOption[]>).detail
      if (detail) setModels(detail)
    }
    window.addEventListener(CATALOG_UPDATED_EVENT, onUpdate)
    return () => {
      active = false
      window.removeEventListener(CATALOG_UPDATED_EVENT, onUpdate)
    }
  }, [])

  return models
}
