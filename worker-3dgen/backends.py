"""
Backends de IA para geração 3D (plugáveis).

Cada backend recebe (task, prompt, image_path, out_path, progress) e deve gravar
um .glb em out_path. Os imports pesados (torch, etc.) são feitos preguiçosamente
DENTRO de cada backend, para o servidor FastAPI subir mesmo sem as libs de ML
instaladas (o /api/health funciona; o job falha com mensagem clara).

Backend padrão: "triposr" (MIT, imagem→3D, ~6-8GB VRAM, roda no Windows).
Selecione outro via variável de ambiente GEN_BACKEND.

Para texto→3D a estratégia é texto→imagem (diffusers) e depois imagem→3D.
"""

import os
import sys
import tempfile
import threading
from pathlib import Path

_MODELS = {}  # cache de modelos carregados por backend

# Importação do torch serializada: a UI chama /diagnostics (checa CUDA) ao mesmo
# tempo que a geração roda noutra thread; importar torch concorrentemente causa
# "partially initialized module 'torch' ... circular import". O lock garante um
# único import; em caso de falha, removemos o módulo parcial de sys.modules.
_TORCH_LOCK = threading.Lock()
_TORCH = None


def get_torch():
    global _TORCH
    if _TORCH is not None:
        return _TORCH
    with _TORCH_LOCK:
        if _TORCH is None:
            try:
                import torch
                _TORCH = torch
            except BaseException:
                for m in list(sys.modules):
                    if m == "torch" or m.startswith("torch."):
                        sys.modules.pop(m, None)
                raise
    return _TORCH


def _ensure_local_repo_on_path(*names):
    """Adiciona repositórios clonados localmente (ex.: TripoSR) ao sys.path,
    para que `from tsr.system import TSR` funcione após o setup."""
    here = Path(__file__).resolve().parent
    for name in names:
        cand = here / name
        if cand.exists() and str(cand) not in sys.path:
            sys.path.insert(0, str(cand))


def cuda_available() -> bool:
    try:
        return bool(get_torch().cuda.is_available())
    except Exception:
        return False


def gpu_info() -> dict:
    """Informações da GPU para escolher o melhor backend.

    Retorna {name, vramGb, cuda}. Em CPU (ou sem torch) devolve cuda=False e
    vramGb=0. Tolerante a falhas: nunca levanta — o diagnóstico depende disto.
    """
    info = {"name": "", "vramGb": 0.0, "cuda": False}
    try:
        torch = get_torch()
        if not torch.cuda.is_available():
            return info
        props = torch.cuda.get_device_properties(0)
        info["name"] = props.name
        info["vramGb"] = round(props.total_memory / (1024 ** 3), 1)
        info["cuda"] = True
    except Exception:
        pass
    return info


# Catálogo de backends para a UI: o que cada um exige e produz. `minVramGb` é o
# mínimo prático para a geração rodar sem estourar a memória. `installable` marca
# os que o app instala com um clique (os demais exigem setup manual/Linux).
BACKEND_CATALOG = {
    "triposr": {
        "label": "TripoSR",
        "minVramGb": 6,
        "texture": False,
        "installable": True,
        "note": "Rápido, leve, sem textura PBR. Ótimo para começar (MIT).",
    },
    "hunyuan-mini": {
        "label": "Hunyuan3D-2mini",
        "minVramGb": 12,
        "texture": False,
        "installable": True,
        "note": "Geometria de altíssima fidelidade. Textura PBR opcional (avançada).",
    },
    "trellis": {
        "label": "TRELLIS",
        "minVramGb": 16,
        "texture": True,
        "installable": False,
        "note": "Qualidade alta com textura (Microsoft, MIT). Setup manual — Linux/WSL.",
    },
    "hunyuan": {
        "label": "Hunyuan3D-2.1",
        "minVramGb": 24,
        "texture": True,
        "installable": False,
        "note": "Texturas PBR excelentes. Setup manual; exige bastante VRAM.",
    },
}


def recommend_backend(vram_gb: float) -> str:
    """Melhor backend INSTALÁVEL com um clique para a VRAM disponível.

    Só recomenda backends que o app consegue provisionar sozinho (TripoSR e
    Hunyuan3D-2mini). TRELLIS e Hunyuan3D-2.1 ficam no catálogo como opções
    avançadas (setup manual), mas não são auto-recomendados para não levar o
    usuário a um caminho que não instala com um clique no Windows.
    """
    if vram_gb >= 12:
        return "hunyuan-mini"
    return "triposr"


# ──────────────────────────────────────────────────────────────────────────────
# Texto → imagem (para alimentar os modelos imagem→3D em pedidos text_to_3d)
# ──────────────────────────────────────────────────────────────────────────────

def text_to_image(prompt: str, out_png: str, progress=None) -> str:
    """Gera uma imagem a partir do texto usando diffusers (Stable Diffusion).

    Requer `diffusers`, `transformers` e `torch`. O modelo é configurável via
    T2I_MODEL (padrão: stabilityai/stable-diffusion-xl-base-1.0).
    """
    if progress:
        progress(15, "texto→imagem")
    try:
        torch = get_torch()
        from diffusers import AutoPipelineForText2Image
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "text_to_3d precisa de 'diffusers'+'torch' para o passo texto→imagem. "
            "Instale-os ou envie uma imagem (image_to_3d). Detalhe: " + str(exc)
        )
    model_id = os.environ.get("T2I_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
    key = f"t2i:{model_id}"
    if key not in _MODELS:
        dtype = torch.float16 if cuda_available() else torch.float32
        pipe = AutoPipelineForText2Image.from_pretrained(model_id, torch_dtype=dtype)
        pipe = pipe.to("cuda" if cuda_available() else "cpu")
        _MODELS[key] = pipe
    pipe = _MODELS[key]
    image = pipe(prompt=prompt, num_inference_steps=25, guidance_scale=6.0).images[0]
    image.save(out_png)
    return out_png


# ──────────────────────────────────────────────────────────────────────────────
# Backend: TripoSR (padrão) — imagem→3D, MIT, leve
# https://github.com/VAST-AI-Research/TripoSR
# ──────────────────────────────────────────────────────────────────────────────

def _install_mcubes_shim():
    """Permite o TripoSR rodar SEM o 'torchmcubes' (que exige compilar C++ no
    Windows). Se o torchmcubes não estiver disponível, registramos um módulo
    fake que implementa marching_cubes via PyMCubes (wheels prontas p/ Windows).
    O TripoSR faz `from torchmcubes import marching_cubes`, então basta o módulo
    existir em sys.modules antes do import."""
    try:
        import torchmcubes  # noqa: F401  (compilado — usa o caminho oficial)
        return
    except Exception:
        pass
    try:
        import types as _types
        import numpy as _np
        _torch = get_torch()
        import mcubes as _mcubes  # PyMCubes (prebuilt wheel)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Sem 'torchmcubes' e sem 'PyMCubes'. Instale a geração 3D pela tela "
            "de Configuração (ela instala o PyMCubes). Detalhe: " + str(exc))

    def marching_cubes(vol, thresh):
        v = vol.detach().cpu().numpy().astype("float64")
        verts, faces = _mcubes.marching_cubes(v, float(thresh))
        vt = _torch.from_numpy(_np.ascontiguousarray(verts)).float()
        ft = _torch.from_numpy(_np.ascontiguousarray(faces)).long()
        return vt, ft

    mod = _types.ModuleType("torchmcubes")
    mod.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = mod
    print("[backends] usando PyMCubes (sem compilar torchmcubes).", flush=True)


def _triposr(task, prompt, image_path, out_path, progress, params=None):
    torch = get_torch()
    from PIL import Image
    params = params or {}

    # Parâmetros de qualidade (pesquisa: mc-resolution 256→512 + remoção de fundo
    # + foreground-ratio são as alavancas que mais melhoram o resultado).
    resolution = int(params.get("mcResolution") or os.environ.get("TRIPOSR_RES", "320"))
    resolution = max(64, min(512, resolution))
    fg_ratio = float(params.get("foregroundRatio") or 0.85)
    remove_bg = params.get("removeBg", True)
    seed = params.get("seed")
    if seed is not None:
        try:
            torch.manual_seed(int(seed))
        except Exception:
            pass

    if progress:
        progress(20, "carregando TripoSR")
    if "triposr" not in _MODELS:
        _ensure_local_repo_on_path("TripoSR", "tsr_repo")
        _install_mcubes_shim()  # garante marching cubes sem compilar
        from tsr.system import TSR
        model = TSR.from_pretrained(
            os.environ.get("TRIPOSR_MODEL", "stabilityai/TripoSR"),
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.renderer.set_chunk_size(8192)
        model.to("cuda" if cuda_available() else "cpu")
        _MODELS["triposr"] = model
    model = _MODELS["triposr"]

    # text_to_3d → primeiro gera uma imagem.
    if task == "text_to_3d" or not image_path:
        tmp = str(Path(tempfile.gettempdir()) / "gr3d_t2i.png")
        image_path = text_to_image(prompt, tmp, progress)

    if progress:
        progress(45, "pré-processando imagem")
    image = Image.open(image_path).convert("RGB")
    # Remoção de fundo (melhora muito o resultado).
    if remove_bg:
        try:
            import numpy as np
            import rembg
            from tsr.utils import remove_background, resize_foreground
            image = remove_background(image, rembg.new_session())
            image = resize_foreground(image, fg_ratio)
            # O TripoSR espera 3 canais (RGB). Após a remoção de fundo a imagem
            # fica RGBA — compomos sobre cinza (como o run.py oficial) para não
            # dar "tensor a (4) must match tensor b (3)".
            arr = np.array(image).astype(np.float32) / 255.0
            if arr.ndim == 3 and arr.shape[-1] == 4:
                arr = arr[:, :, :3] * arr[:, :, 3:4] + (1.0 - arr[:, :, 3:4]) * 0.5
                image = Image.fromarray((arr * 255.0).astype("uint8"))
            else:
                image = image.convert("RGB")
        except Exception:
            image = Image.open(image_path).convert("RGB")  # garante 3 canais

    if progress:
        progress(60, f"reconstruindo 3D (res {resolution})")
    device = "cuda" if cuda_available() else "cpu"
    with torch.no_grad():
        scene_codes = model([image], device=device)
    meshes = model.extract_mesh(scene_codes, resolution=resolution)

    if progress:
        progress(88, "exportando GLB")
    meshes[0].export(out_path, file_type="glb")


# ──────────────────────────────────────────────────────────────────────────────
# Backend: TRELLIS (Microsoft) — imagem/texto→3D, MIT, qualidade alta (Linux/16GB+)
# https://github.com/microsoft/TRELLIS
# ──────────────────────────────────────────────────────────────────────────────

def _trellis(task, prompt, image_path, out_path, progress, params=None):
    from PIL import Image
    params = params or {}

    if progress:
        progress(20, "carregando TRELLIS")
    if "trellis" not in _MODELS:
        from trellis.pipelines import TrellisImageTo3DPipeline
        pipe = TrellisImageTo3DPipeline.from_pretrained(
            os.environ.get("TRELLIS_MODEL", "microsoft/TRELLIS-image-large"))
        pipe.cuda()
        _MODELS["trellis"] = pipe
    pipe = _MODELS["trellis"]

    if task == "text_to_3d" or not image_path:
        tmp = str(Path(tempfile.gettempdir()) / "gr3d_t2i.png")
        image_path = text_to_image(prompt, tmp, progress)

    if progress:
        progress(55, "reconstruindo 3D")
    image = Image.open(image_path)
    outputs = pipe.run(image, seed=1)

    if progress:
        progress(88, "exportando GLB")
    from trellis.utils import postprocessing_utils
    glb = postprocessing_utils.to_glb(
        outputs["gaussian"][0], outputs["mesh"][0], simplify=0.95, texture_size=1024)
    glb.export(out_path)


# ──────────────────────────────────────────────────────────────────────────────
# Backend: Hunyuan3D-2.1 (Tencent) — imagem→3D + PBR, texturas excelentes
# https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1
# ──────────────────────────────────────────────────────────────────────────────

def _load_hunyuan_pipeline(model_id, subfolder):
    """Carrega o pipeline de FORMA (shape) do Hunyuan3D.

    Há dois layouts de pacote conforme a versão do repositório:
      - Hunyuan3D-2 / 2mini → `hy3dgen.shapegen`
      - Hunyuan3D-2.1       → `hy3dshape.pipelines`
    Tentamos o primeiro (cobre o mini, alvo de 12-16GB) e caímos para o segundo.
    """
    _ensure_local_repo_on_path("Hunyuan3D-2", "Hunyuan3D-2.1", "Hunyuan3D-2GP")
    device = "cuda" if cuda_available() else "cpu"
    kwargs = {"use_safetensors": True, "device": device}
    if subfolder:
        kwargs["subfolder"] = subfolder
    try:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    except Exception:
        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
        kwargs.pop("device", None)  # API do 2.1 não aceita device em from_pretrained
    try:
        pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(model_id, **kwargs)
    except TypeError:
        # Versões antigas não aceitam todos os kwargs — tenta só o essencial.
        minimal = {k: v for k, v in kwargs.items() if k in ("subfolder", "use_safetensors")}
        pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(model_id, **minimal)
    if cuda_available() and hasattr(pipe, "enable_flashvdm"):
        try:
            pipe.enable_flashvdm()  # reduz VRAM (caminho mini)
        except Exception:
            pass
    return pipe


def _run_hunyuan(cache_key, default_model, default_subfolder, task, prompt,
                 image_path, out_path, progress, params=None):
    """Núcleo compartilhado pelos backends Hunyuan3D (2.1 e 2mini).

    Gera a GEOMETRIA (alta fidelidade). A textura PBR exige módulos compilados
    (custom_rasterizer/differentiable_renderer) e é aplicada só se disponíveis.
    """
    params = params or {}
    if progress:
        progress(20, f"carregando {cache_key}")
    if cache_key not in _MODELS:
        model_id = os.environ.get("HUNYUAN_MODEL", default_model)
        subfolder = os.environ.get("HUNYUAN_SUBFOLDER", default_subfolder)
        _MODELS[cache_key] = _load_hunyuan_pipeline(model_id, subfolder)
    pipe = _MODELS[cache_key]

    if task == "text_to_3d" or not image_path:
        tmp = str(Path(tempfile.gettempdir()) / "gr3d_t2i.png")
        image_path = text_to_image(prompt, tmp, progress)

    if progress:
        progress(55, "reconstruindo geometria")
    steps = int(params.get("steps") or os.environ.get("HUNYUAN_STEPS", "30"))
    octree = int(params.get("octreeResolution") or params.get("mcResolution")
                 or os.environ.get("HUNYUAN_OCTREE", "256"))
    call_kwargs = dict(image=image_path, num_inference_steps=steps,
                       octree_resolution=octree, output_type="trimesh")
    seed = params.get("seed")
    if seed is not None:
        try:
            call_kwargs["generator"] = get_torch().manual_seed(int(seed))
        except Exception:
            pass
    try:
        mesh = pipe(**call_kwargs)[0]
    except TypeError:
        # API mínima (sem os kwargs de qualidade).
        mesh = pipe(image=image_path)[0]

    # Textura PBR (opt-in): exige o paint pipeline + módulos compilados
    # (custom_rasterizer/differentiable_renderer), que não vêm no caminho de
    # instalação padrão. Habilite com params{"texture": true} se compilou-os.
    if params.get("texture", False):
        try:
            if progress:
                progress(78, "aplicando textura PBR")
            from hy3dgen.texgen import Hunyuan3DPaintPipeline
            paint_key = cache_key + ":paint"
            if paint_key not in _MODELS:
                _MODELS[paint_key] = Hunyuan3DPaintPipeline.from_pretrained(
                    os.environ.get("HUNYUAN_PAINT_MODEL", "tencent/Hunyuan3D-2"))
            mesh = _MODELS[paint_key](mesh, image=image_path)
        except Exception as exc:  # noqa: BLE001
            print(f"[backends] textura PBR indisponível ({exc}); exportando geometria.",
                  flush=True)

    if progress:
        progress(90, "exportando GLB")
    mesh.export(out_path)


def _hunyuan(task, prompt, image_path, out_path, progress, params=None):
    _run_hunyuan("hunyuan", "tencent/Hunyuan3D-2.1", "",
                 task, prompt, image_path, out_path, progress, params)


def _hunyuan_mini(task, prompt, image_path, out_path, progress, params=None):
    # Hunyuan3D-2mini: DiT menor (cabe em ~12-16GB com flashvdm).
    _run_hunyuan("hunyuan-mini", "tencent/Hunyuan3D-2mini", "hunyuan3d-dit-v2-mini",
                 task, prompt, image_path, out_path, progress, params)


_BACKENDS = {
    "triposr": _triposr,
    "trellis": _trellis,
    "hunyuan": _hunyuan,
    "hunyuan-mini": _hunyuan_mini,
}


def generate(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    """Dispatcher: roda o backend escolhido para produzir out_path (.glb)."""
    fn = _BACKENDS.get((backend_name or "triposr").lower())
    if fn is None:
        raise ValueError(
            f"Backend '{backend_name}' desconhecido. "
            f"Opções: {', '.join(_BACKENDS)}."
        )
    fn(task, prompt, image_path, out_path, progress, params or {})
