/**
 * SetupPage (app local) — central de configuração DENTRO do app.
 *
 * Mostra o status do Rigging (Blender) e da Geração 3D (PyTorch/TripoSR) e
 * permite INSTALAR cada parte por dentro do app (chama o motor local, que roda
 * as instalações e devolve o progresso ao vivo). Também traz o passo a passo.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wrench, Bone, Sparkles, CheckCircle2, XCircle, Loader2, Download,
  ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react'
import { IS_LOCAL } from '../lib/runtime'
import {
  localDiagnostics, localProvision, localProvisionStatus,
  localGetConfig, localSetBackend,
  type LocalDiagnostics, type ProvisionStatus,
} from '../lib/local-api'

const BACKEND_LABELS: Record<string, string> = {
  triposr: 'TripoSR',
  'hunyuan-mini': 'Hunyuan3D-2mini',
  hunyuan: 'Hunyuan3D-2.1',
  trellis: 'TRELLIS',
}

function Dot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
    : <XCircle className="h-4 w-4 text-slate-500" />
}

export default function SetupPage() {
  const [diag, setDiag] = useState<LocalDiagnostics | null>(null)
  const [prov, setProv] = useState<ProvisionStatus | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backend, setBackend] = useState<string>('')
  const [backends, setBackends] = useState<string[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  const refreshDiag = () => { void localDiagnostics().then(setDiag).catch(() => {}) }

  useEffect(() => {
    if (!IS_LOCAL) return
    void localGetConfig().then((c) => { setBackend(c.backend); setBackends(c.backends) }).catch(() => {})
    refreshDiag()
    // Poll do status de instalação (e re-checa o diagnóstico quando termina).
    let lastActive = false
    const timer = setInterval(() => {
      void localProvisionStatus().then((s) => {
        setProv(s)
        if (lastActive && !s.active) refreshDiag() // acabou de terminar
        lastActive = s.active
      }).catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [prov?.log])

  async function install(target: 'generation' | 'hunyuan' | 'blender') {
    setError(null)
    try {
      await localProvision(target)
      setProv({ active: true, target, progress: 0, done: false, ok: false, error: null, log: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar a instalação.')
    }
  }

  if (!IS_LOCAL) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-slate-400">
        Esta página é exclusiva do aplicativo local (desktop).
      </div>
    )
  }

  const busy = Boolean(prov?.active)
  const rig = diag?.rigging
  const gen = diag?.generation
  const catalog = gen?.catalog
  const recommended = gen?.recommendedBackend
  const vram = gen?.vramGb ?? 0
  const recommendedLabel = recommended
    ? (catalog?.[recommended]?.label ?? BACKEND_LABELS[recommended] ?? recommended)
    : ''

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/15">
          <Wrench className="h-6 w-6 text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Configuração</h1>
          <p className="text-sm text-slate-400">
            Tudo roda no seu PC. Instale os recursos abaixo direto por aqui.
          </p>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* RIGGING */}
      <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bone className="mt-0.5 h-5 w-5 text-brand-300" />
            <div>
              <h2 className="font-semibold text-white">Rigging facial (Blender)</h2>
              <p className="mt-1 text-sm text-slate-400">
                Cria as 52 expressões ARKit no seu modelo e exporta o avatar `.vrm`.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
                <span className="flex items-center gap-1.5"><Dot ok={!!rig?.blender} /> Blender</span>
                <span className="flex items-center gap-1.5"><Dot ok={!!rig?.template} /> Template facial</span>
              </div>
            </div>
          </div>
          <StatusBadge ready={!!rig?.ready} />
        </div>
        {!rig?.ready && (
          <button
            disabled={busy}
            onClick={() => install('blender')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Instalar Blender + recursos
          </button>
        )}
      </section>

      {/* GERAÇÃO 3D */}
      <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-brand-300" />
            <div>
              <h2 className="font-semibold text-white">Geração 3D por IA (texto/imagem → 3D)</h2>
              <p className="mt-1 text-sm text-slate-400">
                Roda modelos open-source (TripoSR) na sua GPU. Requer placa NVIDIA.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
                <span className="flex items-center gap-1.5"><Dot ok={!!gen?.torch} /> PyTorch</span>
                <span className="flex items-center gap-1.5"><Dot ok={!!gen?.cuda} /> GPU/CUDA</span>
                <span className="flex items-center gap-1.5"><Dot ok={!!gen?.triposr} /> TripoSR</span>
              </div>
              {gen?.cuda && gen?.gpu && (
                <p className="mt-2 text-[11px] text-slate-400">
                  GPU detectada: <span className="text-slate-200">{gen.gpu}</span>
                  {gen.vramGb ? <> · <span className="text-slate-200">{gen.vramGb} GB</span> de VRAM</> : null}
                  {recommendedLabel && (
                    <> · recomendado: <span className="text-brand-200">{recommendedLabel}</span></>
                  )}
                </p>
              )}
            </div>
          </div>
          <StatusBadge ready={!!gen?.ready} />
        </div>
        {backends.length > 1 && (
          <div className="mt-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Modelo de geração
            </label>
            <div className="flex flex-wrap gap-2">
              {backends.map((b) => {
                const info = catalog?.[b]
                const label = info?.label ?? BACKEND_LABELS[b] ?? b
                const isRec = b === recommended
                const tooHeavy = !!info && vram > 0 && info.minVramGb > vram
                return (
                  <button
                    key={b}
                    onClick={() => { void localSetBackend(b).then(() => setBackend(b)) }}
                    title={info ? `${info.note} (mín. ${info.minVramGb} GB${info.texture ? ' · textura PBR' : ''})` : undefined}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      backend === b
                        ? 'border-brand-500/50 bg-brand-600/15 text-brand-100'
                        : 'border-white/10 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    {label}
                    {info?.texture && <span className="text-[9px] text-fuchsia-300">PBR</span>}
                    {info && info.installable === false && <span className="rounded bg-slate-500/20 px-1 text-[9px] text-slate-300">manual</span>}
                    {isRec && <span className="rounded bg-brand-500/20 px-1 text-[9px] text-brand-200">recomendado</span>}
                    {tooHeavy && <span className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-300">{info!.minVramGb}GB+</span>}
                  </button>
                )
              })}
            </div>
            {catalog?.[backend] && (
              <p className="mt-2 text-[11px] text-slate-500">
                {catalog[backend].note} Requer ~{catalog[backend].minVramGb} GB de VRAM
                {catalog[backend].texture ? ' e gera textura PBR.' : '.'}
                {vram > 0 && catalog[backend].minVramGb > vram &&
                  ' Sua GPU pode não ter VRAM suficiente — se falhar, o app cai para o TripoSR.'}
              </p>
            )}
          </div>
        )}
        <button
          disabled={busy}
          onClick={() => install('generation')}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {gen?.ready ? 'Reinstalar geração 3D' : 'Instalar geração 3D na minha GPU'}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Baixa ~2,5 GB (PyTorch) + o modelo. Pode levar vários minutos.
        </p>

        {/* Upgrade de qualidade: Hunyuan3D-2mini (geometria PBR) */}
        {gen?.torch && (
          <div className="mt-4 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-fuchsia-100">
                  <Sparkles className="h-4 w-4" /> Upgrade: Hunyuan3D-2mini
                  {vram >= 12 && <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] text-brand-200">recomendado p/ sua GPU</span>}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Geometria de altíssima fidelidade (muito acima do TripoSR). Precisa de ~12 GB de VRAM.
                  {vram > 0 && vram < 12 && ' Sua GPU pode não ter VRAM suficiente.'}
                </p>
              </div>
              <Dot ok={!!gen?.hunyuan} />
            </div>
            <button
              disabled={busy}
              onClick={() => install('hunyuan')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-600/15 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-600/25 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {gen?.hunyuan ? 'Reinstalar Hunyuan3D-2mini' : 'Instalar Hunyuan3D-2mini'}
            </button>
          </div>
        )}
      </section>

      {/* PROGRESSO AO VIVO */}
      {prov && (prov.active || prov.done) && (
        <section className="mb-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm">
            {prov.active
              ? <><Loader2 className="h-4 w-4 animate-spin text-brand-300" /> Instalando ({prov.target})… {prov.progress}%</>
              : prov.ok
                ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Concluído!</>
                : <><XCircle className="h-4 w-4 text-red-400" /> Falhou{prov.error ? `: ${prov.error}` : ''}</>}
          </div>
          {prov.active && (
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${prov.progress}%` }} />
            </div>
          )}
          {prov.log?.length > 0 && (
            <pre ref={logRef} className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-slate-400">
              {prov.log.join('\n')}
            </pre>
          )}
        </section>
      )}

      {/* PASSO A PASSO */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <button
          onClick={() => setHelpOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-white"
        >
          <span>Passo a passo e programas necessários</span>
          {helpOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {helpOpen && (
          <div className="space-y-3 border-t border-white/10 px-5 py-4 text-sm text-slate-300">
            <p><b className="text-white">Rigging</b> já vem pronto no instalador (Blender embutido). Se aparecer faltando, clique em <i>Instalar Blender + recursos</i> acima.</p>
            <p><b className="text-white">Geração 3D</b> precisa de uma <b>GPU NVIDIA</b>. Para o melhor resultado, instale antes:</p>
            <ul className="list-disc space-y-1 pl-5 text-slate-400">
              <li>Driver NVIDIA atualizado — <Ext href="https://www.nvidia.com/Download/index.aspx">nvidia.com/Download</Ext></li>
              <li>Microsoft C++ Build Tools (marque “Desktop development with C++”) — <Ext href="https://visualstudio.microsoft.com/visual-cpp-build-tools/">visualstudio.com/visual-cpp-build-tools</Ext></li>
            </ul>
            <p>Depois, clique em <i>Instalar geração 3D</i> acima — o app baixa e instala o PyTorch e o TripoSR sozinho, mostrando o progresso. Na 1ª geração, os pesos do modelo são baixados (uma vez).</p>
            <p className="text-slate-400">Pronto isso, vá em <Link to="/app/generate" className="text-brand-300 underline">Gerar</Link> (texto/imagem → 3D) ou em <Link to="/app/library" className="text-brand-300 underline">Biblioteca</Link> (enviar um modelo e <i>Preparar Rig</i>).</p>
          </div>
        )}
      </section>
    </div>
  )
}

function StatusBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" /> Pronto
    </span>
  ) : (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
      Pendente
    </span>
  )
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="inline-flex items-center gap-1 text-brand-300 underline">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  )
}
