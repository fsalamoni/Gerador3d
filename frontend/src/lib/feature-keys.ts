/**
 * Feature keys — small localStorage store for the OPTIONAL keys used by the
 * voice (ElevenLabs) and copilot (OpenRouter/Groq) features. These live outside
 * the 3D-generation provider catalog on purpose: they're per-feature, optional,
 * and we don't want to touch the settings schema. Keys never leave the browser
 * except in the direct request to the chosen API.
 */
export interface FeatureKeys {
  elevenlabsKey?: string
  copilotKey?: string
  copilotBaseUrl?: string
  copilotModel?: string
}

const STORAGE_KEY = 'gerador3d:feature_keys'

export function loadFeatureKeys(): FeatureKeys {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as FeatureKeys
  } catch {
    return {}
  }
}

export function saveFeatureKeys(patch: Partial<FeatureKeys>): FeatureKeys {
  const next = { ...loadFeatureKeys(), ...patch }
  // Drop empties so "not set" stays falsy.
  for (const k of Object.keys(next) as (keyof FeatureKeys)[]) {
    if (!next[k]) delete next[k]
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}
