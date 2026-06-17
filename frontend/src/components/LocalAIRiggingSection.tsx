import { Server, Info, Cpu, Code2 } from 'lucide-react'

export default function LocalAIRiggingSection() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <Server className="h-5 w-5 text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">
          Inteligência Artificial Local e Auto-Rigging Facial Nativo
        </h3>
      </div>

      <div className="mt-4 space-y-6 text-sm text-slate-300">
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 font-semibold text-emerald-300">
            <Cpu className="h-4 w-4" />
            NVIDIA Omniverse & Audio2Face
          </h4>
          <p>
            A <strong>NVIDIA</strong> possui a ferramenta definitiva para isso: o <strong>Audio2Face (A2F)</strong>. O A2F possui uma feature chamada <em>"Character Transfer"</em> que pega um rosto 3D estático e usa IA para gerar automaticamente os 52 Blendshapes (expressões ARKit) necessários para o tracking de câmera. 
            Ele possui APIs Headless e gRPC para automação. <strong>No entanto</strong>, ele não pode rodar em Cloud Functions ou navegadores. Ele exige um servidor dedicado ou máquina virtual com <strong>GPUs NVIDIA RTX</strong> (ex: AWS G4dn) rodando os contêineres proprietários do Omniverse.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="flex items-center gap-2 font-semibold text-emerald-300">
            <Code2 className="h-4 w-4" />
            E o Ollama?
          </h4>
          <p>
            IAs baseadas no <strong>Ollama</strong> (LLaMA, Mistral) são focadas em Linguagem e Visão (texto e pixels 2D). Elas não processam geometria 3D, vértices ou topologia. Portanto, o Ollama não é capaz de realizar Rigging de forma alguma.
          </p>
        </div>

        <div className="rounded-lg bg-emerald-500/10 p-4 border border-emerald-500/20">
          <div className="flex items-start gap-3 text-emerald-200">
            <Info className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-3">
              <strong className="block text-emerald-100 text-base">A Solução Ideal para a Plataforma (Serverless):</strong>
              <p>
                Para ter o Rigging Facial de forma 100% nativa e proprietária sem os altos custos de GPUs da NVIDIA, a solução da indústria open-source é construir um <strong>Worker Python</strong> rodando <strong>Blender Headless</strong> (`bpy`).
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Você cria um servidor Docker com Python e Blender que pode ser hospedado de forma barata no Google Cloud Run.</li>
                <li>Quando a plataforma envia o modelo gerado para este servidor, um script Python alinha um rosto "Template" (que já possui as expressões ARKit) ao novo rosto gerado.</li>
                <li>Através de uma técnica matemática chamada <strong>Deformation Transfer</strong>, o servidor projeta as expressões para o seu modelo e devolve o `.vrm` finalizado.</li>
              </ul>
              <p className="mt-2 text-xs italic text-emerald-400">
                Se você decidir hospedar o Omniverse da NVIDIA ou um servidor Python customizado, você pode configurar a URL de despacho na seção de Provedores ("Self-hosted").
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
