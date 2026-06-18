# Gerador3D — Guia do Projeto

## O que é
Plataforma web completa para criar, importar, visualizar, fazer rigging e animar avatares 3D com face tracking via webcam. Feita para RPG em mesas virtuais (VTT) via OBS.

## Stack
- **Frontend:** React 18 + Vite + TypeScript + TailwindCSS + Three.js
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions v2 Node 22, Hosting)
- **Worker de Rigging:** Python (FastAPI) + Blender Headless (roda local com GPU)
- **CI/CD:** GitHub Actions → Firebase Hosting

## Estrutura de Pastas
```
Gerador3d/
├── frontend/               # App React (SPA)
│   ├── src/
│   │   ├── components/     # AvatarCanvas, ModelViewer, AppLayout, etc
│   │   ├── contexts/       # AuthContext (Firebase Auth)
│   │   ├── hooks/          # useFaceTracking (MediaPipe)
│   │   ├── i18n/           # PT-BR + EN (i18next)
│   │   ├── lib/            # Lógica central (firebase, jobs-store, providers, etc)
│   │   └── pages/          # GeneratePage, LibraryPage, StudioPage, AdminPage, etc
│   └── dist/               # Build de produção
├── functions/              # Cloud Functions v2 (Node.js + TypeScript)
│   └── src/
│       ├── index.ts        # generate3d + pollJob3d (callables)
│       ├── meshy.ts        # Provider Meshy dialect
│       ├── storage.ts      # Persistência de assets no Storage
│       └── stats.ts        # Contadores de plataforma
├── worker-rigging/         # Worker Python local para rigging facial
│   ├── main.py             # Servidor FastAPI (porta 8000)
│   ├── rig_script.py       # Script do Blender (bpy) — transfer de blendshapes
│   ├── make_template.py    # Gera template_face.glb (52 shape keys ARKit)
│   ├── install_vrm_addon.py# Instala o VRM Add-on no Blender (automatico)
│   ├── tunnel.py           # Tunel publico (cloudflared sem conta / ngrok)
│   ├── setup.bat           # Setup automatico (uma vez)
│   └── start.bat           # Um clique para iniciar tudo
├── worker-3dgen/           # Worker Python local de GERACAO 3D (open-source)
│   ├── main.py             # Servidor FastAPI (porta 8001)
│   └── backends.py         # Adaptadores: TripoSR / TRELLIS / Hunyuan3D
├── worker-gateway/         # Gateway local: 1 URL serve rigging + geracao
│   ├── gateway.py          # FastAPI (porta 8080) -> 8000 e 8001
│   └── start_all.bat       # Sobe tudo (workers + gateway + tunel)
├── desktop/                # App de PC 100% LOCAL (Electron) — sem nuvem/tunel
│   ├── main.js             # Electron: sobe o motor e mostra a UI
│   └── local_server.py     # Motor local (SPA + jobs + rigging + geracao)
├── firebase.json           # Config de deploy do Firebase
├── firestore.rules         # Regras de segurança do Firestore
├── firestore.indexes.json  # Índices do Firestore
├── storage.rules           # Regras de segurança do Storage
└── .github/workflows/      # CI/CD
```

## Banco de Dados (Firestore)
- **Banco dedicado:** `gerador3d` (isolado de outras plataformas no projeto `antonov-82411`)
- **Coleções principais:**
  - `users/{uid}/jobs/{jobId}` — Jobs de geração 3D
  - `users/{uid}/settings/preferences` — API keys, provider settings, model catalog
  - `platform/stats` — Agregados para Admin Panel

## Firebase Storage
- **Namespace:** `antonov3d/users/{uid}` — Uploads, modelos gerados, assets de rigging
- **CORS:** Permitido para todas as origens (GET)
- **Regras:** Usuário autenticado lê/escreve apenas na sua pasta

## Cloud Functions
- **generate3d** — Cria job, despacha para provider (Meshy ou Worker local)
- **pollJob3d** — Consulta status do job (provider ou Worker)
- **Região:** us-central1 | **Runtime:** Node 22 (2nd Gen)

## Provedores de IA 3D
- **Meshy** (BYOK) — texto→3D, imagem→3D, texturização, rigging
- **Tripo** — texto→3D, imagem→3D
- **Rodin (Hyper3D)** — texto→3D, imagem→3D
- **Hunyuan3D (Tencent)** — texto→3D, imagem→3D
- **Self-hosted** — servidor local (TripoSR, SF3D) ou Worker de Rigging

## Worker de Rigging Local
- Servidor Python na porta 8000
- Recebe GLB via API REST → processa com Blender → retorna VRM
- Pipeline real em `rig_script.py`: transfere os 52 blendshapes ARKit de um
  template facial para a malha do usuário (Surface Deform / Deformation
  Transfer), cria o esqueleto humanoide e exporta `.vrm` (VRM Add-on).
- Precisa de um `template_face.glb` (52 shape keys ARKit) na pasta do worker —
  ver `worker-rigging/README.md`.
- Exposto via ngrok para a Cloud Function alcançar
- `start.bat` inicia tudo automaticamente

## URLs Importantes
- **Produção:** https://antonov3d.web.app
- **Firebase Console:** https://console.firebase.google.com/project/antonov-82411
- **GitHub:** https://github.com/fsalamoni/Gerador3d

## Comandos Úteis
```bash
# Dev local
cd frontend && npm run dev

# Build + Deploy
cd frontend && npm run build
npx firebase-tools deploy --project antonov-82411

# Worker
cd worker-rigging && python main.py
```

## O que falta implementar
1. ~~Script real de rigging facial no `rig_script.py`~~ ✅ implementado
   (Surface Deform / Deformation Transfer + export VRM). Requer o template
   facial `template_face.glb` e o VRM Add-on no Blender.
2. Integração com provedores além do Meshy: ✅ **Tripo** (texto→3D e imagem→3D)
   no proxy; ✅ **geração 3D própria open-source** via `worker-3dgen` (TripoSR/
   TRELLIS/Hunyuan, sem depender de API paga). Faltam Rodin e Hunyuan como APIs
   hospedadas (assinatura própria).
3. Interface de edição de VRM no Estúdio
4. Testes automatizados (parcial: lógica do Worker + gerador de template cobertos)
5. ~~Suporte a VRM para exportação final~~ ✅ pipeline do Worker exporta `.vrm`

## Versão Desktop (alternativa 100% local)
- `desktop/` é um app Electron que roda **tudo offline**: UI + jobs + rigging +
  geração, sem Firebase, sem túnel, sem login. O frontend é compilado com
  `VITE_LOCAL=true` e fala REST com `desktop/local_server.py` (porta 8765).
- Build do instalador: `desktop/build.bat`. Dev: `desktop/dev.bat`.
- Os branches de modo local no frontend ficam atrás de `IS_LOCAL`
  (`frontend/src/lib/runtime.ts`), então a versão cloud não é afetada.

## Notas de arquitetura (importante)
- O cliente **precisa** acionar `pollJob3d` periodicamente para a Cloud Function
  avançar o job (provider/worker) e gravar no Firestore. Isso é feito pelo hook
  `useJobPolling` (frontend/src/lib/job-poller.ts), usado em Generate e Library.
- O Worker reporta progresso ao vivo: o `rig_script.py` emite linhas
  `PROGRESS: <pct>` que o `main.py` lê via streaming do stdout do Blender.
