/**
 * AiKeysCard — central place for the OPTIONAL AI keys (voice + copilot). These
 * features work entirely in the desktop app but need a provider key, which lives
 * only in this browser (localStorage via feature-keys). Cloud 3D-generation
 * providers (Tripo/Meshy) are a web-only path and intentionally not here — the
 * desktop app generates locally on the GPU.
 */
import { useState } from 'react'
import { KeyRound, Mic, Camera, Check } from 'lucide-react'
import { loadFeatureKeys, saveFeatureKeys } from '../lib/feature-keys'

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand-300 underline decoration-dotted">
      {children}
    </a>
  )
}

export default function AiKeysCard() {
  const init = loadFeatureKeys()
  const [eleven, setEleven] = useState(init.elevenlabsKey ?? '')
  const [copilot, setCopilot] = useState(init.copilotKey ?? '')
  const [baseUrl, setBaseUrl] = useState(init.copilotBaseUrl ?? '')
  const [model, setModel] = useState(init.copilotModel ?? '')
  const [savedEleven, setSavedEleven] = useState(false)
  const [savedCopilot, setSavedCopilot] = useState(false)

  return (
    <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-brand-300" />
        <h2 className="font-semibold text-white">Chaves de IA (voz e copiloto)</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Opcionais. Sem chave, o app já anima pela webcam e move a boca por áudio. As
        chaves ficam <b className="text-slate-300">só neste computador</b> e vão direto ao
        provedor escolhido.
      </p>

      {/* ElevenLabs (voz) */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <Mic className="h-4 w-4 text-brand-300" /> Voz (ElevenLabs)
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Para “falar um texto” e o avatar mover a boca. Pegue a chave em{' '}
          <Ext href="https://elevenlabs.io/app/settings/api-keys">elevenlabs.io → API Keys</Ext>.
          O lip-sync por <b>arquivo de áudio</b> funciona sem isso.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="password" placeholder="Chave da ElevenLabs" value={eleven}
            onChange={(e) => { setEleven(e.target.value); setSavedEleven(false) }}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100"
          />
          <button
            onClick={() => { saveFeatureKeys({ elevenlabsKey: eleven }); setSavedEleven(true) }}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {savedEleven ? <Check className="h-4 w-4" /> : null}{savedEleven ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Copilot (OpenRouter/Groq) */}
      <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <Camera className="h-4 w-4 text-brand-300" /> Copiloto — foto → pontos do rosto
        </p>
        <p className="mt-1 text-xs text-slate-400">
          “Sugerir pontos por foto” no painel de expressões. Use{' '}
          <Ext href="https://openrouter.ai/keys">OpenRouter</Ext> ou{' '}
          <Ext href="https://console.groq.com/keys">Groq</Ext> (Groq tem cota grátis).
        </p>
        <div className="mt-2 space-y-2">
          <input
            type="password" placeholder="Chave OpenRouter/Groq" value={copilot}
            onChange={(e) => { setCopilot(e.target.value); setSavedCopilot(false) }}
            className="w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-100"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="text" placeholder="Base URL (Groq: https://api.groq.com/openai/v1)" value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setSavedCopilot(false) }}
              className="w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-100"
            />
            <input
              type="text" placeholder="Modelo (ex.: openai/gpt-4o-mini)" value={model}
              onChange={(e) => { setModel(e.target.value); setSavedCopilot(false) }}
              className="w-full rounded-md border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-100"
            />
          </div>
          <button
            onClick={() => {
              saveFeatureKeys({ copilotKey: copilot, copilotBaseUrl: baseUrl, copilotModel: model })
              setSavedCopilot(true)
            }}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {savedCopilot ? <Check className="h-4 w-4" /> : null}{savedCopilot ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Geração 3D na nuvem (Tripo/Meshy) é da versão web — no app desktop a geração roda
        na sua GPU (seção acima).
      </p>
    </section>
  )
}
