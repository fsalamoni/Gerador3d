"""
Gerador3D — Worker local de Rigging Facial (FastAPI + Blender headless).

Fluxo:
  POST /api/rig    → recebe { downloadUrl, uploadUrl } e inicia o job em background.
  GET  /api/status/{taskId} → { status, progress, error? }.
  GET  /api/health → { status, blender, template }.

A Cloud Function (functions/src/index.ts) chama este worker via ngrok:
  - downloadUrl: link assinado de leitura do GLB do usuário (no Storage).
  - uploadUrl  : link assinado de escrita (PUT) onde devolvemos o .vrm gerado.

O processamento real do rigging facial está em rig_script.py (Blender/bpy).
"""

import os
import sys
import subprocess
import uuid
import requests
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

# Importa o módulo irmão de forma ROBUSTA: quando o motor empacotado carrega este
# main.py POR CAMINHO (importlib.exec_module), o diretório dele NÃO entra no
# sys.path e o `import unirig` falha. Garantimos o path e toleramos ausência — o
# app precisa subir normalmente mesmo sem o UniRig (opcional, exige GPU).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import unirig  # adaptador UniRig (esqueleto de corpo) — flag method=unirig
except Exception as _unirig_err:  # noqa: BLE001
    unirig = None
    print(f"[rigging] UniRig indisponivel: {_unirig_err}", flush=True)

for _s in (sys.stdout, sys.stderr):  # logs UTF-8 (evita cp1252 no Windows)
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

app = FastAPI(title="Gerador3D Local Rigging Worker")
jobs = {}

# Caminho deste arquivo para achar o rig_script.py e o template.
HERE = Path(__file__).parent.resolve()
RIG_SCRIPT = HERE / "rig_script.py"


class RigRequest(BaseModel):
    downloadUrl: str
    # Link assinado (PUT) onde devolvemos o resultado. Se vazio, o worker
    # apenas processa e marca sucesso (útil para testes locais).
    uploadUrl: str = ""
    # 'blender' (padrão): rig FACIAL por template (.vrm, busto).
    # 'unirig': esqueleto + skinning de CORPO inteiro (.glb) via UniRig (exige GPU).
    method: str = "blender"
    params: dict = Field(default_factory=dict)


def find_blender() -> str:
    """Encontra o Blender automaticamente no Windows."""
    # 1. Variável de ambiente (configuração manual prioritária).
    env = os.environ.get("BLENDER_PATH", "")
    if env and Path(env).exists():
        return env

    # 2. Caminhos padrão de instalação do Blender (Windows).
    candidates = []
    for base in [r"C:\Program Files\Blender Foundation",
                 r"C:\Program Files (x86)\Blender Foundation"]:
        if Path(base).exists():
            for d in sorted(Path(base).iterdir(), reverse=True):
                if d.is_dir() and d.name.startswith("Blender"):
                    exe = d / "blender.exe"
                    if exe.exists():
                        candidates.append(str(exe))

    # 3. Steam (comum em máquinas gamer).
    steam = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")
    if steam.exists():
        candidates.append(str(steam))

    if candidates:
        print(f"[Blender] Encontrado: {candidates[0]}")
        return candidates[0]

    # 4. Tenta o PATH como último recurso.
    return "blender"


def find_template() -> str:
    """Localiza o template facial (com os 52 shape keys ARKit), se existir."""
    env = os.environ.get("RIG_TEMPLATE_PATH", "")
    if env and Path(env).exists():
        return env
    for ext in (".vrm", ".glb", ".gltf", ".blend"):
        for folder in (HERE, HERE / "templates"):
            p = folder / f"template_face{ext}"
            if p.exists():
                return str(p)
    return ""


BLENDER_EXE = find_blender()


def _set(task_id: str, **kwargs):
    jobs.setdefault(task_id, {})
    jobs[task_id].update(kwargs)


def process_unirig(task_id: str, req: RigRequest):
    """Rig de CORPO inteiro via UniRig (saída GLB riggado). Atrás de method=unirig."""
    if unirig is None:
        _set(task_id, status="failed", error="UniRig indisponível neste pacote.")
        return
    _set(task_id, status="in_progress", progress=5, error=None)
    input_path = HERE / f"{task_id}.glb"
    output_path = HERE / f"{task_id}_rigged.glb"
    try:
        if not req.downloadUrl:
            raise ValueError("downloadUrl ausente: nada para processar.")
        r = requests.get(req.downloadUrl, timeout=120)
        r.raise_for_status()
        input_path.write_bytes(r.content)
        if input_path.stat().st_size == 0:
            raise ValueError("GLB baixado está vazio.")
        _set(task_id, progress=30)

        def prog(pct, _msg=""):
            _set(task_id, progress=max(5, min(95, int(pct))))

        unirig.rig_with_unirig(str(input_path), str(output_path), progress=prog, params=req.params)
        _set(task_id, progress=85)

        if req.uploadUrl:
            with open(output_path, "rb") as f:
                up = requests.put(req.uploadUrl, data=f,
                                  headers={"Content-Type": "application/octet-stream"}, timeout=300)
                up.raise_for_status()
            _set(task_id, progress=95)
        _set(task_id, status="succeeded", progress=100)
        print(f"[{task_id}] UniRig concluído.")
    except requests.HTTPError as e:
        _set(task_id, status="failed", error=f"Falha de rede ({e.response.status_code if e.response else '?'}).")
    except Exception as e:  # noqa: BLE001
        print(f"[{task_id}] Erro (UniRig): {e}")
        _set(task_id, status="failed", error=str(e)[:500])
    finally:
        for p in (input_path, output_path):
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


def process_rigging(task_id: str, req: RigRequest):
    if (req.method or "blender").lower() == "unirig":
        return process_unirig(task_id, req)
    _set(task_id, status="in_progress", progress=5, error=None)
    input_path = HERE / f"{task_id}.glb"
    output_path = HERE / f"{task_id}.vrm"

    try:
        # 1. Baixar o GLB do Storage.
        if not req.downloadUrl:
            raise ValueError("downloadUrl ausente: nada para processar.")
        print(f"[{task_id}] Baixando GLB de origem...")
        r = requests.get(req.downloadUrl, timeout=120)
        r.raise_for_status()
        input_path.write_bytes(r.content)
        if input_path.stat().st_size == 0:
            raise ValueError("GLB baixado está vazio.")
        _set(task_id, progress=30)

        # 2. Executar o Blender headless com o script de rigging real.
        template = find_template()
        print(f"[{task_id}] Executando Blender ({BLENDER_EXE})...")
        blender_cmd = [
            BLENDER_EXE, "-b", "-P", str(RIG_SCRIPT), "--",
            "--in", str(input_path),
            "--out", str(output_path),
        ]
        if template:
            blender_cmd += ["--template", template]
        _set(task_id, progress=40)

        # Streama o stdout do Blender em tempo real para refletir o progresso
        # real (o rig_script emite linhas "PROGRESS: <pct> <msg>"). stderr é
        # mesclado para capturarmos a linha "RIG_ERROR:" em caso de falha.
        proc = subprocess.Popen(
            blender_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            bufsize=1,
        )
        tail = []  # últimas linhas para diagnóstico
        for raw in proc.stdout:
            line = raw.rstrip()
            tail.append(line)
            if len(tail) > 200:
                tail.pop(0)
            print(f"[{task_id}] {line}")
            if "PROGRESS:" in line:
                try:
                    pct = int(line.split("PROGRESS:", 1)[1].strip().split()[0])
                    # Mapeia 0..100 do rig para a faixa 40..80 do worker.
                    _set(task_id, progress=40 + int(max(0, min(100, pct)) * 0.4))
                except Exception:
                    pass
        proc.wait()

        if proc.returncode != 0:
            detail = _extract_error("\n".join(tail))
            raise RuntimeError(detail or f"Blender saiu com código {proc.returncode}.")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("Blender terminou mas não gerou o arquivo de saída.")
        _set(task_id, progress=80)

        # 3. Upload do resultado (se houver URL de upload).
        if req.uploadUrl:
            print(f"[{task_id}] Enviando resultado ({output_path.stat().st_size} bytes)...")
            with open(output_path, "rb") as f:
                up = requests.put(
                    req.uploadUrl,
                    data=f,
                    headers={"Content-Type": "application/octet-stream"},
                    timeout=180,
                )
                up.raise_for_status()
            _set(task_id, progress=95)

        _set(task_id, status="succeeded", progress=100)
        print(f"[{task_id}] Concluído com sucesso!")

    except requests.HTTPError as e:
        msg = f"Falha de rede ({e.response.status_code if e.response else '?'})."
        print(f"[{task_id}] {msg} {e}")
        _set(task_id, status="failed", error=msg)
    except Exception as e:  # noqa: BLE001
        print(f"[{task_id}] Erro: {e}")
        _set(task_id, status="failed", error=str(e)[:500])
    finally:
        # Limpeza dos arquivos locais.
        for p in (input_path, output_path):
            try:
                if p.exists():
                    p.unlink()
            except Exception:
                pass


def _extract_error(text: str) -> str:
    """Extrai a mensagem RIG_ERROR: ... emitida pelo rig_script, se houver."""
    if not text:
        return ""
    for line in text.splitlines():
        if "RIG_ERROR:" in line:
            return line.split("RIG_ERROR:", 1)[1].strip()
    return ""


@app.post("/api/rig")
def start_rig(req: RigRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    jobs[task_id] = {"status": "pending", "progress": 0, "error": None}
    background_tasks.add_task(process_rigging, task_id, req)
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
        "blender": BLENDER_EXE,
        "blender_found": Path(BLENDER_EXE).exists() or BLENDER_EXE == "blender",
        "template": find_template() or None,
        "unirig": bool(unirig and unirig.available()),
    }


if __name__ == "__main__":
    import uvicorn
    print(f"[Worker] Blender detectado em: {BLENDER_EXE}")
    tmpl = find_template()
    print(f"[Worker] Template facial: {tmpl or 'NÃO ENCONTRADO (rigging facial vai falhar)'}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
