"""Testes do worker de geração 3D (sem modelo real). Rode: python tests/test_gen.py"""
import sys, types
from pathlib import Path
from unittest import mock

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)
OK = []
def check(n, c): print(("PASS" if c else "FAIL"), "-", n); OK.append(bool(c))

IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJrPU4AAAAAElFTkSuQmCC"

def gen_ok(backend_name, task, prompt, image_path, out_path, progress=None, params=None):
    if progress: progress(50, "x")
    Path(out_path).write_bytes(b"GLB" * 30)

def fake_put(calls):
    def f(url, data=None, headers=None, timeout=None):
        calls.append((url, headers)); return types.SimpleNamespace(raise_for_status=lambda: None)
    return f

check("health ok", client.get("/api/health").json().get("status") == "ok")
check("status 404", client.get("/api/status/none").status_code == 404)

calls = []
with mock.patch.object(main.backends, "generate", side_effect=gen_ok), \
     mock.patch.object(main.requests, "put", side_effect=fake_put(calls)):
    tid = "img"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_generate(tid, main.GenRequest(task="image_to_3d", imageDataUrl=IMG, uploadUrl="http://up"))
check("image_to_3d ok", main.jobs["img"]["status"] == "succeeded" and main.jobs["img"]["progress"] == 100)
check("uploaded octet", len(calls) == 1 and calls[0][1].get("Content-Type") == "application/octet-stream")

with mock.patch.object(main.backends, "generate", side_effect=gen_ok), \
     mock.patch.object(main.requests, "put", side_effect=fake_put([])):
    tid = "txt"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_generate(tid, main.GenRequest(task="text_to_3d", prompt="a red car", uploadUrl="http://up"))
check("text_to_3d ok", main.jobs["txt"]["status"] == "succeeded")

tid = "noimg"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
main.process_generate(tid, main.GenRequest(task="image_to_3d", imageDataUrl="", uploadUrl=""))
check("image sem imagem -> failed", main.jobs["noimg"]["status"] == "failed")

tid = "nop"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
main.process_generate(tid, main.GenRequest(task="text_to_3d", prompt="  ", uploadUrl=""))
check("text sem prompt -> failed", main.jobs["nop"]["status"] == "failed")

def boom(*a, **k): raise RuntimeError("CUDA out of memory")
with mock.patch.object(main.backends, "generate", side_effect=boom):
    tid = "boom"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_generate(tid, main.GenRequest(task="image_to_3d", imageDataUrl=IMG, uploadUrl="http://up"))
check("backend error surfaced", main.jobs["boom"]["status"] == "failed" and "CUDA" in (main.jobs["boom"]["error"] or ""))

try:
    main.backends.generate(backend_name="nope", task="image_to_3d", prompt="", image_path="x", out_path="y")
    check("unknown backend raises", False)
except ValueError:
    check("unknown backend raises", True)

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
