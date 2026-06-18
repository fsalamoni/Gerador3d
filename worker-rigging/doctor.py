"""
Gerador3D — Diagnóstico ("o que está faltando?").

Roda uma checagem rápida do ambiente local e diz, em português claro, o que
está OK e o que precisa ser resolvido. Pensado para leigos.

Uso:  python doctor.py
"""

import os
import sys
import shutil
import platform
from pathlib import Path

HERE = Path(__file__).parent.resolve()
ROOT = HERE.parent

OKMARK, BAD, WARN = "[ OK ]", "[FALTA]", "[ ? ]"


def line(mark, msg, hint=""):
    print(f"{mark} {msg}")
    if hint and mark != OKMARK:
        print(f"        -> {hint}")


def find_blender():
    env = os.environ.get("BLENDER_PATH", "")
    if env and Path(env).exists():
        return env
    base = Path(r"C:\Program Files\Blender Foundation")
    if base.exists():
        for d in sorted(base.iterdir(), reverse=True):
            exe = d / "blender.exe"
            if exe.exists():
                return str(exe)
    return shutil.which("blender")


def reachable(url):
    import urllib.request
    try:
        with urllib.request.urlopen(url, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    print("\n=== Gerador3D — Diagnóstico ===\n")
    print(f"Sistema: {platform.system()} {platform.release()}  |  Python {platform.python_version()}\n")

    # Python (já está rodando)
    line(OKMARK, f"Python disponível ({sys.executable})")

    # Blender
    bl = find_blender()
    if bl:
        line(OKMARK, f"Blender encontrado: {bl}")
    else:
        line(BAD, "Blender não encontrado",
             "Instale o Blender 4.0+ ou defina BLENDER_PATH.")

    # Dependências Python do worker de rigging
    try:
        import fastapi, uvicorn, requests  # noqa: F401
        line(OKMARK, "Dependências Python do worker (fastapi/uvicorn/requests)")
    except Exception:
        line(BAD, "Dependências Python ausentes",
             "Rode: pip install -r requirements.txt (na pasta worker-rigging)")

    # Template facial
    tmpl = None
    for ext in (".glb", ".vrm", ".gltf", ".blend"):
        p = HERE / f"template_face{ext}"
        if p.exists():
            tmpl = p
            break
    if tmpl:
        line(OKMARK, f"Template facial: {tmpl.name}")
    else:
        line(BAD, "template_face.glb não encontrado",
             "Rode setup.bat, ou: blender -b -P make_template.py -- --out template_face.glb")

    # Túnel (cloudflared/ngrok)
    tun = shutil.which("cloudflared") or shutil.which("ngrok") \
        or next((str(p) for p in [HERE / "cloudflared.exe", HERE / "ngrok.exe"] if p.exists()), None)
    if tun:
        line(OKMARK, f"Túnel disponível: {tun}")
    else:
        line(BAD, "Nenhum túnel (cloudflared/ngrok)",
             "Rode setup.bat (baixa o cloudflared) ou instale o ngrok.")

    # Workers / gateway rodando?
    print("\n-- Serviços (rode start.bat / start_all.bat para ligá-los) --")
    for name, url in [
        ("Worker de Rigging (8000)", "http://localhost:8000/api/health"),
        ("Worker de Geração (8001)", "http://localhost:8001/api/health"),
        ("Gateway (8080)", "http://localhost:8080/api/health"),
    ]:
        line(OKMARK if reachable(url) else WARN, name,
             "Não está rodando (normal se você não usa este).")

    print("\nDica: exponha o gateway (8080) com 1 túnel e cole a URL no site.\n")


if __name__ == "__main__":
    main()
