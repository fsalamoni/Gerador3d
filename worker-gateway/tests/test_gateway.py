"""Testes do gateway (mocka requests). Rode: python tests/test_gateway.py"""
import sys, types
from pathlib import Path
from unittest import mock

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))
import gateway  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(gateway.app)
OK = []
def check(n, c): print(("PASS" if c else "FAIL"), "-", n); OK.append(bool(c))

def resp(status=200, js=None):
    return types.SimpleNamespace(status_code=status, json=lambda: js or {},
                                 raise_for_status=lambda: None)

with mock.patch.object(gateway.requests, "post", return_value=resp(200, {"taskId": "RIGID"})) as p:
    r = client.post("/api/rig", json={"downloadUrl": "x"})
check("rig -> RIG_URL + remembers", r.json()["taskId"] == "RIGID"
      and p.call_args[0][0].startswith(gateway.RIG_URL) and gateway.route["RIGID"] == gateway.RIG_URL)

with mock.patch.object(gateway.requests, "post", return_value=resp(200, {"taskId": "GENID"})) as p:
    r = client.post("/api/generate", json={"task": "image_to_3d"})
check("generate -> GEN_URL", r.json()["taskId"] == "GENID" and p.call_args[0][0].startswith(gateway.GEN_URL))

def get_known(url, timeout=None):
    return resp(200, {"status": "succeeded"}) if url.startswith(gateway.RIG_URL) else resp(404, {})
with mock.patch.object(gateway.requests, "get", side_effect=get_known):
    check("status known rig", client.get("/api/status/RIGID").json()["status"] == "succeeded")

def get_unknown(url, timeout=None):
    return resp(200, {"progress": 42}) if url.startswith(gateway.GEN_URL) else resp(404, {})
with mock.patch.object(gateway.requests, "get", side_effect=get_unknown):
    check("status unknown falls back", client.get("/api/status/UNKNOWN").json()["progress"] == 42)

with mock.patch.object(gateway.requests, "get", side_effect=lambda u, timeout=None: resp(404, {})):
    check("status 404", client.get("/api/status/NOPE").status_code == 404)

with mock.patch.object(gateway.requests, "post", side_effect=RuntimeError("down")):
    check("rig down -> 502", client.post("/api/rig", json={}).status_code == 502)

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
