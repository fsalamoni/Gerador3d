"""
Gerador3D — Worker de Geração 3D própria (open-source, sem APIs pagas).

Roda na SUA máquina com GPU e expõe a MESMA API que o resto da plataforma já
fala (igual ao worker de rigging), para que a Cloud Function despache geração
texto→3D / imagem→3D para o seu PC em vez de Meshy/Tripo.

Endpoints:
  POST /api/generate          { task, prompt, imageDataUrl, uploadUrl } -> { taskId }
  GET  /api/status/{taskId}   -> { status, progress, error? }
  GET  /api/health            -> { status, backend, cuda }

O modelo de IA é plugável (ver backends.py). Padrão: TripoSR (MIT, ~6-8GB VRAM,
imagem→3D). Outros backends: trellis, hunyuan (ver README).

A geração em si NÃO depende de nenhuma aplicação ou conta externa: o código e os
pesos (open-source) rodam localmente.
"""

import os
import sys
import uuid
import base64
import tempfile
import traceback
from pathlib import Path

for _s in (sys.stdout, sys.stderr):  # logs UTF-8 (evita cp1252 no Windows)
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

import backends  # adaptadores de modelo (TripoSR / TRELLIS / Hunyuan)

app = FastAPI(title="Gerador3D Local 3D-Generation Worker")
jobs = {}
HERE = Path(__file__).parent.resolve()
BACKEND_NAME = os.environ.get("GEN_BACKEND", "triposr")


class GenRequest(BaseModel):
    task: str                 # 'image_to_3d' | 'text_to_3d' | 'texture_mesh'
    prompt: str = ""
    imageDataUrl: str = ""    # imagem de entrada / referência de textura
    uploadUrl: str = ""       # link assinado (PUT) para devolver o .glb
    meshUrl: str = ""         # 'texture_mesh': link (GET) da malha a texturizar
    meshDataUrl: str = ""     # 'texture_mesh': malha embutida (base64 data URL)
    params: dict = Field(default_factory=dict)  # opções do backend (ex.: texture, seed)


def _set(task_id, **kw):
    jobs.setdefault(task_id, {})
    jobs[task_id].update(kw)


def _decode_image(data_url: str, dest: Path) -> bool:
    """Grava bytes de um data URL base64 em disco. Devolve True se ok."""
    if not data_url:
        return False
    payload = data_url.split(",", 1)[1] if "," in data_url else data_url
    try:
        dest.write_bytes(base64.b64decode(payload))
        return dest.stat().st_size > 0
    except Exception:
        return False


def _fetch_mesh(req: "GenRequest", dest: Path) -> bool:
    """Obtém a malha a texturizar: prefere meshDataUrl (base64), senão baixa de
    meshUrl (GET). Devolve True se gravou um arquivo não-vazio."""
    if req.meshDataUrl and _decode_image(req.meshDataUrl, dest):
        return True
    if req.meshUrl:
        try:
            r = requests.get(req.meshUrl, timeout=300)
            r.raise_for_status()
            dest.write_bytes(r.content)
            return dest.stat().st_size > 0
        except Exception:
            return False
    return False


def process_generate(task_id: str, req: GenRequest):
    _set(task_id, status="in_progress", progress=5, error=None)
    workdir = Path(tempfile.mkdtemp(prefix="gr3dgen_"))
    image_path = workdir / "input.png"
    mesh_path = workdir / "input.glb"
    out_path = workdir / "model.glb"

    def progress(pct, _msg=""):
        _set(task_id, progress=max(5, min(99, int(pct))))

    try:
        have_image = _decode_image(req.imageDataUrl, image_path)

        if req.task == "texture_mesh":
            # Texturiza uma malha EXISTENTE (não regera a forma) — PBR via paint.
            if not _fetch_mesh(req, mesh_path):
                raise ValueError("texture_mesh requer uma malha (meshUrl ou meshDataUrl).")
            if not have_image:
                raise ValueError("texture_mesh requer uma imagem de referência (imageDataUrl).")
            _set(task_id, progress=10)
            backends.texture_mesh(
                mesh_path=str(mesh_path),
                image_path=str(image_path),
                out_path=str(out_path),
                progress=progress,
                params=req.params,
            )
        else:
            if req.task == "image_to_3d" and not have_image:
                raise ValueError("image_to_3d requer uma imagem (imageDataUrl).")
            if req.task == "text_to_3d" and not req.prompt.strip():
                raise ValueError("text_to_3d requer um prompt de texto.")

            _set(task_id, progress=10)
            # Delega ao backend de IA (carrega o modelo na 1ª chamada).
            backends.generate(
                backend_name=BACKEND_NAME,
                task=req.task,
                prompt=req.prompt,
                image_path=str(image_path) if have_image else "",
                out_path=str(out_path),
                progress=progress,
                params=req.params,
            )

        if not out_path.exists() or out_path.stat().st_size == 0:
            raise RuntimeError("O backend não gerou o arquivo .glb.")
        _set(task_id, progress=92)

        if req.uploadUrl:
            with open(out_path, "rb") as f:
                up = requests.put(
                    req.uploadUrl, data=f,
                    headers={"Content-Type": "application/octet-stream"},
                    timeout=300,
                )
                up.raise_for_status()
            _set(task_id, progress=98)

        _set(task_id, status="succeeded", progress=100)
        print(f"[{task_id}] Geração concluída.")
    except Exception as e:  # noqa: BLE001
        print(f"[{task_id}] Erro: {e}")
        traceback.print_exc()
        _set(task_id, status="failed", error=str(e)[:500])
    finally:
        for p in (image_path, mesh_path, out_path):
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass
        try:
            workdir.rmdir()
        except Exception:
            pass


@app.post("/api/generate")
def start_generate(req: GenRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    jobs[task_id] = {"status": "pending", "progress": 0, "error": None}
    background_tasks.add_task(process_generate, task_id, req)
    return {"taskId": task_id}


@app.get("/api/status/{task_id}")
def get_status(task_id: str):
    if task_id not in jobs:
        raise HTTPException(status_code=404, detail="Task not found")
    return jobs[task_id]


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "backend": BACKEND_NAME,
        "cuda": backends.cuda_available(),
    }


if __name__ == "__main__":
    import uvicorn
    print(f"[3DGen] Backend: {BACKEND_NAME} | CUDA: {backends.cuda_available()}")
    uvicorn.run(app, host="0.0.0.0", port=8001)
