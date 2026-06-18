"""
Gerador3D — Gerador de "template_face.glb" (template facial ARKit inicial).

Cria uma malha de cabeça com os **52 shape keys ARKit** nomeados e com
deformações *plausíveis* por região (mandíbula, olhos, sorriso, sobrancelhas,
bochechas, lábios...). O objetivo é DESTRAVAR o pipeline de rigging
(`rig_script.py`) de ponta a ponta sem você precisar caçar um template pronto.

    blender -b -P make_template.py -- --out template_face.glb [--segments 64]

Depois é só deixar o `template_face.glb` na pasta `worker-rigging/`.

IMPORTANTE — isto é um STARTER, não um asset de produção:
  - A geometria é uma cabeça aproximada (esferoide), então as expressões são
    aproximadas, não anatomicamente perfeitas. Serve para validar o fluxo e ver
    o avatar reagir ao rosto. Para qualidade final, substitua por um head ARKit
    profissional (mesmos nomes de morph target).
  - Convenção de eixos (Blender): Z para cima, +Y para frente (o rosto fica no
    hemisfério +Y). O exportador glTF converte para Y-up/+Z-forward. Se o
    template ficar "de costas" para o seu avatar, gire-o 180° no Blender.
"""

import os
import sys
import argparse
from math import exp

import bpy
from mathutils import Vector


# Os 52 nomes ARKit (lowerCamel) — mesma convenção do rig_script.py / MediaPipe.
ARKIT_SHAPES = [
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft",
    "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
    "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen",
    "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft",
    "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower",
    "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft",
    "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
    "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
    "tongueOut",
]


def log(msg):
    print(f"[template] {msg}", flush=True)


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser(description="Gera um template_face.glb ARKit")
    p.add_argument("--out", dest="out", required=True, help="Saída .glb/.gltf")
    p.add_argument("--segments", type=int, default=64,
                   help="Resolução da esfera (mais = mais suave). Padrão 64.")
    return p.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def build_head(segments):
    """Cria uma cabeça esferoide (Z para cima, +Y para frente) e aplica a escala."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=max(16, segments // 2), radius=0.11)
    obj = bpy.context.active_object
    obj.name = "FaceTemplate"
    # Proporções de cabeça: um pouco mais estreita que alta, com profundidade.
    obj.scale = (0.92, 0.98, 1.18)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    return obj


def gauss(co, center, sigma):
    d2 = (co - center).length_squared
    return exp(-d2 / (2.0 * sigma * sigma))


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def expression_offset(name, co, H, C, S):
    """Devolve o deslocamento (Vector) do vértice `co` para a expressão `name`.

    H = meia-extensão (hx,hy,hz); C = dict de centros de região; S = escala base.
    Eixos: x=esquerda(+)/direita(-), y=frente(+), z=cima(+).
    """
    hx, hy, hz = H.x, H.y, H.z
    off = Vector((0.0, 0.0, 0.0))

    # Pesos de região reaproveitados.
    front = clamp01(co.y / (0.6 * hy))                      # 0 atrás → 1 na frente
    lower = clamp01((C["mouth"].z - co.z) / (0.9 * hz)) * front  # parte de baixo/frente
    sig_eye, sig_mouth = 0.16 * S, 0.20 * S
    sig_brow, sig_cheek = 0.17 * S, 0.24 * S

    # ── Mandíbula ──────────────────────────────────────────────────────────────
    if name == "jawOpen":
        off.z -= 0.20 * hz * lower
        off.y += 0.03 * hy * lower
    elif name == "jawForward":
        off.y += 0.10 * hy * lower
    elif name == "jawLeft":
        off.x += 0.10 * hx * lower
    elif name == "jawRight":
        off.x -= 0.10 * hx * lower

    # ── Boca: abertura/forma ─────────────────────────────────────────────────────
    elif name == "mouthClose":
        off.z += 0.06 * hz * gauss(co, C["mouth"], sig_mouth)
    elif name == "mouthFunnel":
        w = gauss(co, C["mouth"], sig_mouth)
        off.y += 0.10 * hy * w
        off.z -= 0.03 * hz * w
    elif name == "mouthPucker":
        w = gauss(co, C["mouth"], sig_mouth)
        off.y += 0.12 * hy * w
        off.x += (C["mouth"].x - co.x) * 0.5 * w
    elif name in ("mouthLeft", "mouthRight"):
        w = gauss(co, C["mouth"], sig_mouth * 1.2)
        off.x += (0.09 * hx * w) * (1 if name == "mouthLeft" else -1)
    elif name == "mouthShrugUpper":
        off.z += 0.05 * hz * gauss(co, C["mouth"] + Vector((0, 0, 0.08 * hz)), sig_mouth)
    elif name == "mouthShrugLower":
        off.z += 0.05 * hz * gauss(co, C["mouth"] - Vector((0, 0, 0.08 * hz)), sig_mouth)
    elif name == "mouthRollUpper":
        off.y -= 0.04 * hy * gauss(co, C["mouth"] + Vector((0, 0, 0.05 * hz)), sig_mouth)
    elif name == "mouthRollLower":
        off.y -= 0.04 * hy * gauss(co, C["mouth"] - Vector((0, 0, 0.05 * hz)), sig_mouth)

    # ── Boca: cantos (sorriso, tristeza, esticar, covinha) ──────────────────────
    elif name in ("mouthSmileLeft", "mouthSmileRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        w = gauss(co, ctr, sig_mouth)
        off.z += 0.10 * hz * w
        off.x += (0.05 * hx * w) * (1 if name.endswith("Left") else -1)
    elif name in ("mouthFrownLeft", "mouthFrownRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        off.z -= 0.09 * hz * gauss(co, ctr, sig_mouth)
    elif name in ("mouthStretchLeft", "mouthStretchRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        w = gauss(co, ctr, sig_mouth)
        off.x += (0.09 * hx * w) * (1 if name.endswith("Left") else -1)
        off.z -= 0.02 * hz * w
    elif name in ("mouthDimpleLeft", "mouthDimpleRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        off.y -= 0.05 * hy * gauss(co, ctr, sig_mouth * 0.8)
    elif name in ("mouthPressLeft", "mouthPressRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        off.z += 0.03 * hz * gauss(co, ctr, sig_mouth * 0.8)

    # ── Boca: lábios superior/inferior ──────────────────────────────────────────
    elif name in ("mouthUpperUpLeft", "mouthUpperUpRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        off.z += 0.07 * hz * gauss(co, ctr + Vector((0, 0, 0.05 * hz)), sig_mouth)
    elif name in ("mouthLowerDownLeft", "mouthLowerDownRight"):
        ctr = C["mouthL"] if name.endswith("Left") else C["mouthR"]
        off.z -= 0.07 * hz * gauss(co, ctr - Vector((0, 0, 0.05 * hz)), sig_mouth)

    # ── Olhos: piscar / apertar / arregalar ─────────────────────────────────────
    elif name in ("eyeBlinkLeft", "eyeBlinkRight"):
        ctr = C["eyeL"] if name.endswith("Left") else C["eyeR"]
        w = gauss(co, ctr, sig_eye)
        if co.z > ctr.z:  # pálpebra superior desce
            off.z -= 0.9 * (co.z - ctr.z) * w
    elif name in ("eyeSquintLeft", "eyeSquintRight"):
        ctr = C["eyeL"] if name.endswith("Left") else C["eyeR"]
        w = gauss(co, ctr, sig_eye)
        if co.z < ctr.z:  # pálpebra inferior sobe
            off.z += 0.5 * (ctr.z - co.z) * w
    elif name in ("eyeWideLeft", "eyeWideRight"):
        ctr = C["eyeL"] if name.endswith("Left") else C["eyeR"]
        w = gauss(co, ctr, sig_eye)
        off.z += (0.05 * hz * w) * (1 if co.z > ctr.z else -1)

    # ── Olhos: direção do olhar (sutil — sem globo ocular separado) ──────────────
    elif name.startswith("eyeLook"):
        ctr = C["eyeL"] if name.endswith("Left") else C["eyeR"]
        w = gauss(co, ctr, sig_eye * 0.8)
        if "Up" in name:
            off.z += 0.02 * hz * w
        elif "Down" in name:
            off.z -= 0.02 * hz * w
        elif "In" in name:
            off.x += (-0.02 * hx * w) if name.endswith("Left") else (0.02 * hx * w)
        elif "Out" in name:
            off.x += (0.02 * hx * w) if name.endswith("Left") else (-0.02 * hx * w)

    # ── Sobrancelhas ─────────────────────────────────────────────────────────────
    elif name in ("browDownLeft", "browDownRight"):
        ctr = C["browL"] if name.endswith("Left") else C["browR"]
        off.z -= 0.08 * hz * gauss(co, ctr, sig_brow)
    elif name == "browInnerUp":
        w = max(gauss(co, C["browInL"], sig_brow), gauss(co, C["browInR"], sig_brow))
        off.z += 0.09 * hz * w
    elif name in ("browOuterUpLeft", "browOuterUpRight"):
        ctr = C["browL"] if name.endswith("Left") else C["browR"]
        off.z += 0.08 * hz * gauss(co, ctr, sig_brow)

    # ── Bochechas / nariz ────────────────────────────────────────────────────────
    elif name == "cheekPuff":
        w = max(gauss(co, C["cheekL"], sig_cheek), gauss(co, C["cheekR"], sig_cheek))
        off.x += (0.08 * hx * w) * (1 if co.x >= 0 else -1)
        off.y += 0.05 * hy * w
    elif name in ("cheekSquintLeft", "cheekSquintRight"):
        ctr = C["cheekL"] if name.endswith("Left") else C["cheekR"]
        off.z += 0.05 * hz * gauss(co, ctr, sig_cheek * 0.8)
    elif name in ("noseSneerLeft", "noseSneerRight"):
        side = 1 if name.endswith("Left") else -1
        ctr = C["nose"] + Vector((side * 0.12 * hx, 0, -0.05 * hz))
        w = gauss(co, ctr, sig_eye)
        off.z += 0.06 * hz * w
        off.y += 0.02 * hy * w

    # ── Língua ───────────────────────────────────────────────────────────────────
    elif name == "tongueOut":
        off.y += 0.14 * hy * gauss(co, C["mouth"], sig_mouth * 0.5)

    return off


def add_shape_keys(obj):
    """Cria a Basis + as 52 shape keys ARKit com as deformações por região."""
    obj.shape_key_add(name="Basis", from_mix=False)
    basis = [v.co.copy() for v in obj.data.vertices]

    # Meia-extensão da bounding box (após aplicar escala).
    xs = [c.x for c in basis]; ys = [c.y for c in basis]; zs = [c.z for c in basis]
    H = Vector(((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, (max(zs) - min(zs)) / 2))
    S = max(H.x, H.y, H.z)

    C = {
        "mouth":   Vector((0.0,        0.82 * H.y, -0.32 * H.z)),
        "mouthL":  Vector((0.28 * H.x, 0.80 * H.y, -0.30 * H.z)),
        "mouthR":  Vector((-0.28 * H.x, 0.80 * H.y, -0.30 * H.z)),
        "eyeL":    Vector((0.42 * H.x, 0.78 * H.y,  0.18 * H.z)),
        "eyeR":    Vector((-0.42 * H.x, 0.78 * H.y,  0.18 * H.z)),
        "browL":   Vector((0.42 * H.x, 0.74 * H.y,  0.40 * H.z)),
        "browR":   Vector((-0.42 * H.x, 0.74 * H.y,  0.40 * H.z)),
        "browInL": Vector((0.16 * H.x, 0.80 * H.y,  0.42 * H.z)),
        "browInR": Vector((-0.16 * H.x, 0.80 * H.y,  0.42 * H.z)),
        "cheekL":  Vector((0.55 * H.x, 0.58 * H.y, -0.10 * H.z)),
        "cheekR":  Vector((-0.55 * H.x, 0.58 * H.y, -0.10 * H.z)),
        "nose":    Vector((0.0,        1.00 * H.y,  0.00 * H.z)),
    }

    created = 0
    for name in ARKIT_SHAPES:
        sk = obj.shape_key_add(name=name, from_mix=False)
        moved = 0
        for i, co in enumerate(basis):
            off = expression_offset(name, co, H, C, S)
            if off.length_squared > 0.0:
                sk.data[i].co = co + off
                moved += 1
        sk.value = 0.0
        if moved == 0:
            log(f"  ! '{name}' não moveu vértices (região fora da malha).")
        created += 1
    log(f"Criadas {created} shape keys ARKit (+ Basis).")


def main():
    args = parse_args()
    out = os.path.abspath(args.out)
    log(f"Blender {bpy.app.version_string}")
    log(f"Saída: {out}")

    reset_scene()
    head = build_head(args.segments)
    add_shape_keys(head)

    bpy.ops.object.select_all(action="DESELECT")
    head.select_set(True)
    bpy.context.view_layer.objects.active = head

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB" if out.lower().endswith(".glb") else "GLTF_SEPARATE",
        use_selection=True,
        export_morph=True,
        export_morph_normal=True,
    )
    log("Template exportado com sucesso!")


if __name__ == "__main__":
    main()
