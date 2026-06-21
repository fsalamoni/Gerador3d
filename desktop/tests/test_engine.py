"""Testes do motor local (sem Blender/modelo real). Rode: python tests/test_engine.py"""
import sys, tempfile, importlib.util
from pathlib import Path
from unittest import mock

DESK = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("local_server", str(DESK / "local_server.py"))
ls = importlib.util.module_from_spec(spec); spec.loader.exec_module(ls)
from fastapi.testclient import TestClient  # noqa: E402

OK = []
def check(n, c): print(("PASS" if c else "FAIL"), "-", n); OK.append(bool(c))

data = Path(tempfile.mkdtemp(prefix="gr3d_eng_"))
client = TestClient(ls.create_app(data))
store = ls.Store(data)

check("health ok", client.get("/api/local/health").json().get("status") == "ok")

# upload + serve
r = client.post("/api/local/upload", files={"file": ("a.glb", b"GLB" * 30, "model/gltf-binary")})
job = r.json()
check("upload succeeded", r.status_code == 200 and job["status"] == "succeeded"
      and job["outputs"]["glbUrl"].endswith("model.glb"))
check("file served", client.get(job["outputs"]["glbUrl"]).status_code == 200)
check("jobs list", any(j["id"] == job["id"] for j in client.get("/api/local/jobs").json()))
check("job 404", client.get("/api/local/jobs/nope").status_code == 404)
client.delete(f"/api/local/jobs/{job['id']}")
check("deleted", client.get(f"/api/local/jobs/{job['id']}").status_code == 404)

# generate (mock backend)
def gen_ok(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    if progress: progress(60)
    Path(out_path).write_bytes(b"GLB" * 40)
with mock.patch.object(ls.genbackends, "generate", side_effect=gen_ok):
    j = ls.new_job("text_to_3d", prompt="a red car"); store.put(j); ls.run_generate(store, j)
check("generate succeeded", store.get(j["id"])["status"] == "succeeded")

j = ls.new_job("image_to_3d"); j["params"]["_imageDataUrl"] = ""; store.put(j); ls.run_generate(store, j)
check("image sem imagem -> failed", store.get(j["id"])["status"] == "failed")

# rig (mock Blender)
src = data / "src.glb"; src.write_bytes(b"SRC" * 20)
class FakePopen:
    def __init__(self, cmd, **k):
        self.returncode = 0
        Path(cmd[cmd.index("--out") + 1]).write_bytes(b"VRM" * 40)
        self.stdout = iter(["PROGRESS: 50 x\n", "PROGRESS: 100 y\n"])
    def wait(self): return 0
with mock.patch.object(ls.subprocess, "Popen", lambda cmd, **k: FakePopen(cmd, **k)), \
     mock.patch.object(ls.rigmod, "find_blender", return_value="blender"), \
     mock.patch.object(ls.rigmod, "find_template", return_value=""):
    j = ls.new_job("rigging", prompt=str(src)); store.put(j); ls.run_rig(store, j, str(src))
check("rig succeeded", store.get(j["id"])["status"] == "succeeded"
      and store.get(j["id"])["outputs"]["vrmUrl"].endswith("model.vrm"))

j = ls.new_job("rigging", prompt="/files/none/model.glb"); store.put(j)
ls.run_rig(store, j, "/files/none/model.glb")
check("rig fonte ausente -> failed", store.get(j["id"])["status"] == "failed")

# diagnostics
d = client.get("/api/local/diagnostics").json()
check("diagnostics shape", "rigging" in d and "generation" in d and "ready" in d["generation"])
g = d["generation"]
check("diagnostics expõe GPU/VRAM/recomendação",
      "vramGb" in g and "recommendedBackend" in g and isinstance(g.get("catalog"), dict)
      and "hunyuan" in g)
check("recomendação é um backend conhecido", g["recommendedBackend"] in ls.genbackends._BACKENDS)

# provision generation (mock o runner pesado para nao instalar de verdade)
import threading as _th
def fake_prov(data_dir):
    ls._pset(progress=100, ok=True); ls._plog("mock done"); ls._pset(active=False, done=True)
orig = ls.provision_generation
ls.provision_generation = fake_prov
try:
    r = client.post("/api/local/provision", json={"target": "generation"})
    check("provision start 200", r.status_code == 200)
    import time as _t
    for _ in range(20):
        st = client.get("/api/local/provision/status").json()
        if st["done"]:
            break
        _t.sleep(0.05)
    st = client.get("/api/local/provision/status").json()
    check("provision finished ok", st["done"] and st["ok"])
finally:
    ls.provision_generation = orig

# target invalido -> 400
check("provision target invalido -> 400",
      client.post("/api/local/provision", json={"target": "xpto"}).status_code == 400)

# provision hunyuan (mock o runner pesado) é um target válido
def fake_hunyuan(data_dir):
    ls._pset(progress=100, ok=True); ls._plog("mock hunyuan"); ls._pset(active=False, done=True)
orig_h = ls.provision_hunyuan
ls.provision_hunyuan = fake_hunyuan
try:
    r = client.post("/api/local/provision", json={"target": "hunyuan"})
    check("provision hunyuan start 200", r.status_code == 200)
    import time as _t2
    for _ in range(20):
        if client.get("/api/local/provision/status").json()["done"]:
            break
        _t2.sleep(0.05)
    check("provision hunyuan finished ok", client.get("/api/local/provision/status").json()["ok"])
finally:
    ls.provision_hunyuan = orig_h

# config get/set backend
cfg = client.get("/api/local/config").json()
check("config has backend + list", "backend" in cfg and isinstance(cfg.get("backends"), list))
client.post("/api/local/config", json={"backend": "triposr"})
check("config set persists", client.get("/api/local/config").json()["backend"] == "triposr")

# generate honra params (mock recebe params)
seen = {}
def gen_capture(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    seen["backend"] = backend_name; seen["params"] = params or {}
    Path(out_path).write_bytes(b"GLB" * 10)
with mock.patch.object(ls.genbackends, "generate", side_effect=gen_capture):
    j = ls.new_job("text_to_3d", prompt="carro")
    j["params"]["_genParams"] = {"mcResolution": 512, "removeBg": True}
    j["params"]["_backend"] = "triposr"
    store.put(j); ls.run_generate(store, j)
check("generate passa mcResolution", seen.get("params", {}).get("mcResolution") == 512)
check("generate usa backend escolhido", seen.get("backend") == "triposr")

# regressão: log com caracteres não-ASCII (→, ç, ã) NÃO pode levantar exceção
try:
    ls._plog("Geração 3D instalada! Você já pode gerar texto/imagem → 3D.")
    check("plog é seguro com unicode (→/acentos)", True)
except Exception:
    check("plog é seguro com unicode (→/acentos)", False)

# regressão: backend indisponível (ImportError) cai para TripoSR
def gen_fallback(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    if backend_name == "hunyuan":
        raise ModuleNotFoundError("No module named 'hy3dshape'")
    Path(out_path).write_bytes(b"GLB" * 10)
IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJrPU4AAAAAElFTkSuQmCC"
ls.set_backend(data, "hunyuan")
with mock.patch.object(ls.genbackends, "generate", side_effect=gen_fallback):
    j = ls.new_job("image_to_3d", prompt="x")
    j["params"]["_imageDataUrl"] = IMG
    j["params"]["_backend"] = "hunyuan"
    store.put(j); ls.run_generate(store, j)
check("backend indisponível cai p/ TripoSR", store.get(j["id"])["status"] == "succeeded")
check("config volta p/ triposr", client.get("/api/local/config").json()["backend"] == "triposr")

# regressão: falha de RUNTIME (ex.: GPU sem VRAM) também cai p/ TripoSR, mas
# PRESERVA a escolha do usuário (o erro pode ser transitório).
def gen_runtime_fail(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    if backend_name == "hunyuan-mini":
        raise RuntimeError("CUDA out of memory")
    Path(out_path).write_bytes(b"GLB" * 10)
ls.set_backend(data, "hunyuan-mini")
with mock.patch.object(ls.genbackends, "generate", side_effect=gen_runtime_fail):
    j = ls.new_job("image_to_3d", prompt="y")
    j["params"]["_imageDataUrl"] = IMG
    j["params"]["_backend"] = "hunyuan-mini"
    store.put(j); ls.run_generate(store, j)
check("falha de runtime cai p/ TripoSR", store.get(j["id"])["status"] == "succeeded")
check("falha de runtime preserva backend escolhido",
      client.get("/api/local/config").json()["backend"] == "hunyuan-mini")

# multi-imagem: imagens extras (ângulos) chegam ao backend em params['imagePaths']
ls.set_backend(data, "triposr")
seen_mv = {}
def gen_mv(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    seen_mv["params"] = params or {}
    Path(out_path).write_bytes(b"GLB" * 10)
with mock.patch.object(ls.genbackends, "generate", side_effect=gen_mv):
    j = ls.new_job("image_to_3d", prompt="x")
    j["params"]["_imageDataUrl"] = IMG
    j["params"]["_imageDataUrls"] = [IMG, IMG]  # 2 ângulos extras
    j["params"]["_backend"] = "triposr"
    store.put(j); ls.run_generate(store, j)
check("multi-imagem: frontal + 2 extras chegam como imagePaths",
      len(seen_mv.get("params", {}).get("imagePaths", [])) == 3)

# hunyuan-mini-mv está no catálogo e no dispatcher
check("backend multi-view registrado",
      "hunyuan-mini-mv" in ls.genbackends._BACKENDS
      and ls.genbackends.BACKEND_CATALOG.get("hunyuan-mini-mv", {}).get("multiview") is True)

# regressão: rigging aceita GLB de fallback quando não há .vrm
class GlbFallbackPopen:
    def __init__(self, cmd, **k):
        self.returncode = 0
        out = cmd[cmd.index("--out") + 1]
        Path(Path(out).with_suffix(".glb")).write_bytes(b"GLB" * 40)  # só .glb, sem .vrm
        self.stdout = iter(["[rig] fallback\n", "RIG_OUTPUT: model.glb\n"])
    def wait(self): return 0
src3 = data / "src3.glb"; src3.write_bytes(b"X" * 30)
with mock.patch.object(ls.subprocess, "Popen", lambda cmd, **k: GlbFallbackPopen(cmd, **k)), \
     mock.patch.object(ls.rigmod, "find_blender", return_value="blender"), \
     mock.patch.object(ls.rigmod, "find_template", return_value=""):
    j = ls.new_job("rigging", prompt=str(src3)); store.put(j); ls.run_rig(store, j, str(src3))
jj = store.get(j["id"])
check("rig aceita GLB de fallback", jj["status"] == "succeeded" and jj["outputs"].get("glbUrl", "").endswith("model.glb"))

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
