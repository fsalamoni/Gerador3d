/**
 * Generation task definitions — the 3D analog of Lexio's per-agent model config.
 *
 * Each task (text→3D, image→3D, rigging, texturing, animation) is bound to a
 * model the user picks from their personal catalog. A task only accepts models
 * whose capabilities include the task's `requiredCapability`.
 *
 * Catalog model ids are namespaced as `${providerId}:${rawModelId}` so the same
 * raw id from two providers never collides in the unified catalog.
 */
import type { ModelCapability } from './firestore-types'
import type { LocalizedText } from './providers'

export type TaskKey =
  | 'text_to_3d'
  | 'image_to_3d'
  | 'rigging'
  | 'texturing'
  | 'animation'

export interface TaskDef {
  key: TaskKey
  label: LocalizedText
  description: LocalizedText
  /** lucide-react icon name used by the config UI. */
  icon: string
  requiredCapability: ModelCapability
  /** Default catalog model id (`providerId:rawId`). */
  defaultModel: string
  /** Whether the task is part of the core avatar pipeline or optional. */
  optional?: boolean
}

export const TASK_DEFS: TaskDef[] = [
  {
    key: 'text_to_3d',
    label: { pt: 'Texto → 3D', en: 'Text → 3D' },
    description: {
      pt: 'Gera um modelo 3D a partir de uma descrição em texto.',
      en: 'Generates a 3D model from a text description.',
    },
    icon: 'type',
    requiredCapability: 'text-to-3d',
    defaultModel: 'meshy:meshy-6',
  },
  {
    key: 'image_to_3d',
    label: { pt: 'Imagem → 3D', en: 'Image → 3D' },
    description: {
      pt: 'Gera um modelo 3D a partir de uma imagem 2D.',
      en: 'Generates a 3D model from a 2D image.',
    },
    icon: 'image',
    requiredCapability: 'image-to-3d',
    defaultModel: 'meshy:meshy-6',
  },
  {
    key: 'texturing',
    label: { pt: 'Texturização', en: 'Texturing' },
    description: {
      pt: 'Aplica texturas PBR ao modelo 3D gerado.',
      en: 'Applies PBR textures to the generated 3D model.',
    },
    icon: 'palette',
    requiredCapability: 'texturing',
    defaultModel: 'meshy:meshy-6',
  },
  {
    key: 'rigging',
    label: { pt: 'Rigging', en: 'Rigging' },
    description: {
      pt: 'Cria o esqueleto humanoide para animar o avatar.',
      en: 'Builds the humanoid skeleton to animate the avatar.',
    },
    icon: 'bone',
    requiredCapability: 'rigging',
    defaultModel: 'meshy:meshy-rigging',
  },
  {
    key: 'animation',
    label: { pt: 'Animação', en: 'Animation' },
    description: {
      pt: 'Aplica animações prontas ao avatar (opcional).',
      en: 'Applies ready-made animations to the avatar (optional).',
    },
    icon: 'walk',
    requiredCapability: 'animation',
    defaultModel: 'meshy:meshy-rigging',
    optional: true,
  },
]

/** Default task → model map. */
export function getDefaultTaskModels(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const task of TASK_DEFS) map[task.key] = task.defaultModel
  return map
}

/** Find a task definition by key. */
export function getTaskDef(key: string): TaskDef | undefined {
  return TASK_DEFS.find((t) => t.key === key)
}
