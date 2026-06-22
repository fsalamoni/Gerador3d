/**
 * Creature presets — bundle eye/mouth/hair anatomy options so a humanoid can be
 * adapted from human toward a species in one click ("humano primeiro, criaturas
 * depois", per CLAUDE.md). Each preset only sets the anatomy *options*; the
 * geometry builders (eye-anatomy, mouth-interior, hair-anatomy) do the work.
 */
import type { EyeOptions } from './eye-anatomy'
import type { MouthOptions } from './mouth-interior'
import type { HairOptions } from './hair-anatomy'

export interface CreaturePreset {
  id: string
  label: string
  eye?: EyeOptions
  mouth?: MouthOptions
  hair?: HairOptions
}

export const CREATURE_PRESETS: CreaturePreset[] = [
  {
    id: 'human',
    label: 'Humano',
    eye: { pupilShape: 'round' },
    mouth: {},
  },
  {
    id: 'feline',
    label: 'Felino (gato)',
    eye: { radiusFrac: 0.2, pupilShape: 'slit-vertical', pupilNarrow: 0.22, irisColor: 0x9ac24a },
    mouth: { fangs: true },
  },
  {
    id: 'reptile',
    label: 'Réptil / Dragão',
    eye: { radiusFrac: 0.17, pupilShape: 'slit-vertical', pupilNarrow: 0.18, irisColor: 0xc9a227 },
    mouth: { fangs: true, tongueColor: 0x7a2a2a },
  },
  {
    id: 'canine',
    label: 'Canino (lobo)',
    eye: { radiusFrac: 0.16, irisColor: 0x7a5a2a },
    mouth: { fangs: true },
  },
  {
    id: 'bigeye',
    label: 'Olhos grandes (anime)',
    eye: { radiusFrac: 0.26, irisFrac: 0.55, pupilFrac: 0.3 },
    mouth: {},
  },
]

export function presetById(id: string | undefined | null): CreaturePreset | undefined {
  if (!id) return undefined
  return CREATURE_PRESETS.find((p) => p.id === id)
}
