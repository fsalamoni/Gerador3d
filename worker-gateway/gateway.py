"""
Gerador3D — Gateway local (1 URL para tudo).

Junta o worker de **rigging** (porta 8000) e o de **geração 3D** (porta 8001)
atrás de **uma única porta** (8080). Assim você expõe **um só túnel** e cola
**uma só Base URL** no site — sem precisar trocar a URL conforme a tarefa.

A Cloud Function chama os mesmos caminhos de sempre:
  POST /api/rig         -> encaminha para o worker de rigging
  POST /api/generate    -> encaminha para o worker de geração 3D
  GET  /api/status/{id} -> encaminha para quem criou a tarefa
  GET  /api/health      -> agrega a saúde dos dois workers

Uso:  python gateway.py        (porta 8080; configurável por GATEWAY_PORT)
"""

import os
import requests
from fastapi import FastAPI, Request, HTTPException

RIG_URL = os.environ.get("RIG_URL", "http://localhost:8000").rstrip("/")
GEN_URL = os.environ.get("GEN_URL", "http://localhost:8001").rstrip("/")

app = FastAPI(title="Gerador3D Gateway")
# Lembra qual worker criou cada tarefa, para rotear o /api/status corretamente.
route = {}


def _forward_post(base, path, body):
    r = requests.post(f"{base}{path}", json=body, timeout=30)
    r.raise_for_status()
    return r.json()


@app.post("/api/rig")
async def rig(req: Request):
    body = await req.json()
    try:
        data = _forward_post(RIG_URL, "/api/rig", body)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Worker de rigging indisponível: {exc}")
    if isinstance(data, dict) and data.get("taskId"):
        route[data["taskId"]] = RIG_URL
    return data


@app.post("/api/generate")
async def generate(req: Request):
    body = await req.json()
    try:
        data = _forward_post(GEN_URL, "/api/generate", body)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Worker de geração indisponível: {exc}")
    if isinstance(data, dict) and data.get("taskId"):
        route[data["taskId"]] = GEN_URL
    return data


@app.get("/api/status/{task_id}")
def status(task_id: str):
    targets = [route[task_id]] if task_id in route else [RIG_URL, GEN_URL]
    for base in targets:
        try:
            r = requests.get(f"{base}/api/status/{task_id}", timeout=10)
            if r.status_code == 200:
                return r.json()
        except Exception:
            continue
    raise HTTPException(404, "Task not found")


@app.get("/api/health")
def health():
    def probe(base):
        try:
            r = requests.get(f"{base}/api/health", timeout=5)
            return r.json() if r.status_code == 200 else {"status": "down"}
        except Exception:
            return {"status": "unreachable"}
    return {"status": "ok", "rig": probe(RIG_URL), "gen": probe(GEN_URL)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("GATEWAY_PORT", "8080"))
    print(f"[gateway] rigging={RIG_URL}  gen={GEN_URL}  -> porta {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
