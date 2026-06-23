/**
 * ConnectionsCard — a plain-language "what's connected" overview, so the user can
 * see at a glance what already works and which optional "ligações" (GPU, keys)
 * are set. Mirrors docs/LIGACOES.md. Self-contained: pass local diagnostics when
 * available; without them (web mode) it shows the manual/optional connections.
 */
import { CheckCircle2, Circle, MinusCircle, PlugZap } from 'lucide-react'
import type { LocalDiagnostics } from '../lib/local-api'
import { IS_LOCAL } from '../lib/runtime'

type Status = 'on' | 'off' | 'manual' | 'soon'

const ICON: Record<Status, JSX.Element> = {
  on: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  off: <Circle className="h-4 w-4 text-amber-400" />,
  manual: <MinusCircle className="h-4 w-4 text-sky-400" />,
  soon: <Circle className="h-4 w-4 text-slate-600" />,
}
const TAG: Record<Status, string> = { on: 'Ligado', off: 'Não ligado', manual: 'Manual', soon: 'Em breve' }

export default function ConnectionsCard({ diag }: { diag?: LocalDiagnostics | null }) {
  const gen = diag?.generation
  const rig = diag?.rigging
  const known = IS_LOCAL && !!diag

  const rows: { name: string; status: Status; detail: string }[] = [
    {
      name: 'Geração 3D local (GPU)',
      status: !known ? (IS_LOCAL ? 'off' : 'manual') : gen?.cuda ? 'on' : 'off',
      detail: gen?.cuda
        ? `${gen?.gpu || 'GPU'} · ${gen?.vramGb ?? '?'} GB`
        : 'Precisa de GPU NVIDIA (ou use a nuvem com chave de API).',
    },
    {
      name: 'Modelo de geração instalado',
      status: !known ? 'off' : gen?.triposr ? 'on' : 'off',
      detail: gen?.triposr ? 'TripoSR pronto.' : 'Instale em Configuração → Geração 3D.',
    },
    {
      name: 'Hunyuan3D (alta qualidade)',
      status: !known ? 'off' : gen?.hunyuan ? 'on' : 'off',
      detail: gen?.hunyuan ? 'Instalado.' : 'Opcional — recomenda ≥12 GB de VRAM.',
    },
    {
      name: 'Texturização PBR (Hunyuan3D-Paint)',
      status: 'manual',
      detail: 'GPU forte + módulos compilados. Passo a passo em docs/LIGACOES.md.',
    },
    {
      name: 'Blender (rigging / exportar VRM)',
      status: !known ? 'off' : rig?.blender ? 'on' : 'off',
      detail: rig?.blender ? 'Detectado.' : 'Instale em Configuração → Rigging facial.',
    },
    {
      name: 'Provedores na nuvem (Tripo / Meshy / fal.ai)',
      status: 'manual',
      detail: known
        ? 'No app desktop tudo roda local (GPU acima). Provedores de nuvem são só na versão web.'
        : 'Sem GPU? Cole a chave nas configurações de provedores (versão web).',
    },
    {
      name: 'Voz → rosto (lip-sync)',
      status: 'manual',
      detail: 'Estúdio → abra um modelo → "Configurar expressões faciais" → gere as expressões. O áudio já move a boca sem chave; ElevenLabs precisa de chave (campo no próprio painel).',
    },
    {
      name: 'Copiloto de IA (foto → pontos)',
      status: 'manual',
      detail: 'Estúdio → abra um modelo → "Configurar expressões faciais" → "Sugerir pontos por foto". Precisa de chave OpenRouter/Groq (campo no próprio painel).',
    },
  ]

  return (
    <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-2 flex items-center gap-2">
        <PlugZap className="h-5 w-5 text-brand-300" />
        <h2 className="font-semibold text-white">Status das ligações</h2>
      </div>
      <p className="mb-3 text-sm text-slate-400">
        <span className="text-emerald-300">Já funciona sem ligar nada:</span> ajustar o rosto,
        criar olhos/boca/cabelo, presets de criatura, editar material, animar pela webcam e
        exportar (GLB/VRM). As linhas abaixo são as ligações <em>opcionais</em>.
      </p>
      <ul className="divide-y divide-white/5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start gap-3 py-2">
            <span className="mt-0.5 shrink-0">{ICON[r.status]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-200">{r.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{TAG[r.status]}</span>
              </div>
              <p className="text-xs text-slate-500">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-slate-500">
        Guia completo e mastigado: <code className="text-slate-400">docs/LIGACOES.md</code>.
      </p>
    </section>
  )
}
