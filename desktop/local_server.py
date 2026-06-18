"""
Gerador3D — Motor LOCAL (engine do app de desktop).

Um único processo que substitui TODA a nuvem para a versão offline:
  - Serve a SPA (frontend/dist-local) em /
  - Guarda os jobs num arquivo local (jobs.json) — sem Firestore
  - Salva os modelos em disco e os serve em /files — sem Firebase Storage
  - Faz rigging (Blender) e geração 3D (modelos open-source) localmente,
    reaproveitando worker-rigging/ e worker-3dgen/ — sem Cloud Functions,
    sem túnel, sem colar URL.

A API local (REST simples) é consumida pelo build do frontend feito com
VITE_LOCAL=true (ver frontend/src/lib/local-api.ts).

Rode:  python local_server.py [--port 8765] [--data-dir <pasta>]
"""

import os
import sys
import json
import time
import uuid
import base64
import shutil
import argparse
import threading
import subprocess
import importlib.util
from pathlib import Path

import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent          # raiz do repo
RIG_DIR = ROOT / "worker-rigging"
GEN_DIR = ROOT / "worker-3dgen"
DIST = ROOT / "frontend" / "dist-local"                 # build local da SPA


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Reaproveita o código já testado dos workers.
rigmod = _load("gr3d_rigmain", RIG_DIR / "main.py")     # find_blender / template / _extract_error
genbackends = _load("gr3d_genbackends", GEN_DIR / "backends.py")

GEN_BACKEND = os.environ.get("GEN_BACKEND", "triposr")


# ──────────────────────────────────────────────────────────────────────────────
# Store local de jobs (jobs.json) + assets em disco
# ──────────────────────────────────────────────────────────────────────────────

class Store:
    def __init__(self, data_dir: Path):
        self.dir = data_dir
        self.assets = data_dir / "assets"
        self.assets.mkdir(parents=True, exist_ok=True)
        self.file = data_dir / "jobs.json"
        self.lock = threading.Lock()
        self.jobs = {}
        if self.file.exists():
            try:
                for j in json.loads(self.file.read_text("utf-8")):
                    self.jobs[j["id"]] = j
            except Exception:
                self.jobs = {}

    def _persist(self):
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(list(self.jobs.values()), ensure_ascii=False), "utf-8")
        tmp.replace(self.file)

    def list(self):
        with self.lock:
            return sorted(self.jobs.values(), key=lambda j: j.get("created_at", ""), reverse=True)

    def get(self, jid):
        with self.lock:
            return self.jobs.get(jid)

    def put(self, job):
        with self.lock:
            self.jobs[job["id"]] = job
            self._persist()

    def update(self, jid, **patch):
        with self.lock:
            j = self.jobs.get(jid)
            if not j:
                return None
            j.update(patch)
            j["updated_at"] = _now()
            self._persist()
            return j

    def delete(self, jid):
        with self.lock:
            self.jobs.pop(jid, None)
            self._persist()
        shutil.rmtree(self.assets / jid, ignore_errors=True)


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


CAPABILITY = {
    "text_to_3d": "text-to-3d",
    "image_to_3d": "image-to-3d",
    "rigging": "rigging",
    "upload": "upload",
}


def new_job(task_key, prompt="", has_image=False, model_id="local"):
    jid = f"local_{uuid.uuid4().hex[:12]}"
    return {
        "id": jid,
        "uid": "local",
        "task": CAPABILITY.get(task_key, task_key),
        "providerId": "local",
        "modelId": model_id,
        "status": "pending",
        "progress": 0,
        "params": {"prompt": prompt, "hasImage": has_image, "taskKey": task_key},
        "outputs": {},
        "error": None,
        "created_at": _now(),
        "updated_at": _now(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Processamento (rigging via Blender, geração via backends open-source)
# ──────────────────────────────────────────────────────────────────────────────

def _decode_data_url(data_url: str, dest: Path) -> bool:
    if not data_url:
        return False
    payload = data_url.split(",", 1)[1] if "," in data_url else data_url
    try:
        dest.write_bytes(base64.b64decode(payload))
        return dest.stat().st_size > 0
    except Exception:
        return False


def run_generate(store: Store, job):
    jid = job["id"]
    job_dir = store.assets / jid
    job_dir.mkdir(parents=True, exist_ok=True)
    out = job_dir / "model.glb"
    image_path = job_dir / "input.png"
    task = job["params"]["taskKey"]
    prompt = job["params"].get("prompt", "")
    img = job["params"].pop("_imageDataUrl", "")

    store.update(jid, status="in_progress", progress=5)
    try:
        have_img = _decode_data_url(img, image_path)
        if task == "image_to_3d" and not have_img:
            raise ValueError("image_to_3d requer uma imagem.")
        if task == "text_to_3d" and not prompt.strip():
            raise ValueError("text_to_3d requer um prompt.")
        genbackends.generate(
            backend_name=GEN_BACKEND, task=task, prompt=prompt,
            image_path=str(image_path) if have_img else "", out_path=str(out),
            progress=lambda p, _m="": store.update(jid, progress=max(5, min(95, int(p)))),
        )
        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("O backend não gerou o .glb.")
        store.update(jid, status="succeeded", progress=100,
                     outputs={"glbUrl": f"/files/{jid}/model.glb"})
    except Exception as e:  # noqa: BLE001
        store.update(jid, status="failed", error=str(e)[:500])
    finally:
        try:
            if image_path.exists():
                image_path.unlink()
        except Exception:
            pass


def _resolve_source(store: Store, source_url: str, dest: Path) -> bool:
    """Resolve a malha de origem do rigging (path /files, URL http, ou caminho)."""
    if not source_url:
        return False
    if source_url.startswith("/files/"):
        src = store.assets / source_url[len("/files/"):]
        if src.exists():
            shutil.copyfile(src, dest)
            return True
        return False
    if source_url.startswith("http://") or source_url.startswith("https://"):
        r = requests.get(source_url, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return dest.stat().st_size > 0
    p = Path(source_url)
    if p.exists():
        shutil.copyfile(p, dest)
        return True
    return False


def run_rig(store: Store, job, source_url: str):
    jid = job["id"]
    job_dir = store.assets / jid
    job_dir.mkdir(parents=True, exist_ok=True)
    src = job_dir / "source.glb"
    out = job_dir / "model.vrm"

    store.update(jid, status="in_progress", progress=5)
    try:
        if not _resolve_source(store, source_url, src):
            raise ValueError("Não consegui obter o modelo de origem para o rigging.")
        store.update(jid, progress=30)

        blender = rigmod.find_blender()
        template = rigmod.find_template()
        cmd = [blender, "-b", "-P", str(rigmod.RIG_SCRIPT), "--",
               "--in", str(src), "--out", str(out)]
        if template:
            cmd += ["--template", template]

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, errors="replace", bufsize=1)
        tail = []
        for raw in proc.stdout:
            line = raw.rstrip()
            tail.append(line)
            if len(tail) > 200:
                tail.pop(0)
            if "PROGRESS:" in line:
                try:
                    pct = int(line.split("PROGRESS:", 1)[1].strip().split()[0])
                    store.update(jid, progress=40 + int(max(0, min(100, pct)) * 0.55))
                except Exception:
                    pass
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(rigmod._extract_error("\n".join(tail))
                               or f"Blender saiu com código {proc.returncode}.")
        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("Blender terminou mas não gerou o .vrm.")
        store.update(jid, status="succeeded", progress=100,
                     outputs={"vrmUrl": f"/files/{jid}/model.vrm"})
    except Exception as e:  # noqa: BLE001
        store.update(jid, status="failed", error=str(e)[:500])
    finally:
        try:
            if src.exists():
                src.unlink()
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────

class GenBody(BaseModel):
    task: str
    prompt: str = ""
    imageDataUrl: str = ""


class RigBody(BaseModel):
    sourceUrl: str = ""


def create_app(data_dir: Path) -> FastAPI:
    store = Store(data_dir)
    app = FastAPI(title="Gerador3D Local Engine")

    def spawn(fn, *args):
        threading.Thread(target=fn, args=args, daemon=True).start()

    @app.get("/api/local/health")
    def health():
        return {"status": "ok", "backend": GEN_BACKEND,
                "blender": rigmod.find_blender(),
                "template": rigmod.find_template() or None,
                "cuda": genbackends.cuda_available()}

    @app.post("/api/local/generate")
    def generate(body: GenBody):
        job = new_job(body.task, prompt=body.prompt, has_image=bool(body.imageDataUrl))
        job["params"]["_imageDataUrl"] = body.imageDataUrl  # transiente, não persistido após uso
        store.put(job)
        spawn(run_generate, store, job)
        return {"jobId": job["id"]}

    @app.post("/api/local/rig")
    def rig(body: RigBody):
        job = new_job("rigging", prompt=body.sourceUrl)
        store.put(job)
        spawn(run_rig, store, job, body.sourceUrl)
        return {"jobId": job["id"]}

    @app.post("/api/local/upload")
    async def upload(file: UploadFile = File(...)):
        is_vrm = file.filename.lower().endswith(".vrm")
        task = "upload"
        job = new_job(task, prompt=f"Upload: {file.filename}")
        job_dir = store.assets / job["id"]
        job_dir.mkdir(parents=True, exist_ok=True)
        name = "model.vrm" if is_vrm else "model.glb"
        (job_dir / name).write_bytes(await file.read())
        job["status"] = "succeeded"
        job["progress"] = 100
        url = f"/files/{job['id']}/{name}"
        job["outputs"] = {"vrmUrl": url} if is_vrm else {"glbUrl": url}
        store.put(job)
        return job

    @app.get("/api/local/jobs")
    def jobs():
        return store.list()

    @app.get("/api/local/jobs/{jid}")
    def job_get(jid: str):
        j = store.get(jid)
        if not j:
            raise HTTPException(404, "Job not found")
        return j

    @app.delete("/api/local/jobs/{jid}")
    def job_delete(jid: str):
        store.delete(jid)
        return {"ok": True}

    # Assets (modelos gerados) em /files
    app.mount("/files", StaticFiles(directory=str(store.assets)), name="files")

    # SPA (catch-all, depois das rotas de API)
    if DIST.exists():
        index = DIST / "index.html"

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            target = DIST / full_path
            if full_path and target.is_file():
                return FileResponse(str(target))
            return FileResponse(str(index))
    else:
        @app.get("/")
        def no_dist():
            return JSONResponse(
                {"error": "frontend/dist-local não encontrado. Rode o build local "
                          "(VITE_LOCAL=true vite build --outDir dist-local)."},
                status_code=500)

    return app


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("GR3D_PORT", "8765")))
    ap.add_argument("--data-dir", default=os.environ.get("GR3D_DATA", ""))
    args = ap.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else _default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    print(f"[engine] dados em {data_dir} | backend={GEN_BACKEND} | porta {args.port}")

    import uvicorn
    uvicorn.run(create_app(data_dir), host="127.0.0.1", port=args.port)


def _default_data_dir() -> Path:
    if os.name == "nt":
        base = os.environ.get("APPDATA", str(Path.home()))
    elif sys.platform == "darwin":
        base = str(Path.home() / "Library" / "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))
    return Path(base) / "Gerador3D"


if __name__ == "__main__":
    main()
