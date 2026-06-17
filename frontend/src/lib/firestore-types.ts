/**
 * Firestore data model for Gerador3D.
 *
 * Mirrors the per-user "settings/preferences as single source of truth" approach
 * from Lexio, adapted to the 3D avatar domain (providers, model catalog, and a
 * model chosen per generation task instead of per LLM agent).
 */

// ── Capabilities ──────────────────────────────────────────────────────────────

/** What a provider / model is able to produce. */
export type ModelCapability =
  | 'text-to-3d'
  | 'image-to-3d'
  | 'rigging'
  | 'texturing'
  | 'animation'
  | 'upload'

/** Quality / cost tier of a model. */
export type ModelTier = 'fast' | 'balanced' | 'premium'

// ── Model catalog ─────────────────────────────────────────────────────────────

/**
 * A single model the user can pick for a task. Models are aggregated into the
 * user's personal catalog from every enabled provider; each model keeps its own
 * `providerId` so dispatch later goes to the correct API.
 */
export interface ModelOption {
  id: string
  label: string
  /** Human-readable provider name (e.g. "Meshy"). */
  provider: string
  /** Provider id used to dispatch the call (e.g. "meshy"). */
  providerId?: string
  tier: ModelTier
  description: string
  /** What this model can generate. */
  capabilities: ModelCapability[]
  /** Approximate credit / currency cost per generation, when known. */
  approxCost?: number
  /** Whether the model is available on a provider free tier. */
  isFree?: boolean
}

// ── Provider settings (per user) ──────────────────────────────────────────────

/**
 * Per-provider settings (multi-provider support). Each entry says whether the
 * user enabled the provider, plus optional overrides like a custom base URL
 * (self-hosted gateways) and the persisted catalog of models the user added.
 */
export interface ProviderSettingEntry {
  enabled: boolean
  /** Override base URL for self-hosted gateways (e.g. local TripoSR / SF3D server). */
  base_url?: string
  /** Persisted models the user picked from the provider's own catalog. */
  saved_models?: ModelOption[]
  /** Last time the model list was refreshed from the provider. */
  last_synced_at?: string
}

export type ProviderSettingsMap = Record<string, ProviderSettingEntry>

/** Map of provider id → API key field value. */
export type ApiKeyValues = Record<string, string>

/** Map from task key → chosen model id. */
export type TaskModelMap = Record<string, string>

// ── User settings document ────────────────────────────────────────────────────

/**
 * Shape of `/users/{uid}/settings/preferences`. The personal catalog and the
 * task→model map are the single source of truth for selectors and validation.
 */
export interface UserSettingsData {
  /** API keys keyed by `${providerId}_api_key`. */
  api_keys?: ApiKeyValues
  /** Per-provider enable/disable + overrides. */
  provider_settings?: ProviderSettingsMap
  /** Personal, persisted model catalog. */
  model_catalog?: ModelOption[]
  /** Chosen model per generation task. */
  task_models?: TaskModelMap
  /** UI language preference ("pt" | "en"). */
  language?: string
  /** Whether the onboarding wizard has been completed. */
  onboarding_completed?: boolean
}

// ── User profile ──────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin'

export interface UserProfile {
  uid: string
  email: string | null
  display_name?: string | null
  role: UserRole
  created_at?: string
}

// ── Generation jobs ───────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'canceled'

/** A unit of work dispatched to a provider (text→3D, image→3D, rigging, etc.). */
export interface GenerationJob {
  id: string
  uid: string
  task: ModelCapability
  providerId: string
  modelId: string
  status: JobStatus
  progress: number
  /** Free-form input parameters echoed back for traceability. */
  params?: Record<string, unknown>
  /** Provider-side task id used for polling. */
  providerTaskId?: string
  /** Storage paths / URLs of generated assets once finished. */
  outputs?: JobOutputs
  error?: string
  created_at: string
  updated_at: string
}

export interface JobOutputs {
  glbUrl?: string
  fbxUrl?: string
  objUrl?: string
  usdzUrl?: string
  vrmUrl?: string
  thumbnailUrl?: string
}

// ── Avatars ───────────────────────────────────────────────────────────────────

/** A finished, rig-ready avatar the user can drive in the live Studio. */
export interface Avatar {
  id: string
  uid: string
  name: string
  /** Source model job this avatar was built from. */
  sourceJobId?: string
  vrmUrl?: string
  thumbnailUrl?: string
  /** Whether the VRM has the 52 ARKit blendshapes for perfect-sync tracking. */
  hasArkitBlendshapes?: boolean
  created_at: string
  updated_at: string
}
