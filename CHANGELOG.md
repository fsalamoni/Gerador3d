# Changelog

Datas no formato AAAA-MM-DD. "Funciona sem ligar nada" = não precisa de GPU nem chave.

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
