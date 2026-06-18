import os
import subprocess
import uuid
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Gerador3D Local Rigging Worker")
jobs = {}

class RigRequest(BaseModel):
    downloadUrl: str
    uploadUrl: str = ""  # optional — if empty, worker just processes and returns success

def process_rigging(task_id: str, req: RigRequest):
    jobs[task_id] = {"status": "in_progress", "progress": 10}
    input_path = f"{task_id}.glb"
    output_path = f"{task_id}.vrm"
    
    try:
        # 1. Baixar o GLB do Storage
        print(f"[{task_id}] Fazendo download do GLB...")
        r = requests.get(req.downloadUrl)
        r.raise_for_status()
        with open(input_path, 'wb') as f:
            f.write(r.content)
            
        jobs[task_id]["progress"] = 30

        # 2. Executar o Blender de forma invisível
        print(f"[{task_id}] Executando Blender Headless...")
        blender_exe = os.environ.get("BLENDER_PATH", "blender")
        blender_cmd = [
            blender_exe, "-b", "-P", "rig_script.py", "--",
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
        if os.path.exists(input_path): os.remove(input_path)
        if os.path.exists(output_path): os.remove(output_path)

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

if __name__ == "__main__":
    import uvicorn
    # Roda o servidor na porta 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)
