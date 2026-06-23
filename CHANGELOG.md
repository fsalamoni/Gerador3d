# Changelog

Datas no formato AAAA-MM-DD. "Funciona sem ligar nada" = não precisa de GPU nem chave.

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
