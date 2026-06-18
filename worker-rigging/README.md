# Gerador3D - Worker de Auto-Rigging Facial

Este microsserviço processa as malhas 3D do usuário e gera os **52 blendshapes
ARKit** (expressões faciais) + um esqueleto humanoide, exportando um **`.vrm`**
pronto para o face tracking via webcam — tudo localmente, sem depender de
provedores pagos.

Construído em **Python (FastAPI)** + **Blender headless (`bpy`)**.

## Como funciona (pipeline real)

`rig_script.py` (executado pelo Blender) faz:

1. Importa o GLB do usuário e localiza a malha do rosto/cabeça.
2. Importa um **template facial** que já contém os 52 shape keys ARKit.
3. Alinha o template ao rosto do usuário (transformação por bounding box).
4. **Transfere os blendshapes** do template para a malha do usuário usando o
   modificador *Surface Deform* (Deformation Transfer): para cada expressão, a
   malha do usuário é deformada e o resultado é "assado" como uma nova shape key.
5. Cria/reaproveita um esqueleto humanoide mínimo (exigido pelo VRM) e registra
   as expressões VRM (`aa`, `blink`, `happy`, ...) apontando para as shape keys.
6. Exporta como `.vrm` via o **VRM Add-on for Blender**.

`main.py` (FastAPI) orquestra: baixa o GLB (`downloadUrl`), roda o Blender e
faz `PUT` do `.vrm` no `uploadUrl` (link assinado fornecido pela Cloud Function).

## Pré-requisitos

1. **Python 3.10+** e **Blender 4.0+** (testado mirando o Blender 5.1).
2. **VRM Add-on for Blender** instalado e habilitado no Blender
   (https://vrm-addon-for-blender.info/). Sem ele, o worker faz *fallback* para
   exportar um GLB (com os morph targets preservados) no mesmo arquivo de saída.
3. **Template facial** `template_face.glb` (ou `.vrm` / `.gltf` / `.blend`) com
   os 52 shape keys no padrão ARKit, colocado **nesta pasta** (`worker-rigging/`)
   ou em `worker-rigging/templates/`. Alternativamente, aponte com a variável de
   ambiente `RIG_TEMPLATE_PATH` ou o argumento `--template`.

   > Onde conseguir um template: exporte uma cabeça ARKit-compatible (por
   > exemplo de uma base VRoid/ReadyPlayerMe com perfect-sync, ou um rig ARKit
   > livre) garantindo que os morph targets tenham os nomes ARKit
   > (`jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, ...).

   O endpoint `GET /api/health` informa se o template foi detectado.

## Como executar localmente (Windows / GPU)

1. Instale as dependências Python:
   ```bash
   pip install -r requirements.txt
   ```
2. Inicie o Worker (porta 8000):
   ```bash
   python main.py
   ```
   No boot ele imprime qual Blender e qual template foram detectados.
3. Exponha para a internet com o ngrok (a plataforma roda na nuvem):
   ```bash
   ngrok http 8000
   ```
   Copie a URL `Forwarding` (ex.: `https://abcd-123.ngrok-free.app`).
4. Na plataforma web (**Configurações → Self-hosted**), habilite o provedor e
   cole a URL do ngrok em **Base URL**. Em **Modelos das Tarefas**, aponte o
   **Rigging** para o **Local Rigging Worker**.

> Atalho: `start.bat` sobe o Worker e o ngrok juntos.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/rig` | Body `{ downloadUrl, uploadUrl }` → `{ taskId }` |
| `GET`  | `/api/status/{taskId}` | `{ status, progress, error? }` |
| `GET`  | `/api/health` | `{ status, blender, blender_found, template }` |

`status` ∈ `pending | in_progress | succeeded | failed`. Em caso de falha, o
campo `error` traz a causa (incluindo erros do `rig_script` prefixados por
`RIG_ERROR:`), que a Cloud Function repassa para o frontend.

## Variáveis de ambiente

- `BLENDER_PATH` — caminho do `blender.exe` (senão é detectado automaticamente).
- `RIG_TEMPLATE_PATH` — caminho do template facial (senão procura `template_face.*`).
