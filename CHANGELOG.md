# Changelog

Datas no formato AAAA-MM-DD. "Funciona sem ligar nada" = não precisa de GPU nem chave.

## 0.5.3 — 2026-06-24 (instalação gravável + robustez de app/web)

A correção que faltava + 5ª auditoria (áreas web/app antes não cobertas):
- **Instalação em pasta GRAVÁVEL (%APPDATA%):** pacotes Python e modelos não vão mais
  para `resources/` (somente-leitura em Program Files). Resolve "Instalar Geração 3D
  falha para usuário comum" E "reinstalar após atualizar" (pylibs/repos persistem entre
  versões). Retrocompatível: instalações existentes continuam detectadas.
- **Tela branca total evitada:** adicionado *error boundary* — o erro de uma tela não
  derruba o app inteiro; chunk velho após atualização recarrega sozinho.
- **Geração sem feedback:** "Gerar" agora mostra **erro claro** se falhar (chave/worker)
  em vez de só re-habilitar o botão silenciosamente.
- **Polling infinito:** job travado no servidor não faz mais o navegador consultar para
  sempre (limite de 10 min); o proxy marca como falho quando o worker "concluiu" sem arquivo.
- **Vazamento de câmera no OBS:** corrida ao desmontar a tela durante o start agora libera
  a webcam (luz não fica acesa).
- **Onboarding** não prende mais o usuário se o save falhar; chaves i18n da Biblioteca
  faltantes adicionadas (en/pt-BR).

## 0.5.2 — 2026-06-24 (varredura profunda: 4 auditorias paralelas)

Quatro auditorias adversariais (geração, rig/anatomia, estúdio/memória, shell/pacote).
Bom: os medos centrais foram verificados como CORRETOS — olhos fecham, mandíbula abre,
dentes/língua aparecem. As correções foram em robustez, vazamentos e geração:

Estúdio / memória:
- Vazamento de GPU a cada troca de modelo (geometrias/materiais/texturas + VRM agora
  são descartados); marcadores descartados; listener de perda de contexto WebGL.
- VRM: pose de cabeça/pescoço agora aplicada em UM lugar (corrigido o tremor de pose
  dupla); sem alocações por frame.
- Webcam: guarda de re-entrância (não abre 2 streams/loops); blob da .vrm enviada é liberado.

Rig / anatomia:
- Rejeita frame degenerado (olhos/boca coincidentes/colineares) com erro claro.
- Dentes recuados para não atravessar lábios finos.

Geração:
- "Lixo silencioso" eliminado: malha vazia/NaN agora vira erro claro em vez de um GLB
  vazio marcado como sucesso (TripoSR e Hunyuan).
- Multi-view do Hunyuan: 1 imagem é embrulhada como {front} (não quebra); fallback
  preserva o dict de vistas. Corrigido o fallback de extract_mesh do TripoSR.
- Robustez: watchdog mata processos (pip/Blender) travados; um job de geração por vez
  (sem disputa de GPU); auto-reparo não roda junto com um provisionamento (sem corromper
  o ambiente); upload sem nome de arquivo não dá mais 500; run_rig com timeout.

### Conhecidas/abertas (honesto — exigem trabalho dedicado e validação na sua máquina)
- **Instalação em pasta somente-leitura:** se o app for instalado em Program Files, a
  instalação da geração pode falhar para usuário comum (grava em resources/). A correção
  (instalar em %APPDATA%, que também resolve "reinstalar após atualizar") é uma mudança de
  motor que farei isoladamente, com validação, para não quebrar a geração existente.
- **Orientação +Z:** auto-estimativa de pontos assume frente = +Z; modelos virados (ex.: VRoid)
  riggam no lugar errado — use "Só estimar pontos" e ajuste, ou marque manual.
- **text→3D** depende de diffusers, incompatível com o conjunto travado do TripoSR (image→3D
  não é afetado).

## 0.5.1 — 2026-06-24 (varredura: correções de bugs do pipeline)

Auditoria adversarial do pipeline da v0.5.0 + correções verificadas:
- **[crítico] VRM com a cabeça deslocada:** as matrizes de bind do esqueleto eram
  calculadas como identidade (faltava atualizar as matrizes do mundo antes de criar o
  Skeleton) — o rosto exportado "voava" para fora do corpo. Corrigido; teste prova
  que a pose de repouso fica correta (`boneMatrixWorld × boneInverse = identidade`).
- **Export "assava" o preview:** se um botão de teste estivesse ativo, o VRM saía com a
  expressão congelada. Agora todo export (rosto + anatomia) é zerado para a pose neutra.
- **Malha densa travava o navegador:** o rig de 1 clique numa malha muito densa
  (Hunyuan pode gerar centenas de milhares de vértices) podia congelar/estourar a aba.
  Agora há salvaguarda com erro claro (acima de 200 mil vértices: gere com qualidade
  menor ou simplifique).
- **Auto-Hunyuan respeitando a escolha:** a promoção TripoSR→Hunyuan só ocorre quando
  NÃO há escolha explícita no pedido (corrige a config antiga salva em TripoSR sem
  ignorar quem escolhe TripoSR de propósito).
- exportObj agora fatia o buffer corretamente.
- Limitação honesta ainda aberta: a auto-estimativa de pontos assume a frente = +Z;
  se o gerador entregar o modelo virado, o rig automático pode cair no lugar errado —
  use "Só estimar pontos" e ajuste, ou marque manualmente.

## 0.5.0 — 2026-06-23 (pipeline completo: gerar → riggar → exportar em todos os formatos)

Foco: o objetivo ponta-a-ponta — gerar o personagem 3D, com rosto detalhado
(boca/dentes/língua, olhos, sobrancelha/nariz), expressões completas e rig, e
exportar em todos os formatos.

- **Geração com qualidade por padrão:** se o Hunyuan3D-2mini está instalado, ele
  passa a ser o backend padrão (geometria muito superior ao TripoSR), e qualquer job
  ainda em TripoSR é promovido para Hunyuan automaticamente (TripoSR continua de
  fallback). Desative com `GR3D_NO_AUTO_HUNYUAN=1`.
- **Rig em 1 clique:** botão **"Riggar tudo automaticamente"** — estima os pontos e
  cria, de uma vez, as 44 expressões ARKit + interior da boca (dentes/língua) + olhos
  que fecham. A anatomia passa a vir ligada por padrão.
- **Exportar em TODOS os formatos:**
  - **.glb** — completo (rosto + dentes/língua/olhos + 44 morphs).
  - **.vrm** — AGORA também leva a anatomia (dentes/língua/olhos); os binds de
    expressão acionam rosto + anatomia juntos (VSeeFace/VTube Studio).
  - **.obj** e **.usdz** — malha estática completa (sem rig), no navegador.
  - **.fbx** — via o Blender embutido (desktop): GLB → FBX (Unreal/Maya/Blender).
- Verificado: smoke test do export (VRM com 15 malhas + binds em rosto+dentes+língua,
  blink em rosto+pálpebras, OBJ com vértices) + build + py_compile + testes do worker.
- Honestidade: a conversão FBX (Blender) e a qualidade final do Hunyuan só dá para
  confirmar na sua GPU/Windows. OBJ/USDZ são malha estática (sem morphs, por formato).

## 0.4.4 — 2026-06-23 (qualidade da geração 3D: fim do modelo "achatado")

- **Geração 3D saía achatada/disforme** (uma "laje" com a foto colada). Causa: a
  remoção de fundo (rembg) falhava em silêncio e o TripoSR reconstruía a imagem
  INTEIRA (com fundo) como um relevo plano. Correções:
  - o modelo de remoção de fundo (rembg/u2net) agora é **pré-baixado** no
    provisionamento e cacheado numa pasta **persistente** (U2NET_HOME em APPDATA);
  - a sessão do rembg é reaproveitada;
  - se a remoção de fundo falhar, o app agora **avisa com erro claro** (em vez de
    entregar um modelo achatado silenciosamente).
- Para muito mais qualidade de geometria, instale e selecione **Hunyuan3D-2mini**
  (Configuração) — recomendado para a sua GPU.

## 0.4.3 — 2026-06-23 (boca que abre de verdade + Configuração clara)

- **Boca abre de verdade (não deforma):** o `jawOpen` agora ROTACIONA a mandíbula
  inferior numa dobradiça atrás da cabeça — a boca abre e revela o interior
  (dentes/cavidade/língua), em vez de esticar o queixo. Lábio superior fica parado;
  nada acima dos olhos se mexe. Ângulo limitado (≤34°).
- **Sem exagero:** queixo (jawForward/Left/Right) ~40% menor; `tongueOut` da superfície
  virou um leve indício; a língua interior parou de virar um "slab" gigante (D*1.7→D*0.8).
- **Pescoço:** o VRM agora move cabeça + pescoço conforme sua pose (antes só expressões).
- **Geração 3D:** corrige `TSR.extract_mesh() missing ... 'has_vertex_color'` (duas APIs do TripoSR).
- **Configuração refeita:** seções separadas com o que está instalado (✓) e o que falta,
  ordem de instalação (1) Geração 3D → 2) Hunyuan opcional), e botões idempotentes
  (“já instalado fica salvo; só reinstale se der erro”).
- **Chaves de IA (voz/copiloto):** nova seção em Configuração para colar as chaves de
  ElevenLabs e OpenRouter/Groq (antes não havia lugar para isso).

### Limitação honesta (ainda em aberto)
- Os pacotes pip (PyTorch etc.) instalam dentro da pasta do app, que é trocada ao
  atualizar — então hoje pode ser preciso reinstalar a geração após atualizar. A
  correção (instalar num local persistente) é uma mudança de motor que farei com
  cuidado/validação para não quebrar a geração.

## 0.4.2 — 2026-06-23 (correções de geração + GPU nova + UI)

- **Geração falhava** (`cannot import name 'split_torch_state_dict_into_shards' from
  'huggingface_hub'`): conflito real — TripoSR exige `transformers 4.35`, mas instalar
  o Hunyuan3D sobe o `transformers` p/ uma versão que exige `huggingface_hub` novo,
  deixando o ambiente skewed. O auto-reparo antigo não conseguia rebaixar (o pip
  recusava por conflito). Agora o trio (`transformers/huggingface_hub/tokenizers`) é
  fixado com `--force-reinstall --no-deps` (snap-back determinístico) no reparo
  automático, na instalação e na reafirmação pós-Hunyuan. Se o Hunyuan não rodar, cai
  para o TripoSR automaticamente.
- **GPUs novas (RTX 50xx / Blackwell):** PyTorch passa a usar wheels **cu128** (têm
  kernel sm_120). O cu121 dava "no kernel image" nessas placas. ⚠️ Após atualizar,
  clique **"Reinstalar geração 3D"** uma vez para baixar o PyTorch compatível.
- **UI/textos corrigidos:** o app não tem página "Configurações → Provedores" no
  desktop. O status das ligações e o guia agora apontam o caminho real do painel de
  rosto: **Estúdio → abrir um modelo → "Configurar expressões faciais"** (chaves de
  voz/copiloto são inline no próprio painel). Aviso sobre TripoSR × Hunyuan.

## 0.4.1 — 2026-06-23 (hotfix)

- **Correção crítica de inicialização:** o app desktop não subia (`O motor local não
  iniciou` → `ModuleNotFoundError: No module named 'unirig'`). O motor empacotado
  carrega o `worker-rigging/main.py` por caminho (importlib `exec_module`), o que
  **não** coloca o diretório no `sys.path`; o `import unirig` falhava e derrubava o
  motor. Agora o diretório é garantido no `sys.path` e o import é tolerante a ausência
  (o app sobe normalmente mesmo sem o UniRig, que é opcional e exige GPU).

## 0.4.0 — 2026-06-23

### Funciona sem ligar nada (geometria/UI, testado aqui)
- **Anatomia de criatura (presets):** humano, felino, réptil/dragão, lobo e
  "olhos grandes (anime)". Pupila redonda ou em **fenda** (vertical/horizontal),
  tamanho do globo, **presas** que seguem o `jawOpen`. Seletor no painel *Mapear rosto*.
- **Cabelo procedural:** calota que acompanha o crânio (aproximação de volume, não
  fios), com cor e cobertura; exporta junto no GLB.
- **Editor de material/PBR:** cor base, brilho, metálico e cores de cabelo/íris,
  ao vivo no Studio; salvo no GLB exportado.
- **Status das ligações:** card na *Configuração* (web e desktop) mostrando o que já
  funciona e o estado de cada ligação opcional. Espelha `docs/LIGACOES.md`.
- **Lip-sync por áudio:** no painel *Mapear rosto*, "Áudio de um arquivo" move a boca
  pelo volume — sem chave.

### Estruturado / atrás de ligação (código pronto + smoke test)
- **UniRig (esqueleto de corpo):** adaptador no worker de rigging atrás de
  `method=unirig` (humanos/animais/criaturas, MIT). Exige GPU + repositório clonado.
- **Voz (ElevenLabs):** "Falar um texto" → voz → boca, atrás da chave (localStorage).
  Upgrade futuro: Audio2Face/NeuroSync para precisão por fonema.
- **Copiloto de IA (foto→pontos):** "Sugerir pontos por foto" usa um LLM de visão
  (OpenRouter/Groq) e **gruda os pontos na superfície** (raycast). Precisa de chave.

### Notas honestas
- Cabelo é aproximação (volume, não fios). Texturas PBR realistas e UniRig dependem de
  **GPU**; voz realista e copiloto dependem de **chave** — passo a passo em `docs/LIGACOES.md`.
- O bump de versão **não publica** nada: o release desktop só dispara em push na `main`
  (ou tag `desktop-v*`), sob autorização do dono.
