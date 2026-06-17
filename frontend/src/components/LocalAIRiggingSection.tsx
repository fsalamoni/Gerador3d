import { Server, Info } from 'lucide-react'

export default function LocalAIRiggingSection() {

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Server className="h-5 w-5 text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">
          IAs Locais (Ollama), Ferramentas Gratuitas & Rigging
        </h3>
      </div>

      <div className="mt-4 space-y-4 text-sm text-slate-300">
        <p>
          <strong className="text-emerald-300">A IA Ollama serve para Rigging 3D?</strong><br />
          Não. O <strong>Ollama</strong> (e modelos como LLaMA, Mistral, Gemma) são focados exclusivamente em texto e visão (LLMs e VLMs). Eles não possuem capacidade nativa de manipular ou compreender geometria 3D, calcular pesos de vértices, ou processar a hierarquia de ossos necessária para criar um esqueleto animável (Rigging).
        </p>

        <p>
          <strong className="text-emerald-300">É possível rodar IA geradora 3D localmente de graça?</strong><br />
          Sim, para <em>gerar a malha</em> (Image-to-3D). Ferramentas open-source como <strong>TripoSR</strong> ou <strong>Stable Fast 3D</strong> podem ser instaladas localmente caso você possua uma placa de vídeo potente. Você pode habilitar essas IAs na plataforma ativando o provedor <strong>"Self-hosted"</strong> e inserindo a URL do seu servidor local na página de configurações.
        </p>

        <div className="rounded-lg bg-amber-500/10 p-4 border border-amber-500/20">
          <div className="flex items-start gap-2 text-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <strong className="block text-amber-100">Alternativas para Rigging Gratuito:</strong>
              <p>
                A etapa de <strong>Rigging</strong> (criação do esqueleto) ainda carece de APIs open-source robustas que funcionem offline da mesma facilidade que o Ollama. A plataforma atualmente depende de fornecedores em nuvem (como Meshy) para automatizar isso instantaneamente.
              </p>
              <p>
                No entanto, há uma excelente alternativa gratuita:
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Baixe o arquivo <code>.glb</code> do modelo gerado na Biblioteca desta plataforma.</li>
                <li>Acesse o <strong>Mixamo</strong> (da Adobe, 100% gratuito).</li>
                <li>Faça o upload do seu modelo, marque os pontos (ombros, cotovelos, joelhos) e o Mixamo fará o auto-rig.</li>
                <li>Baixe o modelo com rig no formato <code>.fbx</code> ou <code>.vrm</code> (usando Blender para conversão final).</li>
                <li>Importe-o de volta na nossa Biblioteca via botão "Upload".</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
