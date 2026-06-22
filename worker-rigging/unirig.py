"""
UniRig (VAST-AI / Tsinghua, SIGGRAPH 2025, MIT) — auto-esqueleto + pesos de
skinning de CORPO inteiro para humanos, animais e CRIATURAS. É a maior lacuna do
projeto (hoje o VRM é só busto) e é creature-friendly por design.
https://github.com/VAST-AI-Research/UniRig

Adaptador atrás de flag: o app envia { method: "unirig" } ao /api/rig e este
módulo roda a inferência do UniRig (repositório clonado localmente) por
subprocess, devolvendo um GLB riggado. Exige GPU + o repo instalado.

Honestidade técnica: aqui está só o FIO DE CONTROLE (deteção do repo, montagem do
comando, progresso, erros claros), coberto por smoke test SEM GPU. A CLI exata e a
qualidade do rig são validadas em máquina com GPU (ver docs/LIGACOES.md). Os nomes
de script/flag são configuráveis por env para casar com a versão instalada.
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def unirig_dir() -> Path | None:
    """Localiza o repositório do UniRig (env UNIRIG_DIR ou pastas vizinhas)."""
    env = os.environ.get("UNIRIG_DIR", "")
    candidates = [Path(env)] if env else []
    candidates += [HERE / "UniRig", HERE.parent / "UniRig"]
    for d in candidates:
        if d and d.exists():
            return d
    return None


def available() -> bool:
    return unirig_dir() is not None


def rig_with_unirig(input_mesh: str, output_path: str, progress=None, params=None) -> None:
    """Roda o UniRig sobre `input_mesh` e grava um GLB riggado em `output_path`.

    Levanta RuntimeError com instrução clara se o UniRig não estiver instalado ou
    se a inferência falhar. `params` aceita {mode} (ex.: 'skeleton'|'skin'|'full').
    """
    params = params or {}
    repo = unirig_dir()
    if repo is None:
        raise RuntimeError(
            "UniRig não encontrado. Clone https://github.com/VAST-AI-Research/UniRig "
            "em worker-rigging/UniRig (ou defina UNIRIG_DIR) e instale as dependências "
            "(PyTorch + requirements do UniRig). Requer GPU. Ver docs/LIGACOES.md.")

    python = os.environ.get("UNIRIG_PYTHON", sys.executable)
    script = os.environ.get("UNIRIG_SCRIPT", "run.py")
    cmd = [python, script, "--input", str(input_mesh), "--output", str(output_path)]
    mode = params.get("mode") or os.environ.get("UNIRIG_MODE", "")
    if mode:
        cmd += ["--mode", str(mode)]

    if progress:
        progress(40, "UniRig: esqueleto + skinning")
    proc = subprocess.Popen(
        cmd, cwd=str(repo), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, errors="replace", bufsize=1,
    )
    tail = []
    for raw in proc.stdout:  # type: ignore[union-attr]
        line = raw.rstrip()
        tail.append(line)
        if len(tail) > 200:
            tail.pop(0)
        print(f"[unirig] {line}", flush=True)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("UniRig falhou: " + (" / ".join(tail[-3:]) or f"código {proc.returncode}"))
    out = Path(output_path)
    if not out.exists() or out.stat().st_size == 0:
        raise RuntimeError("UniRig terminou mas não gerou o arquivo de saída.")
