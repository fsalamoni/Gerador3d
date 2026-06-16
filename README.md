# Gerador3D

Plataforma para criar **avatares 3D** a partir de texto ou imagem, fazer o
**rigging facial e corporal** e **animar o avatar em tempo real pela webcam**,
pronto para uso em RPG em mesas virtuais (VTT) via **OBS**.

> Platform to create **3D avatars** from text or image, **rig** face and body,
> and **animate the avatar in real time from the webcam**, ready for tabletop
> RPG on virtual tabletops via **OBS**.

---

## Funcionalidades Desenvolvidas

A plataforma foi construída do zero, utilizando uma arquitetura moderna e escalável com **React, TypeScript, Vite e Firebase**. O deploy é automatizado via **GitHub Actions**.

- **✨ Geração de Modelos 3D**:
  - Suporte a múltiplos provedores de geração (arquitetura "Bring Your Own Key").
  - Geração a partir de **texto** ou **imagem**.
  - Proxy de Cloud Functions para gerenciar as chamadas de API de forma segura e assíncrona, sem expor chaves de API no cliente.
  - Otimização com `vite-plugin-chunk-split` para melhor performance de carregamento.

- **👤 Estúdio de Avatar**:
  - Visualizador de modelos 3D (`.glb`, `.vrm`) com controles de câmera.
  - **Animação facial em tempo real** via webcam, utilizando MediaPipe para detecção de face e Kalidokit para rigging.
  - Interface preparada para captura de tela com fundo transparente, ideal para streaming em softwares como OBS.

- **⚙️ Gerenciamento e Administração**:
  - Autenticação de usuários com Firebase (Email/Senha e Google).
  - Galeria de modelos 3D gerados por usuário, com persistência no Firebase Storage.
  - **Painel de Admin** com estatísticas de uso da plataforma (total de jobs, jobs por provedor, etc.).
  - **Painel de Analytics** individual para cada usuário.
  - Interface bilíngue (Português/Inglês).

- **☁️ Infraestrutura e Banco de Dados**:
  - O projeto utiliza um banco de dados **Firestore dedicado (`gerador3d`)** dentro do projeto Firebase `antonov-82411`, garantindo total isolamento de dados de outras aplicações.
  - Regras de segurança robustas para Firestore e Storage.

## Próximos Passos (O Que Falta Desenvolver)

A base da plataforma está sólida e funcional, mas há diversas oportunidades de expansão:

- **Novos Provedores**: Integrar mais APIs de geração 3D (ex: Luma AI, CSM, etc.) para dar mais opções aos usuários.
- **Editor de VRM**: Adicionar um editor no Estúdio para ajustar detalhes do avatar (expressões, materiais, etc.) e salvar as alterações.
- **Animação Corporal**: Expandir o tracking para incluir corpo inteiro (requer modelos VRM com rigging completo).
- **Melhorias de UI/UX**: Refinar a interface, adicionar mais feedback visual durante a geração e melhorar a experiência de onboarding.
- **Analytics Avançado**: Detalhar ainda mais as métricas no painel de Admin e no painel do usuário.
- **Testes Automatizados**: Implementar uma suíte de testes (unitários, integração, e2e) para garantir a estabilidade do código.

A interface é **bilíngue (PT-BR / EN)**. Cada usuário cadastra seus **próprios
provedores de IA** (BYOK) e escolhe os **modelos** por tarefa.

---

## Arquitetura

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Roteamento | React Router 6 (SPA) |
| Auth | Firebase Auth (e-mail/senha + Google) |
| Banco | Firebase Firestore |
| Arquivos | Firebase Storage |
| Proxy de geração 3D | Firebase Cloud Functions (Node 22, 2ª geração) |
| 3D no browser | three.js · @pixiv/three-vrm |
| Captura facial | MediaPipe FaceLandmarker · Kalidokit |
| i18n | react-i18next |

A geração 3D usa um **Cloud Function como proxy** (resolve CORS, jobs assíncronos
e salva os artefatos no Storage). A chave de API de cada usuário (BYOK) é lida no
servidor a partir das configurações dele no Firestore.

### Cadeia completa (do texto ao OBS)

1. **Configurar** — conecte um provedor (Meshy, Tripo, Rodin, Hunyuan3D ou
   self-host) e escolha os modelos por tarefa.
2. **Gerar 3D** — texto→3D ou imagem→3D.
3. **Rigging / VRM** — esqueleto humanoide + blendshapes para o avatar.
4. **Estúdio ao vivo** — a webcam anima o avatar (expressões, piscadas, fala).
5. **OBS** — abra a vista `/obs` (fundo transparente) como *Browser Source*.

---

## Estrutura do projeto

```
frontend/   → App React (UI, lógica de negócio em src/lib)
functions/  → Cloud Functions proxy (dialeto Meshy implementado)
firebase.json, firestore.rules, storage.rules, firestore.indexes.json
.github/workflows/firebase-deploy.yml → CI/CD
```

---

## Rodando localmente

### Pré-requisitos
- Node.js 18+ (recomendado 20/22) e npm 9+

### Modo demonstração (sem Firebase)
Sem variáveis do Firebase, o app roda em **modo demo**: autenticação simulada,
dados em `localStorage` e geração 3D simulada (com prévia de um avatar
procedural). Ótimo para explorar a interface.

```powershell
cd frontend
npm install
npm run dev
```
Abra http://localhost:3000

### Modo conectado (com seu Firebase)
1. Copie `frontend/.env.example` para `frontend/.env.local` e preencha com a
   configuração do seu app Web do Firebase.
2. No console do Firebase, habilite: **Authentication** (E-mail/senha + Google),
   **Firestore** e **Storage**.
3. `npm run dev` (ou `npm run build` para produção).

---

## Deploy (quando você fornecer o Firebase)

### O que será necessário
- **Configuração do Firebase** (app Web): `apiKey`, `authDomain`, `projectId`,
  `storageBucket`, `messagingSenderId`, `appId`.
- **Conta de serviço** do projeto (JSON) para o deploy via GitHub Actions.
- Pelo menos **uma chave de provedor** (sugestão: Meshy) para validar a geração
  de ponta a ponta.

### Secrets do GitHub (para o workflow de deploy)
| Secret | Descrição |
|--------|-----------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON da conta de serviço com permissão de deploy |
| `VITE_FIREBASE_API_KEY` | Config do app Web |
| `VITE_FIREBASE_AUTH_DOMAIN` | Config do app Web |
| `VITE_FIREBASE_PROJECT_ID` | ID do projeto |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket do Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Config do app Web |
| `VITE_FIREBASE_APP_ID` | Config do app Web |
| `VITE_ADMIN_EMAIL` | (opcional) e-mail tratado como admin |

Ajuste `.firebaserc` com o seu `projectId`. O push para `main` dispara o build do
frontend + functions e o deploy de Hosting, Firestore (rules/indexes), Storage e
Functions.

### Deploy manual
```powershell
cd frontend; npm run build
cd ../functions; npm run build
cd ..
firebase deploy --only hosting,firestore,storage,functions --project SEU_PROJECT_ID
```

---

## Provedores suportados (BYOK)

| Provedor | Capacidades |
|----------|-------------|
| **Meshy** | texto→3D, imagem→3D, texturização, rigging, animação *(proxy implementado)* |
| **Tripo** | texto→3D, imagem→3D, texturização, rigging |
| **Rodin (Hyper3D)** | texto→3D, imagem→3D |
| **Hunyuan3D** | texto→3D, imagem→3D |
| **Self-host (TripoSR / SF3D)** | imagem→3D (URL configurável) |

> O proxy implementa o dialeto **Meshy** de ponta a ponta. Os demais provedores
> já aparecem no catálogo e podem ser adicionados ao proxy seguindo o mesmo
> contrato (`functions/src/meshy.ts` como referência).

---

## Notas técnicas

- **Blendshapes ARKit**: modelos `.glb` gerados normalmente não trazem os 52
  blendshapes faciais. Nesse caso o Estúdio aplica apenas a rotação da cabeça.
  Para expressões completas (perfect-sync), use um **VRM** com blendshapes.
- **Privacidade**: o rastreamento facial roda **inteiramente no browser**
  (MediaPipe). Nenhuma imagem da câmera é enviada para servidores.
- **Custos**: a geração usa a chave de cada usuário (BYOK) — sem custo de
  inferência para a plataforma.

## Licença
Uso privado. Todos os direitos reservados.
