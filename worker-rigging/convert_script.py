"""
Conversão de formato via Blender headless: importa um GLB e exporta FBX/OBJ.

Uso (chamado pelo motor):
  blender -b -P convert_script.py -- --in modelo.glb --out modelo.fbx --fmt fbx

Mantém malha, materiais e (no FBX) os morph targets / esqueleto. OBJ é só
geometria estática. Emite "CONVERT_OK" no fim para o motor confirmar sucesso.
"""
import sys
import argparse

import bpy  # type: ignore


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--fmt", dest="fmt", required=True, choices=["fbx", "obj"])
    a = ap.parse_args(argv)

    # Cena limpa e import do GLB.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.inp)

    if a.fmt == "fbx":
        bpy.ops.export_scene.fbx(
            filepath=a.out,
            add_leaf_bones=False,
            bake_anim=False,
            mesh_smooth_type="FACE",
            path_mode="COPY",
            embed_textures=True,
        )
    else:  # obj
        # Blender 4.x usa wm.obj_export; 3.x usa export_scene.obj.
        try:
            bpy.ops.wm.obj_export(filepath=a.out)
        except Exception:
            bpy.ops.export_scene.obj(filepath=a.out)

    print("CONVERT_OK", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"CONVERT_ERROR: {exc}", flush=True)
        sys.exit(1)
