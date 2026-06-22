# Roadmap de IA — Gerador3D
### Geração 3D, rigging e edição (manual + assistida por IA)

> Documento de planejamento estratégico. Segue os princípios do `CLAUDE.md`:
> criar geometria (não deformar), pesquisar repositórios abertos, citar fontes,
> humano primeiro/criaturas depois, honestidade técnica (licenças, hardware, o que
> é aproximação). Local-first (GPU baixável) sempre que possível.
> Data: 2026-06-22.

---

## 0. Onde estamos hoje (mapa do código)

**Geração 3D** — `worker-3dgen/` roda **localmente na GPU**:
- TripoSR (MIT, default, 6 GB), Hunyuan3D-2mini / 2mv (12 GB), TRELLIS (MIT, 16 GB+),
  Hunyuan3D-2.1 com PBR (24 GB). Texto→3D via texto→imagem→3D.
- Provedores cloud por BYOK (Meshy, Tripo) via Firebase Functions.

**Rigging — só FACIAL hoje:**
- `procedural-face-rig.ts`: 44 morphs ARKit gerados a partir de landmarks colocados
  pelo usuário (funciona em qualquer topologia — humano e criatura).
- `mouth-interior.ts` (cavidade+dentes+língua) e `eye-anatomy.ts` (globo+íris+pálpebras
  que fecham). `worker-rigging/` (Blender) transfere blendshapes e exporta `.vrm`.
- MediaPipe FaceLandmarker para captura ao vivo (52 blendshapes ARKit).

**Export:** GLB (completo, re-importável) + VRM (busto: 17 ossos, malha presa à cabeça).

**Lacunas principais (o que NÃO existe):**
1. Rig de **corpo/esqueleto** real e **skinning** (pesos) — VRM é só busto.
2. **Edição manual** de malha: escultura, pintura de peso, posicionamento de ossos.
3. **Edição de material/textura** (UI) e **texturização** por IA.
4. **Prior anatômico** de cabeça humana (a face hoje é 100% procedural).
5. **Anatomia por espécie** para criaturas (boca/olhos hoje assumem formato primata).
6. **Edição de blendshape**/keyframe e timeline de animação.

---

## 1. Reality-check: os provedores que você já usa

Ponto honesto e importante — **OpenRouter, Groq e ElevenLabs NÃO geram 3D nem fazem
rigging**. Eles são, respectivamente, LLM/visão, LLM rápido e áudio. Mas cada um tem
um papel **complementar e poderoso** no Gerador3D:

| Provedor | O que é | Papel real aqui | Gera 3D? |
|---|---|---|---|
| **OpenRouter** | Agregador de LLMs+visão (1 chave, muitos modelos) | Copiloto/orquestrador; foto→parâmetros; "designer de criatura" conversacional; ler foto de referência e sugerir landmarks/morphs | ❌ |
| **Groq** | Inferência LLM ultrarrápida | Mesmo papel de copiloto, porém em **tempo real** (assistente responsivo) | ❌ |
| **ElevenLabs** | TTS / voz | **Áudio→animação facial**: gerar fala e dirigir os morphs ARKit de boca/visema que já temos (lip-sync) | ❌ |
| **fal.ai / Replicate** | Agregadores de modelos generativos (pay-per-call) | **Geração 3D e texturização hospedadas** (TRELLIS, Hunyuan3D, Tripo) sem GPU local | ✅ |
| **Tripo / Meshy** | APIs dedicadas de 3D (já integradas) | Geração 3D + auto-rig hospedados | ✅ |

**Conclusão estratégica:** o núcleo (geração 3D + rigging) é **modelo local na GPU**
(você já tem a base) com **cloud opcional** (fal.ai/Replicate/Tripo/Meshy). As ferramentas
que você já assina entram como **camadas em volta**: LLM = copiloto/orquestração;
ElevenLabs = animação por voz. Vale manter as três — só não são o motor 3D.

---

## 2. Recomendações por objetivo (local-first)

Licenças verificadas no Hugging Face. ⚠️ = atenção de licença para uso comercial.

### A. 🔴 Auto-rigging de CORPO inteiro — **a maior lacuna e o maior ganho**
- **UniRig** (VAST/Tsinghua, SIGGRAPH 2025) — **MIT** ✅. Gera **esqueleto + pesos de
  skinning** para humanos, **animais, criaturas e até objetos**. É exatamente a peça que
  falta e é *creature-friendly por design*. Roda local (Blender + PyTorch).
  - HF: https://huggingface.co/VAST-AI/UniRig · Código: https://github.com/VAST-AI-Research/UniRig
- Alternativas/baselines: **Puppeteer** (2025, auto-regressivo, SOTA recente),
  **Anymate** (dataset+baseline 2025), **MagicArticulate**, **RigNet** (2020, baseline).

### B. 🟠 Humanoide "animatable" instantâneo
- **Make-It-Animatable** — **Apache-2.0** ✅ (treinado em Mixamo). Converte humanoide em
  avatar pronto para animar em segundos (pesos + bones), compatível com Mixamo.
  - HF: https://huggingface.co/jasongzy/Make-It-Animatable
- **Make-It-Poseable** (2025, mesmos autores): posar/editar pose feed-forward.

### C. 🟠 Texturização por IA (pele / PBR) — preenche "sem edição de material"
- **Hunyuan3D-Paint 2.1** (Tencent) — gera **PBR** (albedo/normal/rough/metallic) com UV,
  condicionado à malha. ⚠️ licença Tencent Community (comercial **com condições**).
  Já temos Hunyuan3D no worker → adicionar o módulo Paint é incremental.
  - HF: https://huggingface.co/tencent/Hunyuan3D-2.1
- Para **pele de rosto** especificamente: amostrar/transferir a textura do modelo de
  origem para as pálpebras/boca que geramos (resolve o "tom neutro" atual sem IA pesada).

### D. 🟡 Prior anatômico de cabeça humana real (upgrade do rosto procedural)
- **FLAME** + reconstrução monocular **EMOCA / SMIRK / MICA / DECA**: de **1 foto** →
  cabeça 3D com identidade + expressão + blendshapes corretos (inclui interior já
  anatomicamente coerente).
  - ⚠️ **ATENÇÃO DE LICENÇA: FLAME e a maioria desses derivados são *somente pesquisa*
    (não-comercial).** Ótimos para protótipo/validação, **arriscados no app pago**.
    Usar como *referência de qualidade* e para o trilho "humano", não no build comercial
    sem licença. (UniRig/TRELLIS/Make-It-Animatable são seguros p/ comércio.)
  - FLAME-Universe (índice de recursos): https://github.com/TimoBolkart/FLAME-Universe

### E. 🟢 Áudio → rosto (conecta o **ElevenLabs** ao rig que já temos)
- **NVIDIA Audio2Face-3D** — **open-source** (pesos+SDK+treino). Converte fala em
  **blendshapes ARKit** a 30 fps. Saída encaixa direto nos nossos morphs.
  - https://developer.nvidia.com/blog/nvidia-open-sources-audio2face-animation-model/
  - https://github.com/NVIDIA/Audio2Face-3D-Samples
- **NeuroSync** (transformer seq2seq áudio→blendshape, API local):
  https://huggingface.co/AnimaVR/NEUROSYNC
- Fluxo: texto → **ElevenLabs** (voz) → Audio2Face/NeuroSync → morphs ARKit → avatar fala.

### F. 🟡 Edição 3D assistida por IA (substitui trabalho manual)
- **Segmentação de partes** (selecionar "nariz/orelha" para editar): SAMPart3D / Part123 /
  SAM-3D — base para ferramentas de seleção/edição por região.
- **Edição por texto** ("deixe o nariz maior", "olhos de réptil"): linha Instant3dit /
  MagicClay / Tailor3D (pesquisa recente; maturidade variável — validar caso a caso).

### G. 🟢 Copiloto LLM (usa **OpenRouter** e/ou **Groq**)
- Orquestrar o pipeline em linguagem natural; **ler foto de referência (visão)** e propor
  landmarks/morphs; **designer conversacional de criatura** ("dragão de 4 olhos" →
  parâmetros de anatomia). Groq para latência baixa; OpenRouter para variedade/visão.
- Para **gerar imagem de referência** (texto→imagem antes do imagem→3D): provedores de
  imagem (fal.ai/Replicate) ou SDXL/FLUX local — não OpenRouter.

### Edição **manual** (sem IA) que vale construir no Studio
1. **Editor de blendshape + timeline/keyframe** (animar e exportar clipes).
2. **Pintura de peso** e **posicionamento/ajuste de ossos** (UI sobre three.js).
3. **Editor de material/PBR** (cor, metalness, roughness, mapa) no Studio.
4. **Melhorias de landmark**: espelhamento por simetria, snap à malha, multi-vista.
5. **Gizmos** de transformação (mover/rotacionar/escalar globo ocular, dentes, etc.).

---

## 3. Roadmap em fases (priorizado por impacto × risco × licença)

**Fase 1 — Ganhos altos, risco baixo, licença limpa**
1. **UniRig (MIT)** no `worker-rigging`: auto-esqueleto + skinning de **corpo** → fecha a
   maior lacuna e já atende criaturas. Export VRM/GLB com rig real (não mais busto).
2. **Audio2Face/NeuroSync + ElevenLabs**: avatar que fala (aproveita rig de boca atual).
3. **Copiloto LLM (OpenRouter/Groq)**: foto→landmarks e orquestração — acelera o manual.

**Fase 2 — Qualidade visual e edição**
4. **Hunyuan3D-Paint** (texturização PBR) + **amostragem de pele** para pálpebras/boca.
5. **Editor de material/PBR** e **editor de blendshape + timeline** no Studio.
6. **TRELLIS** como caminho de geração de maior qualidade (instalador 1-clique no worker).

**Fase 3 — Edição avançada e criaturas**
7. **Segmentação de partes (SAMPart3D)** + **edição por texto** assistida por IA.
8. **Anatomia por espécie** (olhos grandes, pupila fenda, focinho) para criaturas.
9. **Pintura de peso / ajuste de ossos** manual (UI).

---

## 4. Hardware, custos e licenças (resumo honesto)

- **VRAM**: TripoSR 6 GB · TRELLIS/InstantMesh 16 GB · Hunyuan3D-2.1 24 GB ·
  UniRig roda em GPU modesta (é transformer de esqueleto, não difusão pesada).
- **Como "contratar" cada caminho:**
  - **Modelos locais (HF):** baixar pesos (grátis), aceitar licença/gate, rodar na GPU.
    É o default do projeto e o que você prefere.
  - **fal.ai / Replicate:** criar conta, **API key**, paga por chamada (TRELLIS ~US$0,02;
    Tripo imagem→3D ~US$0,2–0,4). Bom para quem não tem GPU.
  - **Tripo / Meshy:** **API key** + créditos (já integrados ao app por BYOK).
  - **OpenRouter / Groq:** **API key** única, paga por token (Groq tem free tier).
  - **ElevenLabs:** **API key** + assinatura/créditos de voz.
  - **NVIDIA Audio2Face:** pesos abertos via NGC/GitHub (local) ou microserviço NIM.
- **Licenças (crítico):** UniRig **MIT** ✅, TRELLIS **MIT** ✅, Make-It-Animatable
  **Apache** ✅. Hunyuan3D **Tencent Community** ⚠️ (comercial com condições).
  **FLAME/EMOCA/DECA/MICA ⚠️ não-comercial** — usar só como referência no trilho humano.

---

## 5. Próximo passo recomendado

Maior alavanca isolada = **UniRig (MIT) no worker de rigging** — entrega rig de **corpo**
real e já cobre criaturas, sem risco de licença. Segundos lugares: **ElevenLabs→Audio2Face**
(avatar falante reaproveitando a boca atual) e **copiloto LLM** (foto→landmarks).

Sugestão de execução cautelosa (princípios do projeto): integrar UniRig atrás de uma flag,
em ambiente isolado, com teste de fumaça (esqueleto válido, sem NaN, pesos somando 1) e
`npm run build` antes de entregar — mantendo o procedural atual como fallback.

---

## Fontes
- TRELLIS (MIT): https://huggingface.co/microsoft/TRELLIS-image-large · arXiv 2412.01506
- Hunyuan3D-2.1 (PBR, Tencent): https://huggingface.co/tencent/Hunyuan3D-2.1 · arXiv 2506.15442
- Stable Fast 3D: https://huggingface.co/stabilityai/stable-fast-3d
- UniRig (MIT): https://huggingface.co/VAST-AI/UniRig · https://github.com/VAST-AI-Research/UniRig · arXiv 2504.12451
- Puppeteer: https://hf.co/papers/2508.10898 · Anymate: https://hf.co/papers/2505.06227 · MagicArticulate: arXiv 2502.12135
- Make-It-Animatable (Apache): https://huggingface.co/jasongzy/Make-It-Animatable · arXiv 2411.18197
- FLAME-Universe (EMOCA/DECA/MICA/SMIRK): https://github.com/TimoBolkart/FLAME-Universe
- NVIDIA Audio2Face-3D (open): https://github.com/NVIDIA/Audio2Face-3D-Samples · arXiv 2508.16401
- NeuroSync: https://huggingface.co/AnimaVR/NEUROSYNC
- Panorama 2026 de geração 3D: https://www.3daistudio.com/state-of-ai-3d-generation-2026
