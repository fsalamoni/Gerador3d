/**
 * Lip-sync — drive the existing mouth morphs (jawOpen + visemes) from audio.
 *
 * Layers, from "works now, no key" to "high quality, needs a connection":
 *  1) {@link amplitudeToVisemes} — a PURE mapping from audio level (RMS 0..1) to
 *     ARKit-ish mouth-morph weights. A good-enough "lip flap" with no model and
 *     no API key. Smoke-tested.
 *  2) {@link LipSyncDriver} — runs a WebAudio analyser over an <audio> element and
 *     calls back with viseme weights each animation frame (browser only).
 *  3) {@link speakWithElevenLabs} — optional high-quality voice (ElevenLabs TTS),
 *     behind the user's API key.
 *
 * For phoneme-accurate blendshapes (vs. amplitude flap), NVIDIA Audio2Face /
 * NeuroSync is the upgrade: feed their per-frame ARKit weights straight to the
 * morphs (same target names). See docs/LIGACOES.md. This file is the structure;
 * the heavy model is a "ligação".
 */

export interface Visemes {
  jawOpen: number
  mouthFunnel: number
  mouthClose: number
}

const ZERO: Visemes = { jawOpen: 0, mouthFunnel: 0, mouthClose: 0 }
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * Map an audio level (RMS, ~0..1) to mouth morph weights. A soft knee keeps quiet
 * noise from flapping the jaw; louder vowels round the lips (funnel); silence
 * gives a gentle closure. If `prev` is given, eases toward the target by
 * `smooth` (0 = snap, 1 = frozen) for a natural, non-jittery motion.
 */
export function amplitudeToVisemes(rms: number, prev?: Visemes, smooth = 0.6): Visemes {
  const level = clamp01(Number.isFinite(rms) ? rms : 0)
  const open = level < 0.06 ? 0 : clamp01((level - 0.06) / 0.5)
  const target: Visemes = {
    jawOpen: open,
    mouthFunnel: open * 0.4,
    mouthClose: open < 0.05 ? 0.2 : 0,
  }
  if (!prev) return target
  const k = clamp01(smooth)
  return {
    jawOpen: prev.jawOpen + (target.jawOpen - prev.jawOpen) * (1 - k),
    mouthFunnel: prev.mouthFunnel + (target.mouthFunnel - prev.mouthFunnel) * (1 - k),
    mouthClose: prev.mouthClose + (target.mouthClose - prev.mouthClose) * (1 - k),
  }
}

/** Root-mean-square of a time-domain buffer (−1..1 samples) → level 0..1. */
export function rmsFromTimeDomain(data: Float32Array | number[]): number {
  let s = 0
  for (let i = 0; i < data.length; i++) s += data[i] * data[i]
  return data.length ? Math.sqrt(s / data.length) : 0
}

export type VisemeSink = (v: Visemes) => void

/**
 * Drives visemes from an <audio>/<video> element via WebAudio. Browser only.
 * `gain` scales the RMS (speech RMS is small); tune per source.
 */
export class LipSyncDriver {
  private ctx?: AudioContext
  private analyser?: AnalyserNode
  private raf = 0
  private prev: Visemes | undefined
  private buf?: Float32Array<ArrayBuffer>

  constructor(private sink: VisemeSink, private smooth = 0.6, private gain = 3) {}

  attach(media: HTMLMediaElement): void {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    this.ctx = new AC()
    const src = this.ctx.createMediaElementSource(media)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    src.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.buf = new Float32Array(this.analyser.fftSize)
    const tick = () => {
      this.analyser!.getFloatTimeDomainData(this.buf!)
      this.prev = amplitudeToVisemes(rmsFromTimeDomain(this.buf!) * this.gain, this.prev, this.smooth)
      this.sink(this.prev)
      this.raf = requestAnimationFrame(tick)
    }
    tick()
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.sink({ ...ZERO })
    void this.ctx?.close()
    this.ctx = undefined
    this.prev = undefined
  }
}

export interface TtsOptions {
  apiKey: string
  voiceId?: string
  modelId?: string
}

/**
 * Synthesize speech with ElevenLabs (returns an audio Blob to play + drive the
 * LipSyncDriver). Requires the user's API key. The request shape is real; it is
 * verified by build/typecheck here and exercised once the key is connected.
 */
export async function speakWithElevenLabs(text: string, opts: TtsOptions): Promise<Blob> {
  if (!opts.apiKey) {
    throw new Error('Voz: configure a chave da ElevenLabs (Configurações → Provedores).')
  }
  const voice = opts.voiceId || '21m00Tcm4TlvDq8ikWAM' // ElevenLabs default voice
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': opts.apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text, model_id: opts.modelId || 'eleven_multilingual_v2' }),
  })
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return res.blob()
}
