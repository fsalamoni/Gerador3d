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
from pathlib import Path

_MODELS = {}  # cache de modelos carregados por backend


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
        import torch  # noqa: WPS433
        return bool(torch.cuda.is_available())
    except Exception:
        return False


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
        import torch
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
        import torch as _torch
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
    import torch
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
            import rembg
            from tsr.utils import remove_background, resize_foreground
            image = remove_background(image, rembg.new_session())
            image = resize_foreground(image, fg_ratio)
        except Exception:
            pass  # segue sem remoção de fundo

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

def _hunyuan(task, prompt, image_path, out_path, progress, params=None):
    params = params or {}
    if progress:
        progress(20, "carregando Hunyuan3D")
    if "hunyuan" not in _MODELS:
        _ensure_local_repo_on_path("Hunyuan3D-2", "Hunyuan3D-2.1", "Hunyuan3D-2GP")
        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
        pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            os.environ.get("HUNYUAN_MODEL", "tencent/Hunyuan3D-2.1"))
        _MODELS["hunyuan"] = pipe
    pipe = _MODELS["hunyuan"]

    if task == "text_to_3d" or not image_path:
        tmp = str(Path(tempfile.gettempdir()) / "gr3d_t2i.png")
        image_path = text_to_image(prompt, tmp, progress)

    if progress:
        progress(60, "reconstruindo 3D")
    mesh = pipe(image=image_path)[0]
    if progress:
        progress(88, "exportando GLB")
    mesh.export(out_path)


_BACKENDS = {
    "triposr": _triposr,
    "trellis": _trellis,
    "hunyuan": _hunyuan,
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
