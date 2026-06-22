"""Smoke test do adaptador UniRig (sem GPU, sem o repo real).

Mocka subprocess + a deteção do repo para exercitar o FLUXO DE CONTROLE: erro
claro quando o UniRig não está instalado, montagem do comando, deteção de falha
do subprocess, e o roteamento method='unirig' no worker. Rode:
    python tests/test_unirig.py
"""
import os
import sys
import types
from pathlib import Path
from unittest import mock

WORKER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER))

import unirig  # noqa: E402

OK = []
def check(n, c):
    print(("PASS" if c else "FAIL"), "-", n)
    OK.append(bool(c))


class FakeProc:
    def __init__(self, lines, code=0):
        self.stdout = iter(lines)
        self._code = code
        self.returncode = None
    def wait(self):
        self.returncode = self._code


# 1) sem o repo instalado → RuntimeError com instrução clara
with mock.patch.object(unirig, "unirig_dir", return_value=None):
    check("available() False sem repo", unirig.available() is False)
    try:
        unirig.rig_with_unirig("in.glb", "out.glb")
        check("rig sem repo levanta", False)
    except RuntimeError as e:
        check("rig sem repo → RuntimeError", True)
        check("erro cita o repo do UniRig", "UniRig" in str(e) and "github.com" in str(e))

# 2) com repo + subprocess ok → escreve a saída e monta o comando certo
fake_repo = Path(WORKER / "_fake_unirig")
captured = {}
def fake_popen(cmd, cwd=None, **kw):
    captured["cmd"] = cmd
    captured["cwd"] = cwd
    Path(cmd[cmd.index("--output") + 1]).write_bytes(b"GLB" * 50)  # simula saída
    return FakeProc(["loading", "rigging", "done"], code=0)

with mock.patch.object(unirig, "unirig_dir", return_value=fake_repo), \
     mock.patch.object(unirig.subprocess, "Popen", side_effect=fake_popen):
    out = WORKER / "_unirig_out.glb"
    out.unlink(missing_ok=True)
    unirig.rig_with_unirig("in.glb", str(out), params={"mode": "full"})
    check("available() True com repo", unirig.available() is True)
    check("saída gerada (não-vazia)", out.exists() and out.stat().st_size > 0)
    check("comando inclui --input/--output", "--input" in captured["cmd"] and "--output" in captured["cmd"])
    check("comando inclui --mode dos params", "--mode" in captured["cmd"] and "full" in captured["cmd"])
    check("rodou dentro do repo (cwd)", str(captured["cwd"]) == str(fake_repo))
    out.unlink(missing_ok=True)

# 3) subprocess falha (returncode != 0) → RuntimeError
def fail_popen(cmd, cwd=None, **kw):
    return FakeProc(["boom: CUDA error"], code=1)
with mock.patch.object(unirig, "unirig_dir", return_value=fake_repo), \
     mock.patch.object(unirig.subprocess, "Popen", side_effect=fail_popen):
    try:
        unirig.rig_with_unirig("in.glb", str(WORKER / "_nope.glb"))
        check("falha do subprocess levanta", False)
    except RuntimeError:
        check("falha do subprocess → RuntimeError", True)

# 4) main.py roteia method='unirig' para process_unirig
import main  # noqa: E402
routed = {}
def fake_pu(task_id, req):
    routed["called"] = True
    routed["method"] = req.method
with mock.patch.object(main, "process_unirig", side_effect=fake_pu):
    main.process_rigging("t", main.RigRequest(downloadUrl="http://x", method="unirig"))
check("method=unirig roteia para process_unirig", routed.get("called") is True)

# health expõe unirig
with mock.patch.object(main.unirig, "available", return_value=True):
    h = main.health()
check("health expõe unirig", "unirig" in h)

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
