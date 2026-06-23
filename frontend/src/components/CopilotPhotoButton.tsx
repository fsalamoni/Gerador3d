/**
 * CopilotPhotoButton — "ler" uma foto de referência com um LLM de visão e propor
 * os landmarks do rosto, semeando o rig sem clicar ponto a ponto. Usa
 * {@link proposeLandmarksFromImage} (atrás da chave OpenRouter/Groq, guardada em
 * localStorage via feature-keys). O resultado é um PONTO DE PARTIDA — o usuário
 * ainda pode corrigir qualquer ponto clicando nele.
 */
import { useCallback, useRef, useState, type RefObject } from 'react'
import { Camera, KeyRound, Loader2 } from 'lucide-react'
import type { AvatarCanvasHandle } from './AvatarCanvas'
import type { FaceLandmarks } from '../lib/procedural-face-rig'
import { proposeLandmarksFromImage, image2DToMeshLandmarks } from '../lib/copilot-client'
import { loadFeatureKeys, saveFeatureKeys } from '../lib/feature-keys'

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    r.readAsDataURL(file)
  })
}

export default function CopilotPhotoButton({
  avatar,
  onLandmarks,
}: {
  avatar: RefObject<AvatarCanvasHandle>
  onLandmarks: (lm: FaceLandmarks) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [key, setKey] = useState(loadFeatureKeys().copilotKey ?? '')
  const [model, setModel] = useState(loadFeatureKeys().copilotModel ?? '')
  const [baseUrl, setBaseUrl] = useState(loadFeatureKeys().copilotBaseUrl ?? '')

  const onPick = useCallback(
    async (file: File) => {
      setError(null)
      const keys = loadFeatureKeys()
      if (!keys.copilotKey) {
        setShowKey(true)
        setError('Cole a chave do OpenRouter ou Groq para usar o copiloto.')
        return
      }
      const bounds = avatar.current?.getMeshBounds()
      if (!bounds) {
        setError('Carregue um modelo com malha antes de usar o copiloto.')
        return
      }
      setBusy(true)
      try {
        const dataUrl = await readDataUrl(file)
        const lm2d = await proposeLandmarksFromImage(dataUrl, {
          apiKey: keys.copilotKey,
          baseUrl: keys.copilotBaseUrl || undefined,
          model: keys.copilotModel || undefined,
        })
        onLandmarks(image2DToMeshLandmarks(lm2d, bounds))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha no copiloto.')
      } finally {
        setBusy(false)
      }
    },
    [avatar, onLandmarks],
  )

  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800/70 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {busy ? 'Lendo a foto…' : 'Sugerir pontos por foto (IA)'}
        </button>
        <button
          onClick={() => setShowKey((s) => !s)}
          title="Configurar a chave do copiloto"
          className="flex items-center justify-center rounded-lg border border-white/10 px-2 text-slate-400 transition hover:bg-white/5"
        >
          <KeyRound className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPick(f)
          e.target.value = ''
        }}
      />
      {showKey && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2">
          <input
            type="password"
            placeholder="Chave OpenRouter/Groq"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-xs text-slate-100"
          />
          <input
            type="text"
            placeholder="Base URL (opcional — Groq: https://api.groq.com/openai/v1)"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-100"
          />
          <input
            type="text"
            placeholder="Modelo (opcional — ex.: openai/gpt-4o-mini)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-100"
          />
          <button
            onClick={() => {
              saveFeatureKeys({ copilotKey: key, copilotBaseUrl: baseUrl, copilotModel: model })
              setShowKey(false)
              setError(null)
            }}
            className="w-full rounded-md bg-brand-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-500"
          >
            Salvar chave (fica só neste navegador)
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-amber-300">{error}</p>}
    </div>
  )
}
