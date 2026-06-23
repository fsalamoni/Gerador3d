/**
 * VoiceLipSync — fala/áudio movendo a boca do avatar (reaproveita os morphs
 * jawOpen/funnel/close criados no rig).
 *
 *  - "Áudio de um arquivo": funciona SEM chave — analisa a amplitude e move a boca.
 *  - "Falar um texto": opcional, via ElevenLabs (chave em localStorage).
 *
 * Lip-sync preciso por fonema é o upgrade (Audio2Face/NeuroSync, docs/LIGACOES.md).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Volume2, Mic, Square, KeyRound, Loader2 } from 'lucide-react'
import type { AvatarCanvasHandle } from './AvatarCanvas'
import { LipSyncDriver, speakWithElevenLabs, type Visemes } from '../lib/lipsync'
import { loadFeatureKeys, saveFeatureKeys } from '../lib/feature-keys'

export default function VoiceLipSync({ avatar }: { avatar: RefObject<AvatarCanvasHandle> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const driverRef = useRef<LipSyncDriver | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [key, setKey] = useState(loadFeatureKeys().elevenlabsKey ?? '')

  const stop = useCallback(() => {
    driverRef.current?.stop()
    driverRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      const url = audioRef.current.src
      audioRef.current = null
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    avatar.current?.clearPreview()
    setPlaying(false)
  }, [avatar])

  // Tear down on unmount.
  useEffect(() => () => stop(), [stop])

  const playUrl = useCallback(
    (url: string, revoke: boolean) => {
      stop()
      const audio = new Audio(url)
      audio.crossOrigin = 'anonymous'
      audioRef.current = audio
      const sink = (v: Visemes) => {
        const a = avatar.current
        if (!a) return
        a.previewMorph('jawOpen', v.jawOpen)
        a.previewMorph('mouthFunnel', v.mouthFunnel)
        a.previewMorph('mouthClose', v.mouthClose)
      }
      const driver = new LipSyncDriver(sink)
      driverRef.current = driver
      audio.addEventListener('ended', () => {
        stop()
        if (revoke && url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
      audio
        .play()
        .then(() => {
          driver.attach(audio)
          setPlaying(true)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao tocar o áudio.'))
    },
    [avatar, stop],
  )

  const onAudioFile = useCallback(
    (file: File) => {
      setError(null)
      playUrl(URL.createObjectURL(file), true)
    },
    [playUrl],
  )

  const speak = useCallback(async () => {
    setError(null)
    const k = loadFeatureKeys().elevenlabsKey
    if (!k) {
      setShowKey(true)
      setError('Cole a chave da ElevenLabs para falar um texto.')
      return
    }
    if (!text.trim()) return
    setBusy(true)
    try {
      const blob = await speakWithElevenLabs(text.trim(), { apiKey: k })
      playUrl(URL.createObjectURL(blob), true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao gerar a voz.')
    } finally {
      setBusy(false)
    }
  }, [text, playUrl])

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
        <Volume2 className="h-3.5 w-3.5" /> Voz → boca (lip-sync)
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800/70"
        >
          <Mic className="h-3.5 w-3.5" /> Áudio de um arquivo
        </button>
        {playing && (
          <button
            onClick={stop}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-600/15 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-600/25"
          >
            <Square className="h-3.5 w-3.5" /> Parar
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onAudioFile(f)
          e.target.value = ''
        }}
      />
      <p className="mt-1 text-[10px] text-slate-500">Funciona sem chave: a boca acompanha o volume.</p>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="Falar um texto (ElevenLabs)…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-xs text-slate-100"
        />
        <button
          onClick={() => void speak()}
          disabled={busy}
          className="flex items-center justify-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Falar'}
        </button>
        <button
          onClick={() => setShowKey((s) => !s)}
          title="Configurar a chave da ElevenLabs"
          className="flex items-center justify-center rounded-md border border-white/10 px-2 py-1 text-slate-400 transition hover:bg-white/5"
        >
          <KeyRound className="h-3.5 w-3.5" />
        </button>
      </div>
      {showKey && (
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            placeholder="Chave ElevenLabs"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-800/60 px-2 py-1 text-xs text-slate-100"
          />
          <button
            onClick={() => {
              saveFeatureKeys({ elevenlabsKey: key })
              setShowKey(false)
              setError(null)
            }}
            className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-brand-500"
          >
            Salvar
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-amber-300">{error}</p>}
    </div>
  )
}
