import os
import subprocess
import uuid
import sys
import requests
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Gerador3D Local Rigging Worker")
jobs = {}

# Caminho deste arquivo para achar o rig_script.py
HERE = Path(__file__).parent.resolve()

class RigRequest(BaseModel):
    downloadUrl: str
    uploadUrl: str = ""  # optional — if empty, worker just processes and returns success

def find_blender() -> str:
    """Encontra o Blender automaticamente no Windows."""
    # 1. Variável de ambiente (configuração manual prioritária)
    env = os.environ.get("BLENDER_PATH", "")
    if env and Path(env).exists():
        return env

    # 2. Caminhos padrão de instalação do Blender (Windows)
    candidates = []
    # Blender via Microsoft Store ou instalador padrão
    for base in [r"C:\Program Files\Blender Foundation", r"C:\Program Files (x86)\Blender Foundation"]:
        if Path(base).exists():
            for d in sorted(Path(base).iterdir(), reverse=True):
                if d.is_dir() and d.name.startswith("Blender"):
                    exe = d / "blender.exe"
                    if exe.exists():
                        candidates.append(str(exe))

    # 3. Steam (comum em máquinas gamer)
    steam = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe")
    if steam.exists():
        candidates.append(str(steam))

    if candidates:
        print(f"[Blender] Encontrado: {candidates[0]}")
        return candidates[0]

    # 4. Tenta o PATH como último recurso
    return "blender"

BLENDER_EXE = find_blender()

def process_rigging(task_id: str, req: RigRequest):
    jobs[task_id] = {"status": "in_progress", "progress": 10}
    input_path = str(HERE / f"{task_id}.glb")
    output_path = str(HERE / f"{task_id}.vrm")
    rig_script = str(HERE / "rig_script.py")
    
    try:
        # 1. Baixar o GLB do Storage
        print(f"[{task_id}] Fazendo download do GLB...")
        r = requests.get(req.downloadUrl)
        r.raise_for_status()
        with open(input_path, 'wb') as f:
            f.write(r.content)
            
        jobs[task_id]["progress"] = 30

        # 2. Executar o Blender de forma invisível
        print(f"[{task_id}] Executando Blender Headless ({BLENDER_EXE})...")
        blender_cmd = [
            BLENDER_EXE, "-b", "-P", rig_script, "--",
            "--in", input_path, "--out", output_path
        ]
        subprocess.run(blender_cmd, check=True, capture_output=True)
        
        jobs[task_id]["progress"] = 80

        # 3. Upload se tiver URL, senão apenas marca como sucesso
        if req.uploadUrl:
            print(f"[{task_id}] Fazendo upload do resultado...")
            with open(output_path, 'rb') as f:
                up_req = requests.put(
                    req.uploadUrl, 
                    data=f, 
                    headers={"Content-Type": "application/octet-stream"}
                )
                up_req.raise_for_status()
        
        jobs[task_id]["progress"] = 100
        jobs[task_id]["status"] = "succeeded"
        print(f"[{task_id}] Concluído com sucesso!")

    except subprocess.CalledProcessError as e:
        print(f"[{task_id}] Erro no Blender: {e.stderr.decode()}")
        jobs[task_id]["status"] = "failed"
    except Exception as e:
        print(f"[{task_id}] Erro: {e}")
        jobs[task_id]["status"] = "failed"
    finally:
        # Limpeza dos arquivos locais
        for p in [input_path, output_path]:
            try:
                if os.path.exists(p): os.remove(p)
            except Exception:
                pass

@app.post("/api/rig")
def start_rig(req: RigRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(process_rigging, task_id, req)
    return {"taskId": task_id}

@app.get("/api/status/{task_id}")
def get_status(task_id: str):
    if task_id not in jobs:
        raise HTTPException(status_code=404, detail="Task not found")
    return jobs[task_id]

@app.get("/api/health")
def health():
    return {"status": "ok", "blender": BLENDER_EXE}

if __name__ == "__main__":
    import uvicorn
    print(f"[Worker] Blender detectado em: {BLENDER_EXE}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
