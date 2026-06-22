# Gerador3D — Worker de Geração 3D própria (open-source)

Gera **texto→3D / imagem→3D** com modelos **open-source** rodando na **sua**
máquina, sem depender de Meshy/Tripo nem de contas externas. Expõe a mesma API
que o resto da plataforma já consome (a Cloud Function despacha para cá quando o
provedor **Self-hosted** está configurado).

## Como funciona
- `main.py` — servidor FastAPI (porta **8001**). Recebe `/api/generate`, roda o
  modelo, e faz `PUT` do `.glb` no link assinado que a Cloud Function fornece.
- `backends.py` — adaptadores de IA **plugáveis**. Escolha via `GEN_BACKEND`:
  - `triposr` *(padrão)* — **TripoSR** (MIT, imagem→3D, ~6-8GB VRAM, roda no Windows).
  - `trellis` — **TRELLIS** (Microsoft, MIT, qualidade alta, **Linux/WSL**, 16GB+).
  - `hunyuan` — **Hunyuan3D-2.1** (Tencent, texturas PBR excelentes, 10GB+).
- **Texto→3D** = texto→imagem (diffusers) + imagem→3D, automático.

## Recomendação por GPU/licença
| Backend   | Licença | VRAM | SO | Quando usar |
|-----------|---------|------|----|-------------|
| TripoSR   | MIT     | 6-8GB | Win/Linux | Começar agora; rápido; comercial OK |
| TRELLIS   | MIT     | 16GB+ | Linux/WSL | Melhor qualidade malha; comercial OK |
| Hunyuan3D-2.1 | Tencent (permissiva) | 10-29GB | Win/Linux | Texturas PBR top |

> SF3D (Stability) também existe, mas a licença restringe uso comercial acima de
> US$ 1M de faturamento — por isso não é o padrão aqui.

## Instalação (uma vez)
```bash
cd worker-3dgen
pip install -r requirements.txt
# PyTorch com a CUDA da sua GPU (veja https://pytorch.org):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
# Backend padrão (TripoSR):
pip install rembg onnxruntime einops omegaconf transformers
pip install git+https://github.com/VAST-AI-Research/TripoSR.git
# (opcional) texto→3D:
pip install diffusers accelerate
```

## Rodar
```bash
python main.py            # porta 8001
# escolher backend:  set GEN_BACKEND=trellis  (Windows)  /  export GEN_BACKEND=trellis (Linux)
```
Exponha com cloudflared/ngrok (igual ao worker de rigging) e cole a URL em
**Configurações → Self-hosted → Base URL**. Em **Modelos das Tarefas**, aponte
**Imagem→3D** (e/ou Texto→3D) para um modelo Self-hosted (ex.: TripoSR).

## API
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/generate` | `{ task, prompt, imageDataUrl, uploadUrl, meshUrl?, meshDataUrl?, params? }` → `{ taskId }` |
| GET  | `/api/status/{taskId}` | `{ status, progress, error? }` |
| GET  | `/api/health` | `{ status, backend, cuda }` |

`task` ∈ `image_to_3d | text_to_3d | texture_mesh`.

`params` (opcional) repassa opções ao backend, ex.: `{ "texture": true, "seed": 7 }`.

### Texturização PBR (Hunyuan3D-Paint)
Dois caminhos:
- **Na geração:** `params.texture = true` aplica textura PBR à malha recém-gerada
  (backends `hunyuan` / `hunyuan-mini`).
- **Em malha existente:** `task = "texture_mesh"` + a malha (`meshUrl` para baixar
  **ou** `meshDataUrl` base64) + uma imagem de referência (`imageDataUrl`). Pinta
  PBR sobre a geometria que você já tem — **não** regera a forma.

Cobre os dois layouts do repositório: **2.1** (`hy3dpaint`, PBR completo, preferido)
e **2.0/2mini** (`hy3dgen.texgen`). Exige **GPU** e os módulos compilados
`custom_rasterizer` + `differentiable_renderer` (não vêm na instalação padrão); sem
eles, a geração ainda exporta a geometria e o `texture_mesh` falha com mensagem clara.
O fluxo de controle tem smoke test sem GPU (`python tests/test_paint.py`); a qualidade
do resultado é validada em máquina com GPU/pesos.

## Observação importante
Os pesos dos modelos são baixados do Hugging Face na 1ª execução (uma vez) e
ficam em cache local. Depois disso, a geração roda 100% offline/local.
