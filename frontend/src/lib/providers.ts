/**
 * Multi-provider registry — central catalog of every 3D / avatar AI provider
 * the platform can talk to.
 *
 * Architecture (ported from Lexio's provider registry, adapted to 3D):
 *  - Each provider describes how to reach it: console URL (to get a key), key
 *    prefix, a step-by-step setup guide (PT/EN), API dialect, base URL, the
 *    capabilities it offers (text-to-3d, image-to-3d, rigging, …) and a static
 *    list of selectable models.
 *  - Providers are enabled / disabled per user and dispatched through the
 *    Cloud Function proxy (3D generation is async + binary + CORS-restricted).
 *  - Adding a provider here makes it available across the whole platform:
 *    API-key card, per-provider catalog card and the generation proxy.
 */
import type { ModelCapability, ModelTier } from './firestore-types'

export type ProviderId = 'meshy' | 'tripo' | 'rodin' | 'hunyuan' | 'selfhost'

/** Wire format the proxy uses when talking to the provider. */
export type ProviderDialect = 'meshy' | 'tripo' | 'rodin' | 'hunyuan' | 'custom'

export interface LocalizedText {
  pt: string
  en: string
}

export interface LocalizedGuide {
  pt: string[]
  en: string[]
}

export interface StaticModel {
  id: string
  label: string
  tier: ModelTier
  description?: LocalizedText
  /** Overrides the provider capabilities for this specific model, when needed. */
  capabilities?: ModelCapability[]
  approxCost?: number
  isFree?: boolean
}

export interface ProviderDefinition {
  id: ProviderId
  label: string
  /** Tailwind classes for the provider badge. */
  color: string
  description: LocalizedText
  /** Where the user creates an API key. */
  consoleUrl: string
  /** Expected API-key prefix (hint shown in the input). Empty when unknown. */
  keyPrefix: string
  /** Step-by-step instructions to obtain credentials, per language. */
  guide: LocalizedGuide
  dialect: ProviderDialect
  /** Default REST base URL. */
  baseUrl: string
  /** Capabilities advertised by the provider as a whole. */
  capabilities: ModelCapability[]
  /** Selectable models. */
  staticModels: StaticModel[]
  /** Self-hosted providers expose a user-configurable base URL. */
  selfHosted?: boolean
}

/** Resolve a localized string for the active language. */
export function localize(text: LocalizedText, lang: string): string {
  return lang.startsWith('en') ? text.en : text.pt
}

/** Resolve a localized guide for the active language. */
export function localizeGuide(guide: LocalizedGuide, lang: string): string[] {
  return lang.startsWith('en') ? guide.en : guide.pt
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  meshy: {
    id: 'meshy',
    label: 'Meshy',
    color: 'bg-indigo-100 text-indigo-700',
    description: {
      pt: 'Geração texto→3D e imagem→3D, texturização e auto-rigging com animação.',
      en: 'Text→3D and image→3D generation, texturing and auto-rigging with animation.',
    },
    consoleUrl: 'https://www.meshy.ai/api',
    keyPrefix: 'msy_',
    guide: {
      pt: [
        'Crie uma conta em meshy.ai',
        'Abra Settings → API Keys',
        'Gere uma nova chave (começa com msy_) e cole aqui',
      ],
      en: [
        'Create an account at meshy.ai',
        'Open Settings → API Keys',
        'Generate a new key (starts with msy_) and paste it here',
      ],
    },
    dialect: 'meshy',
    baseUrl: 'https://api.meshy.ai',
    capabilities: ['text-to-3d', 'image-to-3d', 'texturing', 'rigging', 'animation'],
    staticModels: [
      {
        id: 'meshy-6',
        label: 'Meshy 6',
        tier: 'premium',
        capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
        description: {
          pt: 'Modelo mais recente — maior fidelidade de malha e textura.',
          en: 'Latest model — highest mesh and texture fidelity.',
        },
      },
      {
        id: 'meshy-5',
        label: 'Meshy 5',
        tier: 'balanced',
        capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
      },
      {
        id: 'meshy-rigging',
        label: 'Meshy Rigging',
        tier: 'balanced',
        capabilities: ['rigging', 'animation'],
        description: {
          pt: 'Auto-rigging humanoide + animações prontas.',
          en: 'Humanoid auto-rigging + ready-made animations.',
        },
      },
    ],
  },

  tripo: {
    id: 'tripo',
    label: 'Tripo',
    color: 'bg-emerald-100 text-emerald-700',
    description: {
      pt: 'Texto→3D e imagem→3D de alta fidelidade, com texturização e rigging.',
      en: 'High-fidelity text→3D and image→3D, with texturing and rigging.',
    },
    consoleUrl: 'https://platform.tripo3d.ai/api-keys',
    keyPrefix: 'tsk_',
    guide: {
      pt: [
        'Crie uma conta em platform.tripo3d.ai',
        'Acesse API Keys',
        'Crie uma chave (começa com tsk_) e cole aqui',
      ],
      en: [
        'Create an account at platform.tripo3d.ai',
        'Go to API Keys',
        'Create a key (starts with tsk_) and paste it here',
      ],
    },
    dialect: 'tripo',
    baseUrl: 'https://api.tripo3d.ai',
    capabilities: ['text-to-3d', 'image-to-3d', 'texturing', 'rigging', 'animation'],
    staticModels: [
      {
        id: 'v3.0-20250812',
        label: 'Tripo v3.0',
        tier: 'premium',
        capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
      },
      {
        id: 'v2.5-20250123',
        label: 'Tripo v2.5',
        tier: 'balanced',
        capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
      },
      {
        id: 'tripo-rig',
        label: 'Tripo Rigging',
        tier: 'balanced',
        capabilities: ['rigging', 'animation'],
      },
    ],
  },

  rodin: {
    id: 'rodin',
    label: 'Rodin (Hyper3D)',
    color: 'bg-rose-100 text-rose-700',
    description: {
      pt: 'Geração 3D de alta qualidade da Hyper3D (Rodin).',
      en: 'High-quality 3D generation from Hyper3D (Rodin).',
    },
    consoleUrl: 'https://hyper3d.ai/api',
    keyPrefix: '',
    guide: {
      pt: [
        'Crie uma conta em hyper3d.ai',
        'Solicite acesso à API e gere sua chave',
        'Cole a chave aqui',
      ],
      en: [
        'Create an account at hyper3d.ai',
        'Request API access and generate your key',
        'Paste the key here',
      ],
    },
    dialect: 'rodin',
    baseUrl: 'https://hyperhuman.deemos.com/api/v2',
    capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
    staticModels: [
      {
        id: 'rodin-gen-1.5',
        label: 'Rodin Gen-1.5',
        tier: 'premium',
        capabilities: ['text-to-3d', 'image-to-3d', 'texturing'],
      },
    ],
  },

  hunyuan: {
    id: 'hunyuan',
    label: 'Hunyuan3D',
    color: 'bg-sky-100 text-sky-700',
    description: {
      pt: 'Modelos 3D da Tencent (Hunyuan3D) via Tencent Cloud.',
      en: 'Tencent 3D models (Hunyuan3D) via Tencent Cloud.',
    },
    consoleUrl: 'https://cloud.tencent.com/product/hunyuan3d',
    keyPrefix: '',
    guide: {
      pt: [
        'Acesse o console da Tencent Cloud',
        'Ative o serviço Hunyuan3D e gere SecretId/SecretKey',
        'Cole as credenciais aqui',
      ],
      en: [
        'Open the Tencent Cloud console',
        'Enable the Hunyuan3D service and create a SecretId/SecretKey',
        'Paste the credentials here',
      ],
    },
    dialect: 'hunyuan',
    baseUrl: 'https://hunyuan.tencentcloudapi.com',
    capabilities: ['text-to-3d', 'image-to-3d'],
    staticModels: [
      {
        id: 'hunyuan-3d-2',
        label: 'Hunyuan3D 2.0',
        tier: 'balanced',
        capabilities: ['text-to-3d', 'image-to-3d'],
      },
    ],
  },

  selfhost: {
    id: 'selfhost',
    label: 'Self-hosted (TripoSR / SF3D)',
    color: 'bg-slate-200 text-slate-700',
    description: {
      pt: 'Seu próprio servidor open-source (TripoSR, Stable Fast 3D) via URL.',
      en: 'Your own open-source server (TripoSR, Stable Fast 3D) via URL.',
    },
    consoleUrl: 'https://github.com/VAST-AI-Research/TripoSR',
    keyPrefix: '',
    guide: {
      pt: [
        'Rode TripoSR ou Stable Fast 3D em um servidor com GPU',
        'Exponha um endpoint HTTP de inferência',
        'Informe a URL base abaixo (a chave é opcional)',
      ],
      en: [
        'Run TripoSR or Stable Fast 3D on a GPU server',
        'Expose an HTTP inference endpoint',
        'Set the base URL below (the key is optional)',
      ],
    },
    dialect: 'custom',
    baseUrl: '',
    capabilities: ['image-to-3d', 'rigging'],
    selfHosted: true,
    staticModels: [
      {
        id: 'triposr',
        label: 'TripoSR',
        tier: 'fast',
        capabilities: ['image-to-3d'],
        isFree: true,
      },
      {
        id: 'stable-fast-3d',
        label: 'Stable Fast 3D',
        tier: 'fast',
        capabilities: ['image-to-3d'],
        isFree: true,
      },
      {
        id: 'local-rigging',
        label: 'Local Rigging Worker',
        tier: 'fast',
        capabilities: ['rigging'],
        isFree: true,
        description: {
          pt: 'Worker Python local que usa Blender para gerar o rigging facial automaticamente.',
          en: 'Local Python worker that uses Blender to automatically generate facial rigging.',
        },
      },
    ],
  },
}

/** Stable display order for provider lists. */
export const PROVIDER_ORDER: ProviderId[] = [
  'meshy',
  'tripo',
  'rodin',
  'hunyuan',
  'selfhost',
]

/** Firestore api_keys field name for a provider. */
export function apiKeyFieldForProvider(providerId: ProviderId): string {
  return `${providerId}_api_key`
}

/** Type guard for provider ids. */
export function isProviderId(value: string): value is ProviderId {
  return value in PROVIDERS
}
