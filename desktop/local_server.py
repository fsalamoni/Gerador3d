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

# Logs em UTF-8 sempre (no Windows o codec padrão cp1252 não encoda "→", "ç"...,
# o que quebrava prints com UnicodeEncodeError). errors="replace" nunca levanta.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(os.environ.get("GR3D_ENGINE_ROOT") or Path(__file__).resolve().parent.parent)
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
    gen_params = job["params"].pop("_genParams", {}) or {}
    backend = job["params"].pop("_backend", "") or current_backend(store.dir)

    store.update(jid, status="in_progress", progress=5)
    try:
        have_img = _decode_data_url(img, image_path)
        if task == "image_to_3d" and not have_img:
            raise ValueError("image_to_3d requer uma imagem.")
        if task == "text_to_3d" and not prompt.strip():
            raise ValueError("text_to_3d requer um prompt.")
        prog = lambda p, _m="": store.update(jid, progress=max(5, min(95, int(p))))
        gen_kwargs = dict(
            task=task, prompt=prompt,
            image_path=str(image_path) if have_img else "", out_path=str(out),
            progress=prog, params=gen_params,
        )
        try:
            genbackends.generate(backend_name=backend, **gen_kwargs)
        except (ImportError, ModuleNotFoundError) as e:
            # Backend escolhido não instalado (ex.: Hunyuan/TRELLIS) → usa TripoSR.
            if backend != "triposr":
                print(f"[engine] backend '{backend}' indisponível ({e}); usando TripoSR.", flush=True)
                set_backend(store.dir, "triposr")
                store.update(jid, progress=10)
                genbackends.generate(backend_name="triposr", **gen_kwargs)
            else:
                raise
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

        blender = resolve_blender(store.dir) or rigmod.find_blender()
        template = rigmod.find_template()
        cmd = [blender, "-b", "-P", str(rigmod.RIG_SCRIPT), "--",
               "--in", str(src), "--out", str(out)]
        if template:
            cmd += ["--template", template]

        # Usa os scripts (VRM Add-on) provisionados, se houver.
        env = dict(os.environ)
        env["PYTHONUTF8"] = "1"           # rig_script imprime PT acentuado
        env["PYTHONIOENCODING"] = "utf-8"
        cfg = store.dir / "engine_config.json"
        if cfg.exists():
            try:
                bus = json.loads(cfg.read_text("utf-8")).get("blender_user_scripts")
                if bus:
                    env["BLENDER_USER_SCRIPTS"] = bus
            except Exception:
                pass

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, errors="replace", bufsize=1, env=env)
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
        combined = "\n".join(tail)
        # O Blender às vezes retorna 0 mesmo com erro no script; então checamos
        # o RIG_ERROR no log independentemente do código de saída.
        rig_err = rigmod._extract_error(combined)
        if rig_err:
            raise RuntimeError(rig_err)
        if proc.returncode != 0:
            raise RuntimeError(f"Blender saiu com código {proc.returncode}. "
                               f"Log: ...{combined[-400:]}")

        # Saída: VRM (ideal) OU GLB de fallback (quando o VRM addon falha).
        out_glb = job_dir / "model.glb"
        if out.exists() and out.stat().st_size > 0:
            outputs = {"vrmUrl": f"/files/{jid}/model.vrm"}
        elif out_glb.exists() and out_glb.stat().st_size > 0:
            outputs = {"glbUrl": f"/files/{jid}/model.glb"}  # riggado, sem VRM
        else:
            raise RuntimeError("Blender terminou mas não gerou o arquivo. "
                               f"Log: ...{combined[-400:]}")
        store.update(jid, status="succeeded", progress=100, outputs=outputs)
    except Exception as e:  # noqa: BLE001
        store.update(jid, status="failed", error=str(e)[:500])
    finally:
        try:
            if src.exists():
                src.unlink()
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# Diagnóstico + provisionamento (instalar dependências POR DENTRO do app)
# ──────────────────────────────────────────────────────────────────────────────

import importlib.util  # noqa: E402
import zipfile  # noqa: E402
import urllib.request  # noqa: E402

PROVISION = {"active": False, "target": None, "progress": 0,
             "done": False, "ok": False, "error": None, "log": []}
_PLOCK = threading.Lock()
_CUDA_CACHE = {"checked": False, "value": None}

TRIPOSR_ZIP = "https://github.com/VAST-AI-Research/TripoSR/archive/refs/heads/main.zip"
CUDA_INDEX = os.environ.get("TORCH_CUDA_INDEX", "https://download.pytorch.org/whl/cu121")


def _plog(line):
    line = str(line).rstrip()
    with _PLOCK:
        PROVISION["log"].append(line)
        if len(PROVISION["log"]) > 400:
            PROVISION["log"] = PROVISION["log"][-400:]
    try:
        print(f"[provision] {line}", flush=True)
    except Exception:
        pass  # nunca deixa o log derrubar a instalação


def _pset(**kw):
    with _PLOCK:
        PROVISION.update(kw)


def _run(cmd, cwd=None):
    _plog("$ " + " ".join(str(c) for c in cmd))
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
    for raw in proc.stdout:
        _plog(raw)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"comando falhou (código {proc.returncode}): {cmd[0]}")


def _download(url, dest, label=""):
    _plog(f"baixando {label or url} ...")
    with urllib.request.urlopen(url, timeout=600) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)


def provision_generation(data_dir: Path):
    """Instala PyTorch (CUDA) + TripoSR + libs de geração no Python do app."""
    try:
        py = sys.executable
        _pset(progress=5)
        _plog("Instalando PyTorch (CUDA). Isto baixa ~2.5 GB, pode demorar...")
        _run([py, "-m", "pip", "install", "--no-warn-script-location",
              "torch", "torchvision", "--index-url", CUDA_INDEX])
        _pset(progress=45)

        _plog("Instalando libs de geração (diffusers/transformers/accelerate)...")
        _run([py, "-m", "pip", "install", "--no-warn-script-location",
              "diffusers", "transformers", "accelerate"])
        _pset(progress=60)

        tdir = GEN_DIR / "TripoSR"
        if not tdir.exists():
            _plog("Baixando TripoSR (modelo open-source, MIT)...")
            zpath = data_dir / "triposr.zip"
            _download(TRIPOSR_ZIP, zpath, "TripoSR")
            with zipfile.ZipFile(zpath) as z:
                z.extractall(GEN_DIR)
            extracted = GEN_DIR / "TripoSR-main"
            if extracted.exists():
                extracted.rename(tdir)
            try:
                zpath.unlink()
            except Exception:
                pass
        _pset(progress=72)

        # Instala as deps do TripoSR SEM o 'torchmcubes' (que exige compilar C++).
        # No lugar dele usamos o PyMCubes (wheels prontas p/ Windows) — o backend
        # registra um shim em runtime. Também garantimos rembg/onnxruntime.
        req = tdir / "requirements.txt"
        if req.exists():
            lines = [ln.strip() for ln in req.read_text("utf-8").splitlines()]
            # Remove torchmcubes (compila C++ — usamos PyMCubes) e gradio (app web
            # pesado e desnecessário; só usamos a biblioteca `tsr`).
            drop = ("torchmcubes", "gradio")
            keep = [ln for ln in lines
                    if ln and not ln.startswith("#")
                    and not any(d in ln.lower() for d in drop)]
            filtered = tdir / "requirements.gerador3d.txt"
            filtered.write_text("\n".join(keep), "utf-8")
            _plog("Instalando dependências do TripoSR (sem torchmcubes)...")
            _run([py, "-m", "pip", "install", "--no-warn-script-location", "-r", str(filtered)])
        _plog("Instalando PyMCubes + rembg (marching cubes sem compilar)...")
        _run([py, "-m", "pip", "install", "--no-warn-script-location",
              "PyMCubes", "rembg", "onnxruntime"])
        _pset(progress=95)

        _CUDA_CACHE["checked"] = False  # re-checa CUDA depois de instalar o torch
        _pset(progress=100, ok=True)
        _plog("Geração 3D instalada com sucesso! Você já pode gerar texto/imagem → 3D.")
    except Exception as e:  # noqa: BLE001
        _pset(ok=False, error=str(e)[:500])
        _plog(f"ERRO: {e}")
        _plog("Dica: se falhou no 'torchmcubes', instale o Microsoft C++ Build Tools "
              "(Desktop development with C++) e tente de novo.")
    finally:
        _pset(active=False, done=True)


def provision_blender(data_dir: Path):
    """Baixa o Blender portátil + VRM Add-on + template (fallback; o instalador
    completo já traz o Blender embutido)."""
    try:
        _pset(progress=5)
        idx_url = "https://download.blender.org/release/Blender4.2/"
        _plog("Descobrindo a versão do Blender 4.2 LTS...")
        with urllib.request.urlopen(idx_url, timeout=60) as r:
            html = r.read().decode("utf-8", "replace")
        import re
        cands = sorted(set(re.findall(r'blender-4\.2\.\d+-windows-x64\.zip', html)))
        if not cands:
            raise RuntimeError("não encontrei o zip do Blender no índice oficial.")
        zname = cands[-1]
        bdir = data_dir / "blender"
        bdir.mkdir(parents=True, exist_ok=True)
        zpath = data_dir / zname
        _download(idx_url + zname, zpath, zname)
        _pset(progress=55)
        _plog("Extraindo o Blender...")
        with zipfile.ZipFile(zpath) as z:
            z.extractall(data_dir / "bl_tmp")
        inner = next((p for p in (data_dir / "bl_tmp").iterdir() if p.is_dir()), None)
        for item in inner.iterdir():
            dest = bdir / item.name
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True) if dest.is_dir() else dest.unlink()
            shutil.move(str(item), str(bdir))
        shutil.rmtree(data_dir / "bl_tmp", ignore_errors=True)
        try:
            zpath.unlink()
        except Exception:
            pass
        blender_exe = bdir / "blender.exe"
        _pset(progress=75)

        scripts = bdir / "gr3d_scripts"
        scripts.mkdir(exist_ok=True)
        env = {**os.environ, "BLENDER_USER_SCRIPTS": str(scripts)}
        _plog("Instalando o VRM Add-on...")
        subprocess.run([str(blender_exe), "-b", "-P", str(RIG_DIR / "install_vrm_addon.py")],
                       env=env, timeout=600)
        _plog("Gerando o template facial...")
        subprocess.run([str(blender_exe), "-b", "-P", str(RIG_DIR / "make_template.py"),
                        "--", "--out", str(RIG_DIR / "template_face.glb")], env=env, timeout=600)

        cfg = data_dir / "engine_config.json"
        cfg.write_text(json.dumps({"blender": str(blender_exe),
                                   "blender_user_scripts": str(scripts)}), "utf-8")
        _pset(progress=100, ok=True)
        _plog("Blender provisionado com sucesso! Rigging pronto.")
    except Exception as e:  # noqa: BLE001
        _pset(ok=False, error=str(e)[:500])
        _plog(f"ERRO: {e}")
    finally:
        _pset(active=False, done=True)


def resolve_blender(data_dir: Path):
    cfg = data_dir / "engine_config.json"
    if cfg.exists():
        try:
            p = json.loads(cfg.read_text("utf-8")).get("blender")
            if p and Path(p).exists():
                return p
        except Exception:
            pass
    b = rigmod.find_blender()
    if b and b != "blender" and Path(b).exists():
        return b
    return None


def cuda_available_cached():
    if not _CUDA_CACHE["checked"]:
        _CUDA_CACHE["value"] = genbackends.cuda_available()
        _CUDA_CACHE["checked"] = True
    return _CUDA_CACHE["value"]


def diagnostics(data_dir: Path):
    blender = resolve_blender(data_dir)
    template = rigmod.find_template()
    torch_ok = importlib.util.find_spec("torch") is not None
    diffusers_ok = importlib.util.find_spec("diffusers") is not None
    triposr_ok = (GEN_DIR / "TripoSR").exists() or importlib.util.find_spec("tsr") is not None
    return {
        "rigging": {
            "blender": bool(blender),
            "blenderPath": blender,
            "template": bool(template),
            "ready": bool(blender and template),
        },
        "generation": {
            "torch": torch_ok,
            "diffusers": diffusers_ok,
            "triposr": triposr_ok,
            "cuda": cuda_available_cached() if torch_ok else False,
            "ready": bool(torch_ok and triposr_ok),
        },
        "python": sys.executable,
        "backend": current_backend(data_dir),
    }


# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────

class GenBody(BaseModel):
    task: str
    prompt: str = ""
    imageDataUrl: str = ""
    backend: str = ""          # vazio = backend padrão (config/env)
    mcResolution: int = 0      # 0 = padrão; qualidade da malha (256/384/512)
    foregroundRatio: float = 0.0
    removeBg: bool = True
    seed: int = -1


class ProvisionBody(BaseModel):
    target: str  # 'generation' | 'blender'


class ConfigBody(BaseModel):
    backend: str


def current_backend(data_dir: Path) -> str:
    cfg = data_dir / "engine_config.json"
    if cfg.exists():
        try:
            b = json.loads(cfg.read_text("utf-8")).get("backend")
            if b:
                return b
        except Exception:
            pass
    return GEN_BACKEND


def set_backend(data_dir: Path, backend: str):
    cfg = data_dir / "engine_config.json"
    data = {}
    if cfg.exists():
        try:
            data = json.loads(cfg.read_text("utf-8"))
        except Exception:
            data = {}
    data["backend"] = backend
    cfg.write_text(json.dumps(data), "utf-8")


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
                "template": rigmod.find_template() or None}

    @app.get("/api/local/diagnostics")
    def diag():
        return diagnostics(data_dir)

    @app.post("/api/local/provision")
    def provision(body: ProvisionBody):
        if PROVISION["active"]:
            raise HTTPException(409, "Já existe uma instalação em andamento.")
        target = body.target
        fn = {"generation": provision_generation, "blender": provision_blender}.get(target)
        if not fn:
            raise HTTPException(400, "target inválido (use 'generation' ou 'blender').")
        with _PLOCK:
            PROVISION.update({"active": True, "target": target, "progress": 0,
                              "done": False, "ok": False, "error": None, "log": []})
        spawn(fn, data_dir)
        return {"ok": True, "target": target}

    @app.get("/api/local/provision/status")
    def provision_status():
        with _PLOCK:
            return dict(PROVISION)

    @app.post("/api/local/generate")
    def generate(body: GenBody):
        job = new_job(body.task, prompt=body.prompt, has_image=bool(body.imageDataUrl))
        params = {"removeBg": body.removeBg}
        if body.mcResolution:
            params["mcResolution"] = int(body.mcResolution)
        if body.foregroundRatio:
            params["foregroundRatio"] = float(body.foregroundRatio)
        if body.seed is not None and body.seed >= 0:
            params["seed"] = int(body.seed)
        job["params"]["_imageDataUrl"] = body.imageDataUrl  # transiente
        job["params"]["_genParams"] = params
        job["params"]["_backend"] = body.backend or current_backend(data_dir)
        store.put(job)
        spawn(run_generate, store, job)
        return {"jobId": job["id"]}

    @app.get("/api/local/config")
    def get_config():
        return {"backend": current_backend(data_dir), "backends": list(genbackends._BACKENDS)}

    @app.post("/api/local/config")
    def post_config(body: ConfigBody):
        set_backend(data_dir, body.backend)
        return {"ok": True, "backend": body.backend}

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
