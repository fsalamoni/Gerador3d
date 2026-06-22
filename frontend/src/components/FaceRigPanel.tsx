/**
 * FaceRigPanel — guided, EDITABLE facial-rig flow for the live studio.
 *
 * The user marks a few facial points (eyes, mouth corners, optional jaw) on the
 * model; we synthesize ARKit blendshapes ({@link buildProceduralMorphs}) so the
 * webcam drives mouth/smile/jaw/blink — on humans AND creatures. Then they can
 * export a .vrm/.glb with those expressions baked in.
 *
 * Designed to avoid wasted work:
 *  - "Estimar automaticamente" pre-places all points from the mesh bounds.
 *  - ANY point can be re-marked individually by clicking it — no full restart.
 *  - "Atualizar expressões" rebuilds after a correction.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ScanFace, RotateCcw, Sparkles, Check, X, Download, Save, Wand2, Pencil } from 'lucide-react'
import type { AvatarCanvasHandle } from './AvatarCanvas'
import {
  saveLandmarks,
  type FaceLandmarks,
  type LandmarkKey,
} from '../lib/procedural-face-rig'
import { CREATURE_PRESETS, presetById } from '../lib/creature-presets'
import { upload3DModel } from '../lib/upload-service'

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
  { key: 'upperLip', label: 'Lábio superior (centro)', hint: 'Clique no MEIO do lábio de cima — essencial p/ abrir a boca.', color: 0xfb7185 },
  { key: 'lowerLip', label: 'Lábio inferior (centro)', hint: 'Clique no MEIO do lábio de baixo.', color: 0xfb7185 },
  { key: 'browLeft', label: 'Sobrancelha esq. (opcional)', hint: 'Clique no centro da sobrancelha esquerda.', optional: true, color: 0xa78bfa },
  { key: 'browRight', label: 'Sobrancelha dir. (opcional)', hint: 'Clique no centro da sobrancelha direita.', optional: true, color: 0xa78bfa },
  { key: 'jaw', label: 'Queixo (opcional)', hint: 'Clique na ponta do queixo — reforça o "abrir a boca".', optional: true, color: 0xfbbf24 },
]

const REQUIRED: LandmarkKey[] = ['eyeLeft', 'eyeRight', 'mouthLeft', 'mouthRight', 'upperLip', 'lowerLip']
const AVATAR_META = { title: 'Gerador3D Avatar', author: 'Gerador3D' }
const colorOf = (k: LandmarkKey) => STEPS.find((s) => s.key === k)!.color

type Marks = Partial<Record<LandmarkKey, [number, number, number]>>

function downloadBytes(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

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
  const [marks, setMarks] = useState<Marks>({})
  const [activeKey, setActiveKey] = useState<LandmarkKey | null>('eyeLeft')
  const [built, setBuilt] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'' | 'vrm' | 'glb' | 'save'>('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gain, setGain] = useState(1.5)
  const [interior, setInterior] = useState(false)
  const [eyes, setEyes] = useState(false)
  const [hair, setHair] = useState(false)
  const [presetId, setPresetId] = useState('human')
  const [mat, setMat] = useState<{ color: string; metalness: number; roughness: number } | null>(null)
  const [hairColor, setHairColor] = useState('#2a1a12')
  const [irisColor, setIrisColor] = useState('#5b3a1e')

  const ready = REQUIRED.every((k) => marks[k])

  // Keep the on-model markers in sync with the marks (and highlight the active).
  useEffect(() => {
    avatar.current?.setMarkers(
      (Object.keys(marks) as LandmarkKey[]).map((k) => ({
        local: marks[k]!,
        color: k === activeKey ? 0xffffff : colorOf(k),
      })),
    )
  }, [marks, activeKey, avatar])

  // Arm one-shot pick for the active landmark; store + advance on click.
  useEffect(() => {
    const a = avatar.current
    if (!a || !activeKey) return
    let cancelled = false
    void a.pickPoint().then((hit) => {
      if (cancelled || !hit) return
      const key = activeKey
      setMarks((m) => ({ ...m, [key]: hit.local }))
      if (built) setDirty(true)
      // Advance to the next still-missing required point, else stop.
      const next = REQUIRED.find((k) => k !== key && !marks[k])
      setActiveKey(next ?? null)
    })
    return () => {
      cancelled = true
      a.cancelPick()
    }
  }, [activeKey, avatar, built, marks])

  // Seed the material editor from the loaded model's material.
  useEffect(() => {
    const info = avatar.current?.getMaterialInfo()
    if (info) setMat(info)
  }, [avatar, modelUrl])

  const applyMat = useCallback(
    (patch: { color?: string; metalness?: number; roughness?: number }) => {
      setMat((m) => (m ? { ...m, ...patch } : m))
      avatar.current?.setMaterial(patch)
    },
    [avatar],
  )

  const autoGuess = useCallback(() => {
    const g = avatar.current?.guessLandmarks()
    if (!g) return
    setMarks(g)
    setActiveKey(null)
    if (built) setDirty(true)
    setError('Estimativa aplicada — gire o modelo e corrija qualquer ponto fora do lugar clicando nele.')
  }, [avatar, built])

  const reset = useCallback(() => {
    avatar.current?.clearMarkers()
    avatar.current?.clearPreview()
    setMarks({})
    setActiveKey('eyeLeft')
    setBuilt(false)
    setDirty(false)
    setSaved(false)
    setError(null)
  }, [avatar])

  const buildWith = useCallback(
    (g: number, withMouth = interior, withEyes = eyes, withHair = hair, pid = presetId) => {
      const a = avatar.current
      if (!a || !ready) return
      setError(null)
      try {
        const lm: FaceLandmarks = {
          eyeLeft: marks.eyeLeft!,
          eyeRight: marks.eyeRight!,
          mouthLeft: marks.mouthLeft!,
          mouthRight: marks.mouthRight!,
          upperLip: marks.upperLip!,
          lowerLip: marks.lowerLip!,
          ...(marks.browLeft ? { browLeft: marks.browLeft } : {}),
          ...(marks.browRight ? { browRight: marks.browRight } : {}),
          ...(marks.jaw ? { jaw: marks.jaw } : {}),
        }
        a.buildFaceRig(lm, g, {
          mouth: withMouth,
          eyes: withEyes,
          hair: withHair,
          preset: presetById(pid),
        })
        saveLandmarks(modelUrl, lm)
        setBuilt(true)
        setDirty(false)
        setSaved(false)
        onBuilt()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao gerar as expressões.')
      }
    },
    [avatar, ready, marks, modelUrl, onBuilt, interior, eyes, hair, presetId],
  )

  const build = useCallback(() => buildWith(gain), [buildWith, gain])

  const preview = useCallback(
    (name: string, value: number) => avatar.current?.previewMorph(name, value),
    [avatar],
  )

  const downloadFile = useCallback(async (fmt: 'vrm' | 'glb') => {
    const a = avatar.current
    if (!a) return
    setBusy(fmt)
    setError(null)
    try {
      downloadBytes(await a.exportAvatar(fmt, AVATAR_META), fmt === 'vrm' ? 'avatar.vrm' : 'avatar-riggado.glb')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao exportar.')
    } finally {
      setBusy('')
    }
  }, [avatar])

  const saveToLibrary = useCallback(async () => {
    const a = avatar.current
    if (!a) return
    setBusy('save')
    setError(null)
    try {
      const buf = await a.exportAvatar('vrm', AVATAR_META)
      await upload3DModel(new File([buf], `avatar-${Date.now()}.vrm`, { type: 'model/gltf-binary' }))
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.')
    } finally {
      setBusy('')
    }
  }, [avatar])

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

      <p className="text-xs text-slate-300">
        Gire o modelo (arraste) e clique nos pontos. Errou? Clique de novo na parte
        na lista para remarcar — sem recomeçar. Funciona em qualquer personagem.
      </p>

      <button
        onClick={autoGuess}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800/70"
      >
        <Wand2 className="h-3.5 w-3.5" /> Estimar pontos automaticamente
      </button>

      <ol className="mt-3 space-y-1.5">
        {STEPS.map((s) => {
          const done = Boolean(marks[s.key])
          const active = s.key === activeKey
          return (
            <li key={s.key}>
              <button
                onClick={() => setActiveKey(s.key)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  active
                    ? 'bg-brand-600/25 text-brand-50 ring-1 ring-brand-400/60'
                    : done
                      ? 'text-emerald-300 hover:bg-white/5'
                      : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: `#${s.color.toString(16).padStart(6, '0')}` }}
                />
                <span className="flex-1">{s.label}{s.optional ? '' : ' *'}</span>
                {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Pencil className="h-3 w-3 opacity-50" />}
              </button>
            </li>
          )
        })}
      </ol>

      {activeKey && (
        <p className="mt-2 rounded-lg bg-slate-800/60 px-2.5 py-2 text-[11px] text-slate-200">
          👉 {STEPS.find((s) => s.key === activeKey)!.hint}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-slate-700/40 px-2.5 py-2 text-[11px] text-slate-200">{error}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </button>
        <button
          onClick={build}
          disabled={!ready}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-40"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {built ? (dirty ? 'Atualizar expressões' : 'Regerar') : 'Gerar expressões'}
        </button>
      </div>
      {!ready && (
        <p className="mt-1.5 text-center text-[10px] text-slate-500">
          Marque os 4 pontos com * (queixo é opcional) ou use "Estimar".
        </p>
      )}

      <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
        <input
          type="checkbox"
          checked={interior}
          onChange={(e) => {
            const on = e.target.checked
            setInterior(on)
            if (built) buildWith(gain, on, eyes)
          }}
          className="mt-0.5 accent-brand-500"
        />
        <span className="text-[11px] leading-snug text-slate-300">
          Criar interior da boca <span className="text-slate-500">(cavidade + dentes + língua)</span>
          <br />
          <span className="text-[10px] text-slate-500">
            Para modelos "fechados" sem boca por dentro. Aparece ao abrir a boca. Experimental — me diga como ficou.
          </span>
        </span>
      </label>

      <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
        <input
          type="checkbox"
          checked={eyes}
          onChange={(e) => {
            const on = e.target.checked
            setEyes(on)
            if (built) buildWith(gain, interior, on)
          }}
          className="mt-0.5 accent-brand-500"
        />
        <span className="text-[11px] leading-snug text-slate-300">
          Criar olhos <span className="text-slate-500">(globo + íris + pálpebras que fecham)</span>
          <br />
          <span className="text-[10px] text-slate-500">
            Geometria real (não deformação). "Piscar" fecha as pálpebras. Experimental — me diga como ficou.
          </span>
        </span>
      </label>

      <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
        <input
          type="checkbox"
          checked={hair}
          onChange={(e) => {
            const on = e.target.checked
            setHair(on)
            if (built) buildWith(gain, interior, eyes, on, presetId)
          }}
          className="mt-0.5 accent-brand-500"
        />
        <span className="text-[11px] leading-snug text-slate-300">
          Criar cabelo <span className="text-slate-500">(calota que acompanha o crânio)</span>
          <br />
          <span className="text-[10px] text-slate-500">
            Aproximação (volume de cabelo, não fios). Cor ajustável no editor de material. Experimental.
          </span>
        </span>
      </label>

      <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
        <label className="text-[11px] leading-snug text-slate-300">
          Espécie / aparência <span className="text-slate-500">(olhos + boca)</span>
        </label>
        <select
          value={presetId}
          onChange={(e) => {
            const pid = e.target.value
            setPresetId(pid)
            if (built) buildWith(gain, interior, eyes, hair, pid)
          }}
          className="mt-1 w-full rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-xs text-slate-100"
        >
          {CREATURE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-slate-500">
          Humano por padrão. Felino/réptil = pupila em fenda + presas; "olhos grandes" = estilo anime.
          Afeta os olhos/boca criados acima.
        </p>
      </div>

      {mat && (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
          <p className="text-[11px] font-medium text-slate-300">Material / cor</p>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-300">
            <span>Cor base do modelo</span>
            <input
              type="color"
              value={mat.color}
              onChange={(e) => applyMat({ color: e.target.value })}
              className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            />
          </div>
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Brilho (menos áspero)</span>
              <span className="text-slate-200">{(1 - mat.roughness).toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={mat.roughness}
              onChange={(e) => applyMat({ roughness: Number(e.target.value) })}
              className="w-full accent-brand-500"
            />
          </div>
          <div className="mt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Metálico</span>
              <span className="text-slate-200">{mat.metalness.toFixed(2)}</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={mat.metalness}
              onChange={(e) => applyMat({ metalness: Number(e.target.value) })}
              className="w-full accent-brand-500"
            />
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
              <span>Cabelo</span>
              <input
                type="color" value={hairColor}
                onChange={(e) => { setHairColor(e.target.value); avatar.current?.setPartColor('hair', e.target.value) }}
                className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
              <span>Íris</span>
              <input
                type="color" value={irisColor}
                onChange={(e) => { setIrisColor(e.target.value); avatar.current?.setPartColor('iris', e.target.value) }}
                className="h-6 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </label>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Editado ao vivo e salvo no GLB exportado. Cabelo/íris só mudam se você os criou acima.
          </p>
        </div>
      )}

      {built && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="rounded-lg bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
            44 expressões ativas! Teste abaixo; inicie a câmera para animar com seu rosto.
          </p>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Intensidade das expressões</span>
              <span className="text-slate-200">{gain.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={3}
              step={0.1}
              value={gain}
              onChange={(e) => {
                const g = Number(e.target.value)
                setGain(g)
                buildWith(g)
              }}
              className="w-full accent-brand-500"
            />
            <p className="text-[10px] text-slate-500">Aumente se as expressões ficarem fracas/sutis.</p>
          </div>

          <p className="mt-3 mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Testar (segure)</p>
          <div className="grid grid-cols-3 gap-2">
            <TestBtn label="Abrir boca" onDown={() => preview('jawOpen', 1)} onUp={() => preview('jawOpen', 0)} />
            <TestBtn label="Sorrir" onDown={() => { preview('mouthSmileLeft', 1); preview('mouthSmileRight', 1) }} onUp={() => { preview('mouthSmileLeft', 0); preview('mouthSmileRight', 0) }} />
            <TestBtn label="Franzir" onDown={() => { preview('mouthFrownLeft', 1); preview('mouthFrownRight', 1) }} onUp={() => { preview('mouthFrownLeft', 0); preview('mouthFrownRight', 0) }} />
            <TestBtn label="Piscar" onDown={() => { preview('eyeBlinkLeft', 1); preview('eyeBlinkRight', 1) }} onUp={() => { preview('eyeBlinkLeft', 0); preview('eyeBlinkRight', 0) }} />
            <TestBtn label="Bico (ou)" onDown={() => preview('mouthPucker', 1)} onUp={() => preview('mouthPucker', 0)} />
            <TestBtn label='"Ô" (oh)' onDown={() => preview('mouthFunnel', 1)} onUp={() => preview('mouthFunnel', 0)} />
            <TestBtn label="Sobrancelha" onDown={() => { preview('browInnerUp', 1); preview('browOuterUpLeft', 1); preview('browOuterUpRight', 1) }} onUp={() => { preview('browInnerUp', 0); preview('browOuterUpLeft', 0); preview('browOuterUpRight', 0) }} />
            <TestBtn label="Queixo p/ lado" onDown={() => preview('jawLeft', 1)} onUp={() => preview('jawLeft', 0)} />
            <TestBtn label="Língua" onDown={() => preview('tongueOut', 1)} onUp={() => preview('tongueOut', 0)} />
          </div>

          <p className="mt-4 mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Exportar avatar (com expressões)</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={saveToLibrary}
              disabled={busy !== ''}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-600/25 disabled:opacity-50"
            >
              {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {busy === 'save' ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar na biblioteca'}
            </button>
            <button
              onClick={() => downloadFile('vrm')}
              disabled={busy !== ''}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/40 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800/70 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {busy === 'vrm' ? 'Gerando…' : 'Baixar .vrm'}
            </button>
          </div>
          <button
            onClick={() => downloadFile('glb')}
            disabled={busy !== ''}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/5 disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            {busy === 'glb' ? 'Gerando…' : 'Baixar .glb (com morphs)'}
          </button>
          <p className="mt-1.5 text-[10px] text-slate-500">
            .vrm com esqueleto + expressões (VSeeFace/VTube Studio) · .glb com morphs ARKit.
          </p>

          <button
            onClick={finish}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            <Check className="h-3.5 w-3.5" /> Concluir
          </button>
        </div>
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
