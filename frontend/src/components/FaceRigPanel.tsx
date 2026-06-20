/**
 * FaceRigPanel — guided facial-rig flow for the live studio.
 *
 * The user orbits the model in the viewport and clicks a few facial points
 * (eyes, mouth corners, optional jaw). From those we synthesize ARKit
 * blendshapes ({@link buildProceduralMorphs}) so the webcam can drive mouth,
 * smile, jaw and blink — even on creatures and template-less generated meshes.
 * Landmarks are saved per model so the rig persists on reload and in OBS.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ScanFace, RotateCcw, Sparkles, Check, X } from 'lucide-react'
import type { AvatarCanvasHandle } from './AvatarCanvas'
import {
  saveLandmarks,
  type FaceLandmarks,
  type LandmarkKey,
} from '../lib/procedural-face-rig'

interface StepDef {
  key: LandmarkKey
  label: string
  hint: string
  optional?: boolean
  color: number
}

const STEPS: StepDef[] = [
  { key: 'eyeLeft', label: 'Olho esquerdo', hint: 'Clique no centro do olho à ESQUERDA do personagem.', color: 0x60a5fa },
  { key: 'eyeRight', label: 'Olho direito', hint: 'Clique no centro do olho à DIREITA do personagem.', color: 0x60a5fa },
  { key: 'mouthLeft', label: 'Canto esquerdo da boca', hint: 'Clique no canto ESQUERDO da boca.', color: 0xf472b6 },
  { key: 'mouthRight', label: 'Canto direito da boca', hint: 'Clique no canto DIREITO da boca.', color: 0xf472b6 },
  { key: 'jaw', label: 'Queixo (opcional)', hint: 'Clique na ponta do queixo/maxilar inferior — melhora o "abrir a boca".', optional: true, color: 0xfbbf24 },
]

const REQUIRED: LandmarkKey[] = ['eyeLeft', 'eyeRight', 'mouthLeft', 'mouthRight']

type Marks = Partial<Record<LandmarkKey, [number, number, number]>>

export default function FaceRigPanel({
  avatar,
  modelUrl,
  onClose,
  onBuilt,
}: {
  avatar: RefObject<AvatarCanvasHandle>
  modelUrl: string
  onClose: () => void
  onBuilt: () => void
}) {
  const [step, setStep] = useState(0)
  const [marks, setMarks] = useState<Marks>({})
  const [built, setBuilt] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = REQUIRED.every((k) => marks[k])
  const picking = step < STEPS.length && !built

  // Arm one-shot pick for the current step; advance when the user clicks.
  useEffect(() => {
    const a = avatar.current
    if (!a || !picking) return
    let cancelled = false
    void a.pickPoint().then((hit) => {
      if (cancelled || !hit) return
      a.addMarker(hit.world, STEPS[step].color)
      setMarks((m) => ({ ...m, [STEPS[step].key]: hit.local }))
      setStep((s) => s + 1)
    })
    return () => {
      cancelled = true
      a.cancelPick()
    }
  }, [step, picking, avatar])

  const reset = useCallback(() => {
    avatar.current?.clearMarkers()
    avatar.current?.clearPreview()
    setMarks({})
    setStep(0)
    setBuilt(false)
    setError(null)
  }, [avatar])

  const build = useCallback(() => {
    const a = avatar.current
    if (!a || !ready) return
    setError(null)
    try {
      const lm: FaceLandmarks = {
        eyeLeft: marks.eyeLeft!,
        eyeRight: marks.eyeRight!,
        mouthLeft: marks.mouthLeft!,
        mouthRight: marks.mouthRight!,
        ...(marks.jaw ? { jaw: marks.jaw } : {}),
      }
      a.buildFaceRig(lm)
      saveLandmarks(modelUrl, lm)
      setBuilt(true)
      onBuilt()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar as expressões.')
    }
  }, [avatar, ready, marks, modelUrl, onBuilt])

  // Quick visual test of the generated morphs (camera off).
  const preview = useCallback(
    (name: string, value: number) => avatar.current?.previewMorph(name, value),
    [avatar],
  )

  const finish = useCallback(() => {
    avatar.current?.clearPreview()
    onClose()
  }, [avatar, onClose])

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-600/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-100">
          <ScanFace className="h-4 w-4" /> Mapear rosto
        </p>
        <button onClick={finish} className="text-slate-400 transition hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!built ? (
        <>
          <p className="text-xs text-slate-300">
            Gire o modelo (arraste) e clique nos pontos. Funciona em qualquer
            personagem — humano ou criatura.
          </p>

          <ol className="mt-3 space-y-1.5">
            {STEPS.map((s, i) => {
              const done = Boolean(marks[s.key])
              const current = i === step && picking
              return (
                <li
                  key={s.key}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                    current
                      ? 'bg-brand-600/20 text-brand-100 ring-1 ring-brand-500/40'
                      : done
                        ? 'text-emerald-300'
                        : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                      done ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/10'
                    }`}
                  >
                    {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  <span>{s.label}{s.optional ? '' : ' *'}</span>
                </li>
              )
            })}
          </ol>

          {picking && (
            <p className="mt-2 rounded-lg bg-slate-800/60 px-2.5 py-2 text-[11px] text-slate-200">
              👉 {STEPS[step].hint}
            </p>
          )}

          {error && (
            <p className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] text-red-300">{error}</p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Recomeçar
            </button>
            <button
              onClick={build}
              disabled={!ready}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" /> Gerar expressões
            </button>
          </div>
          {!ready && (
            <p className="mt-1.5 text-center text-[10px] text-slate-500">
              Marque ao menos os 4 pontos com * (queixo é opcional).
            </p>
          )}
        </>
      ) : (
        <>
          <p className="rounded-lg bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
            Expressões geradas e salvas! Teste abaixo; depois inicie a câmera para
            animar com seu rosto.
          </p>
          <p className="mt-3 mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            Testar (segure)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <TestBtn label="Abrir boca" onDown={() => preview('jawOpen', 1)} onUp={() => preview('jawOpen', 0)} />
            <TestBtn label="Sorrir" onDown={() => { preview('mouthSmileLeft', 1); preview('mouthSmileRight', 1) }} onUp={() => { preview('mouthSmileLeft', 0); preview('mouthSmileRight', 0) }} />
            <TestBtn label="Piscar" onDown={() => { preview('eyeBlinkLeft', 1); preview('eyeBlinkRight', 1) }} onUp={() => { preview('eyeBlinkLeft', 0); preview('eyeBlinkRight', 0) }} />
            <TestBtn label="Bico (ou)" onDown={() => preview('mouthPucker', 1)} onUp={() => preview('mouthPucker', 0)} />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Refazer
            </button>
            <button
              onClick={finish}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              <Check className="h-3.5 w-3.5" /> Concluir
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function TestBtn({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      className="rounded-lg border border-white/10 bg-slate-800/40 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800/70 active:bg-brand-600/30"
    >
      {label}
    </button>
  )
}
