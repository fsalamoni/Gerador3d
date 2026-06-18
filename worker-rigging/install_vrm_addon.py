"""
Instala e habilita o VRM Add-on no Blender automaticamente (sem cliques).

Executado pelo setup.bat:
    blender -b -P install_vrm_addon.py

Baixa a última release do "VRM Add-on for Blender" do GitHub, instala via
bpy.ops.preferences.addon_install, habilita e salva as preferências.
Se já estiver instalado/habilitado, apenas confirma.
"""

import json
import sys
import tempfile
import urllib.request

import bpy

REPO_API = "https://api.github.com/repos/saturday06/VRM-Addon-for-Blender/releases/latest"
MODULE_CANDIDATES = ("io_scene_vrm", "VRM_Addon_for_Blender")


def log(m):
    print(f"[vrm-install] {m}", flush=True)


def already_enabled():
    try:
        import addon_utils
        for m in addon_utils.modules():
            if m.__name__ in MODULE_CANDIDATES:
                _, loaded = addon_utils.check(m.__name__)
                if loaded:
                    return True
    except Exception:
        pass
    return hasattr(bpy.ops, "vrm") and hasattr(bpy.ops.export_scene, "vrm")


def fetch_zip_url():
    req = urllib.request.Request(REPO_API, headers={"User-Agent": "Gerador3D-setup"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    assets = data.get("assets", [])
    # Prefere um .zip cujo nome cite vrm; senão o primeiro .zip.
    zips = [a for a in assets if a.get("name", "").lower().endswith(".zip")]
    vrm_zips = [a for a in zips if "vrm" in a.get("name", "").lower()]
    chosen = (vrm_zips or zips)
    if not chosen:
        raise RuntimeError("Nenhum .zip encontrado na última release do VRM Add-on.")
    return chosen[0]["browser_download_url"], chosen[0]["name"]


def main():
    if already_enabled():
        log("VRM Add-on já está habilitado. Nada a fazer.")
        return

    url, name = fetch_zip_url()
    log(f"Baixando {name} ...")
    dst = f"{tempfile.gettempdir()}/{name}"
    req = urllib.request.Request(url, headers={"User-Agent": "Gerador3D-setup"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f:
        f.write(r.read())

    log("Instalando no Blender ...")
    bpy.ops.preferences.addon_install(filepath=dst, overwrite=True)

    enabled = False
    for mod in MODULE_CANDIDATES:
        try:
            bpy.ops.preferences.addon_enable(module=mod)
            enabled = True
            log(f"Habilitado: {mod}")
            break
        except Exception as exc:  # noqa: BLE001
            log(f"  ! não habilitou como {mod}: {exc}")

    if not enabled and not already_enabled():
        raise RuntimeError("Instalou mas não consegui habilitar o VRM Add-on.")

    bpy.ops.wm.save_userpref()
    log("Preferências salvas. VRM Add-on pronto!")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"INSTALL_ERROR: {exc}\n")
        sys.exit(1)
