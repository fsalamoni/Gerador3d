# Pesquisa: Geração 3D própria com código open-source (sem Meshy/Tripo)

**Pergunta:** é viável ter código próprio, open-source, rodando na nossa
plataforma para gerar 3D (texto→3D / imagem→3D), sem depender de APIs externas?

**Resposta curta:** **Sim, é totalmente viável.** Existem modelos open-source de
ponta, com licença comercial, que rodam numa GPU local. Já incorporei isso no
projeto como `worker-3dgen` (adaptador plugável, padrão TripoSR). Não dá para
"recriar o Meshy do zero" (são modelos de ML treinados com enorme custo), mas
**dá para usar os melhores modelos abertos** — que hoje rivalizam com o Meshy — e
hospedá-los nós mesmos.

## Como esses modelos funcionam (o "segredo" do Meshy & cia.)
O padrão dominante em 2025–2026: um modelo de **difusão** gera várias **vistas 2D**
consistentes do objeto e uma rede **feed-forward** reconstrói a **malha 3D**.
Modelos como TripoSR/SF3D fazem **imagem→malha** direto (feed-forward, < 1s).
**Texto→3D** normalmente é **texto→imagem** (SDXL/FLUX) **+ imagem→3D**.

## Comparativo dos principais projetos abertos

| Projeto | Licença | VRAM | SO | Qualidade | Observações |
|---|---|---|---|---|---|
| **TripoSR** (VAST-AI) | **MIT** | 6–8GB | Win/Linux | Boa (rápida) | Mais fácil de hospedar; comunidade enorme; ideal para começar |
| **TRELLIS** (Microsoft) | **MIT** | 16GB+ | **Linux** (Win via WSL/Docker) | **SOTA** (venceu 68% dos casos em benchmark) | Melhor malha; texto e imagem |
| **TRELLIS.2-4B** (Microsoft) | **MIT** | 24GB (12GB p/ 512³) | Linux | Topo (PBR) | Mais pesado |
| **Hunyuan3D-2.1** (Tencent) | Permissiva (Tencent) | 10GB shape / 21GB textura | Win/Linux | Excelente textura PBR | Tem `api_server.py` oficial; `--low_vram_mode` |
| **SF3D** (Stability) | **Restrita** (Community License: comercial só até US$1M de faturamento) | ~7GB | Win/Linux | Boa + UV/PBR rápido | Evitar como padrão por causa da licença |

## Recomendação para a sua máquina (Windows + GPU 16GB)
1. **Agora (MIT, roda no Windows, leve): TripoSR** → é o **backend padrão** do
   `worker-3dgen`. Imagem→3D em segundos; comercial liberado.
2. **Qualidade máxima (MIT): TRELLIS** → rode via **WSL2/Docker** (é Linux-only)
   ou numa GPU em nuvem. Já há adaptador pronto (`GEN_BACKEND=trellis`).
3. **Texturas PBR de ponta: Hunyuan3D-2.1** → licença permissiva, `low_vram_mode`.
   Adaptador pronto (`GEN_BACKEND=hunyuan`).
4. **Texto→3D**: habilite o passo **texto→imagem** com `diffusers` (SDXL/FLUX) — o
   `worker-3dgen` encadeia automaticamente texto→imagem→3D.

## O que já foi implementado neste repositório
- **`worker-3dgen/`** — servidor FastAPI (porta 8001) que expõe a MESMA API que a
  plataforma já fala (`/api/generate`, `/api/status`, `/api/health`).
- **`worker-3dgen/backends.py`** — adaptadores **plugáveis**: `triposr` (padrão),
  `trellis`, `hunyuan`, com imports preguiçosos (o servidor sobe mesmo sem as
  libs de ML; o job falha com mensagem clara se faltar algo).
- **Cloud Function** (`functions/src/index.ts`) — o provedor **Self-hosted** agora
  roteia: `rigging → /api/rig` (worker de rigging) e `image_to_3d/text_to_3d →
  /api/generate` (worker de geração). Em ambos, a função assina um link de upload
  e devolve um link de leitura assinado do resultado. **Sem segredos no worker.**

## Plano de evolução (próximos passos sugeridos)
1. **Validar TripoSR na sua GPU** (instruções em `worker-3dgen/README.md`) e medir
   tempo/qualidade.
2. **Adicionar TRELLIS via Docker** (imagem oficial/community) para qualidade alta
   sem brigar com dependências no Windows.
3. **Gateway único**: hoje rigging (8000) e geração (8001) são túneis separados;
   criar um pequeno gateway para servir os dois sob uma única Base URL.
4. **Cache de pesos** e fila de jobs (o worker já roda 1 job por vez; adicionar
   fila/limite para GPUs menores).
5. **Texto→3D**: escolher o modelo texto→imagem (SDXL Turbo p/ velocidade ou FLUX
   p/ qualidade) e fixar nos requirements.

## Fontes
- TRELLIS (Microsoft): https://github.com/microsoft/TRELLIS — MIT, 16GB, Linux.
- TRELLIS.2: https://github.com/microsoft/TRELLIS.2 e https://huggingface.co/microsoft/TRELLIS.2-4B
- Hunyuan3D-2.1 (Tencent): https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 — `api_server.py`, low VRAM.
- Stable Fast 3D (Stability): https://github.com/Stability-AI/stable-fast-3d — Community License (restrição comercial).
- TripoSR (VAST-AI): https://github.com/VAST-AI-Research/TripoSR — MIT, 6–8GB.
- Comparativos: https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026 ,
  https://www.pixazo.ai/blog/best-open-source-3d-model-generation-apis
