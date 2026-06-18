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
│   ├── rig_script.py       # Script do Blender (bpy)
│   └── start.bat           # Um clique para iniciar tudo
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
1. Script real de rigging facial no `rig_script.py` — atualmente é um mock
2. Integração com provedores além do Meshy (Tripo, Rodin, Hunyuan)
3. Interface de edição de VRM no Estúdio
4. Testes automatizados
5. Suporte a VRM para exportação final
