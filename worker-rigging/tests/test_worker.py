"""Testes do worker de rigging (sem Blender real). Rode: python tests/test_worker.py"""
import os, sys, types
from pathlib import Path
from unittest import mock

WORKER = Path(__file__).resolve().parents[1]
os.environ["BLENDER_PATH"] = sys.executable
sys.path.insert(0, str(WORKER))

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)
OK = []
def check(n, c): print(("PASS" if c else "FAIL"), "-", n); OK.append(bool(c))


class FakePopen:
    def __init__(self, cmd, lines, rc, make_output=True):
        self.returncode = rc
        if make_output and "--out" in cmd:
            Path(cmd[cmd.index("--out") + 1]).write_bytes(b"FAKEVRM" * 20)
        self.stdout = iter(lines)
    def wait(self): return self.returncode

def popen_factory(lines, rc, make_output=True):
    return lambda cmd, **kw: FakePopen(cmd, lines, rc, make_output)

def fake_put(calls):
    def f(url, data=None, headers=None, timeout=None):
        calls.append((url, headers)); return types.SimpleNamespace(raise_for_status=lambda: None)
    return f

def fake_get(url, timeout=None):
    return types.SimpleNamespace(content=b"GLB" * 10, raise_for_status=lambda: None)

ok_lines = ["[rig] start\n", "PROGRESS: 5 a\n", "PROGRESS: 80 b\n", "PROGRESS: 100 c\n"]

check("health 200", client.get("/api/health").status_code == 200)
check("status 404", client.get("/api/status/none").status_code == 404)
check("_extract_error", main._extract_error("x\nRIG_ERROR: faltou\n") == "faltou")

calls = []
with mock.patch.object(main.subprocess, "Popen", popen_factory(ok_lines, 0)), \
     mock.patch.object(main.requests, "get", side_effect=fake_get), \
     mock.patch.object(main.requests, "put", side_effect=fake_put(calls)):
    tid = "ok"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_rigging(tid, main.RigRequest(downloadUrl="http://x/m.glb", uploadUrl="http://up"))
check("success", main.jobs["ok"]["status"] == "succeeded" and main.jobs["ok"]["progress"] == 100)
check("uploaded octet", len(calls) == 1 and calls[0][1].get("Content-Type") == "application/octet-stream")
check("temp cleaned", not (main.HERE / "ok.glb").exists() and not (main.HERE / "ok.vrm").exists())

fail_lines = ["RIG_ERROR: Template facial nao encontrado.\n"]
with mock.patch.object(main.subprocess, "Popen", popen_factory(fail_lines, 1, make_output=False)), \
     mock.patch.object(main.requests, "get", side_effect=fake_get):
    tid = "fail"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_rigging(tid, main.RigRequest(downloadUrl="http://x/m.glb", uploadUrl="http://up"))
check("fail surfaces error", main.jobs["fail"]["status"] == "failed"
      and main.jobs["fail"]["error"] == "Template facial nao encontrado.")

tid = "empty"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
main.process_rigging(tid, main.RigRequest(downloadUrl="", uploadUrl=""))
check("empty downloadUrl -> failed", main.jobs["empty"]["status"] == "failed")

with mock.patch.object(main.subprocess, "Popen", popen_factory(["done\n"], 0, make_output=False)), \
     mock.patch.object(main.requests, "get", side_effect=fake_get):
    tid = "noout"; main.jobs[tid] = {"status": "pending", "progress": 0, "error": None}
    main.process_rigging(tid, main.RigRequest(downloadUrl="http://x/m.glb", uploadUrl="http://up"))
check("missing output -> failed", main.jobs["noout"]["status"] == "failed")

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
