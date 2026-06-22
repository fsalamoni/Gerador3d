"""Testes do caminho de TEXTURIZAÇÃO (Hunyuan3D-Paint) sem GPU nem modelos reais.

Mocka `trimesh` e os módulos de paint (2.1: `textureGenPipeline`; 2.0: `hy3dgen.texgen`)
injetando fakes em sys.modules, e exercita só o FLUXO DE CONTROLE: detecção de layout,
fallbacks, erro claro quando nada está disponível, `texture_mesh` (malha existente) e a
task `texture_mesh` no main.py — além de garantir que `params` finalmente chega à geração.

Rode: python tests/test_paint.py
"""
import sys
import types
import tempfile
from pathlib import Path
from unittest import mock

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))

import backends  # imports de topo são leves (sem torch/trimesh)  # noqa: E402
import main  # noqa: E402

OK = []
def check(n, c):
    print(("PASS" if c else "FAIL"), "-", n)
    OK.append(bool(c))


# ── fakes ─────────────────────────────────────────────────────────────────────
class FakeMesh:
    def __init__(self, tag="mesh"):
        self.tag = tag
    def export(self, path, *a, **k):
        Path(path).write_bytes(b"GLB" * 20)
        return path


def make_fake_trimesh():
    m = types.ModuleType("trimesh")
    m.load = lambda path, force=None, **k: FakeMesh(tag=f"loaded:{path}")
    return m


def fake_hy3dgen_texgen(record):
    pkg = types.ModuleType("hy3dgen")
    pkg.__path__ = []
    sub = types.ModuleType("hy3dgen.texgen")

    class Hunyuan3DPaintPipeline:
        @classmethod
        def from_pretrained(cls, model):
            record["from_pretrained"] = model
            return cls()
        def __call__(self, mesh, image=None):
            record["v2_call"] = (getattr(mesh, "tag", mesh), image)
            return FakeMesh("painted_v2")

    sub.Hunyuan3DPaintPipeline = Hunyuan3DPaintPipeline
    pkg.texgen = sub
    return pkg, sub


def fake_textureGenPipeline(record):
    m = types.ModuleType("textureGenPipeline")

    class Hunyuan3DPaintConfig:
        def __init__(self, max_views=6, res=512):
            record["conf"] = (max_views, res)

    class Hunyuan3DPaintPipeline:
        def __init__(self, conf):
            record["built"] = True
        def __call__(self, mesh_path, image_path=None, output_mesh_path=None):
            record["v21_call"] = (mesh_path, image_path, output_mesh_path)
            Path(output_mesh_path).write_bytes(b"OBJ" * 10)
            return output_mesh_path

    m.Hunyuan3DPaintConfig = Hunyuan3DPaintConfig
    m.Hunyuan3DPaintPipeline = Hunyuan3DPaintPipeline
    return m


def reset():
    backends._MODELS.clear()
    for name in ("hy3dgen", "hy3dgen.texgen", "textureGenPipeline", "trimesh"):
        sys.modules.pop(name, None)


# ── 1) layout 2.0 (hy3dgen.texgen) ──────────────────────────────────────────────
reset()
rec = {}
pkg, sub = fake_hy3dgen_texgen(rec)
sys.modules["hy3dgen"] = pkg
sys.modules["hy3dgen.texgen"] = sub
out = backends.paint_texture(FakeMesh("orig"), "ref.png", {}, None, cache_key="t1")
check("v2: layout detectado", backends._MODELS["t1"][0] == "v2")
check("v2: modelo padrão tencent/Hunyuan3D-2", rec.get("from_pretrained") == "tencent/Hunyuan3D-2")
check("v2: pinta direto na malha com a imagem", rec.get("v2_call", (None, None))[1] == "ref.png")
check("v2: devolve malha texturizada", getattr(out, "tag", "") == "painted_v2")

# ── 2) layout 2.1 (hy3dpaint/textureGenPipeline), preferido ─────────────────────
reset()
rec = {}
sys.modules["textureGenPipeline"] = fake_textureGenPipeline(rec)
sys.modules["trimesh"] = make_fake_trimesh()
out = backends.paint_texture(FakeMesh("orig21"), "ref.png",
                             {"maxViews": 4, "textureResolution": 256}, None, cache_key="t2")
check("v21: layout detectado (preferido)", backends._MODELS["t2"][0] == "v21")
check("v21: config vem dos params", rec.get("conf") == (4, 256))
check("v21: chamado por caminhos com a imagem", rec.get("v21_call", (None, None))[1] == "ref.png")
check("v21: recarrega resultado via trimesh", str(getattr(out, "tag", "")).startswith("loaded:"))

# ── 3) preferência: com AMBOS disponíveis, escolhe 2.1 ──────────────────────────
reset()
rec1, rec2 = {}, {}
pkg, sub = fake_hy3dgen_texgen(rec1)
sys.modules["hy3dgen"] = pkg
sys.modules["hy3dgen.texgen"] = sub
sys.modules["textureGenPipeline"] = fake_textureGenPipeline(rec2)
sys.modules["trimesh"] = make_fake_trimesh()
backends.paint_texture(FakeMesh(), "ref.png", {}, None, cache_key="t3")
check("ambos: prioriza 2.1", backends._MODELS["t3"][0] == "v21" and "v2_call" not in rec1)

# ── 4) nada disponível → RuntimeError com instrução clara ───────────────────────
reset()
try:
    backends.paint_texture(FakeMesh(), "ref.png", {}, None, cache_key="t4")
    check("sem pipeline: levanta", False)
except RuntimeError as e:
    msg = str(e)
    check("sem pipeline: RuntimeError", True)
    check("erro cita os dois layouts", "hy3dpaint" in msg and "hy3dgen.texgen" in msg)

# ── 5) sem imagem → ValueError ──────────────────────────────────────────────────
reset()
try:
    backends.paint_texture(FakeMesh(), "", {}, None, cache_key="t5")
    check("sem imagem: levanta", False)
except ValueError:
    check("sem imagem: ValueError", True)

# ── 6) texture_mesh: malha existente → carrega, pinta (v2), exporta ─────────────
reset()
rec = {}
pkg, sub = fake_hy3dgen_texgen(rec)
sys.modules["hy3dgen"] = pkg
sys.modules["hy3dgen.texgen"] = sub
sys.modules["trimesh"] = make_fake_trimesh()
outp = str(Path(tempfile.gettempdir()) / "gr3d_tm_out.glb")
Path(outp).unlink(missing_ok=True)
backends.texture_mesh("in.glb", "ref.png", outp, None, {})
check("texture_mesh: exporta .glb não-vazio", Path(outp).exists() and Path(outp).stat().st_size > 0)
Path(outp).unlink(missing_ok=True)

# ── 7) main.py: task texture_mesh (mockando backend + rede) ─────────────────────
IMG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
       "+M8AAAMCAQDJrPU4AAAAAElFTkSuQmCC")

def tex_ok(mesh_path, image_path, out_path, progress=None, params=None):
    if progress:
        progress(50)
    Path(out_path).write_bytes(b"GLB" * 30)

calls = []
def fake_put(url, data=None, headers=None, timeout=None):
    calls.append((url, headers))
    return types.SimpleNamespace(raise_for_status=lambda: None)

def fake_get(url, timeout=None):
    return types.SimpleNamespace(raise_for_status=lambda: None, content=b"MESHBYTES")

with mock.patch.object(main.backends, "texture_mesh", side_effect=tex_ok), \
     mock.patch.object(main.requests, "put", side_effect=fake_put), \
     mock.patch.object(main.requests, "get", side_effect=fake_get):
    tid = "tex"
    main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_generate(tid, main.GenRequest(
        task="texture_mesh", imageDataUrl=IMG, meshUrl="http://mesh",
        uploadUrl="http://up", params={"texture": True}))
check("texture_mesh job: succeeded", main.jobs["tex"]["status"] == "succeeded")
check("texture_mesh job: subiu o glb", len(calls) == 1)

# malha ausente → failed
tid = "texno"
main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
main.process_generate(tid, main.GenRequest(task="texture_mesh", imageDataUrl=IMG, uploadUrl=""))
check("texture_mesh sem malha -> failed", main.jobs["texno"]["status"] == "failed")

# imagem ausente → failed
tid = "teximg"
main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
main.process_generate(tid, main.GenRequest(task="texture_mesh", meshDataUrl=IMG, imageDataUrl="", uploadUrl=""))
check("texture_mesh sem imagem -> failed", main.jobs["teximg"]["status"] == "failed")

# ── 8) params chega à geração (a flag de textura estava inacessível antes) ──────
seen = {}
def gen_spy(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    seen["params"] = params
    Path(out_path).write_bytes(b"GLB" * 30)

with mock.patch.object(main.backends, "generate", side_effect=gen_spy), \
     mock.patch.object(main.requests, "put", side_effect=fake_put):
    tid = "p"
    main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_generate(tid, main.GenRequest(
        task="image_to_3d", imageDataUrl=IMG, uploadUrl="http://up",
        params={"texture": True, "seed": 7}))
check("params repassados à geração",
      seen.get("params", {}).get("texture") is True and seen["params"].get("seed") == 7)

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
