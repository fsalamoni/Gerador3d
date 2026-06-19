"""
Gerador3D — Script de Rigging Facial Automático (Blender / bpy).

Executado em modo headless pelo Worker (main.py):

    blender -b -P rig_script.py -- --in modelo.glb --out modelo.vrm [--template template_face.glb]

O que ele faz (pipeline real, não mock):

  1. Importa o GLB do usuário e localiza a malha do rosto/cabeça.
  2. Importa um "template facial" que JÁ contém os 52 blendshapes (shape keys)
     no padrão ARKit — esse template é o cérebro das expressões.
  3. Alinha o template ao rosto do usuário (transformação de objeto por
     bounding box; o Surface Deform tolera o resto da diferença).
  4. Transfere os blendshapes do template para a malha do usuário usando o
     modificador Surface Deform ("Deformation Transfer"): para cada shape key
     do template a malha do usuário é deformada, e o resultado deformado é
     "assado" (baked) como uma nova shape key na malha do usuário.
  5. Cria/reaproveita um esqueleto humanoide mínimo (necessário para o VRM) e
     registra as expressões VRM (aa, blink, happy, ...) apontando para as
     shape keys ARKit transferidas.
  6. Exporta como .vrm usando o "VRM Add-on for Blender" (io_scene_vrm).

Notas de robustez:
  - Cada etapa "frágil" (VRM addon, armature, expressões) é protegida por
    try/except com logs claros. Se o export VRM falhar, há um fallback que
    exporta um GLB (com os morph targets preservados) no caminho de saída,
    para que o modelo continue visualizável/baixável. O log deixa explícito
    qual caminho foi usado.
  - O template é obrigatório para a transferência facial. Se não for
    encontrado, o script falha com uma mensagem acionável (o Worker a
    repassa para o frontend).
"""

import os
import sys
import argparse
import traceback

# Logs em UTF-8 (no Windows o codec cp1252 não encoda acentos/"→" e quebraria
# os prints com UnicodeEncodeError). errors="replace" nunca levanta.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import bpy
from mathutils import Vector


# ──────────────────────────────────────────────────────────────────────────────
# Tabelas de referência: 52 blendshapes ARKit e o mapeamento para expressões VRM
# ──────────────────────────────────────────────────────────────────────────────

# Os 52 nomes ARKit (mesma convenção lowerCamel que o MediaPipe FaceLandmarker
# devolve no frontend — ver frontend/src/lib/face-tracking.ts).
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

# Mapeia cada expressão VRM (preset, usado por @pixiv/three-vrm no frontend —
# ver frontend/src/lib/avatar-mapping.ts) para a combinação de shape keys ARKit
# que a compõe. Pesos permitem misturar (ex.: "ih" usa as duas laterais).
VRM_EXPRESSION_BINDS = {
    "aa": [("jawOpen", 1.0)],
    "oh": [("mouthFunnel", 1.0)],
    "ou": [("mouthPucker", 1.0)],
    "ih": [("mouthStretchLeft", 1.0), ("mouthStretchRight", 1.0)],
    "ee": [("mouthSmileLeft", 0.6), ("mouthSmileRight", 0.6)],
    "blink": [("eyeBlinkLeft", 1.0), ("eyeBlinkRight", 1.0)],
    "blinkLeft": [("eyeBlinkLeft", 1.0)],
    "blinkRight": [("eyeBlinkRight", 1.0)],
    "happy": [("mouthSmileLeft", 1.0), ("mouthSmileRight", 1.0)],
    "angry": [("browDownLeft", 1.0), ("browDownRight", 1.0)],
    "sad": [("mouthFrownLeft", 1.0), ("mouthFrownRight", 1.0)],
    "surprised": [("browInnerUp", 1.0), ("eyeWideLeft", 1.0), ("eyeWideRight", 1.0)],
    "relaxed": [("mouthSmileLeft", 0.4), ("mouthSmileRight", 0.4)],
    "lookUp": [("eyeLookUpLeft", 1.0), ("eyeLookUpRight", 1.0)],
    "lookDown": [("eyeLookDownLeft", 1.0), ("eyeLookDownRight", 1.0)],
    "lookLeft": [("eyeLookOutLeft", 1.0), ("eyeLookInRight", 1.0)],
    "lookRight": [("eyeLookInLeft", 1.0), ("eyeLookOutRight", 1.0)],
}

# Bones humanoides mínimos exigidos pela especificação VRM, com posições
# normalizadas (Y é altura, em fração da altura total da malha) e o pai de cada
# osso. Suficiente para um avatar do tipo "cabeça/busto" usado em VTuber.
HUMANOID_BONES = [
    # name,         head (x, y, z),        parent
    ("hips",        (0.0, 0.50, 0.0),      None),
    ("spine",       (0.0, 0.60, 0.0),      "hips"),
    ("chest",       (0.0, 0.72, 0.0),      "spine"),
    ("neck",        (0.0, 0.85, 0.0),      "chest"),
    ("head",        (0.0, 0.90, 0.0),      "neck"),
    ("leftUpperArm",  (0.18, 0.80, 0.0),   "chest"),
    ("leftLowerArm",  (0.30, 0.80, 0.0),   "leftUpperArm"),
    ("leftHand",      (0.42, 0.80, 0.0),   "leftLowerArm"),
    ("rightUpperArm", (-0.18, 0.80, 0.0),  "chest"),
    ("rightLowerArm", (-0.30, 0.80, 0.0),  "rightUpperArm"),
    ("rightHand",     (-0.42, 0.80, 0.0),  "rightLowerArm"),
    ("leftUpperLeg",  (0.08, 0.48, 0.0),   "hips"),
    ("leftLowerLeg",  (0.08, 0.25, 0.0),   "leftUpperLeg"),
    ("leftFoot",      (0.08, 0.03, 0.05),  "leftLowerLeg"),
    ("rightUpperLeg", (-0.08, 0.48, 0.0),  "hips"),
    ("rightLowerLeg", (-0.08, 0.25, 0.0),  "rightUpperLeg"),
    ("rightFoot",     (-0.08, 0.03, 0.05), "rightLowerLeg"),
]


def log(msg):
    """Print com flush para aparecer em tempo real na captura do Worker."""
    print(f"[rig] {msg}", flush=True)


def progress(pct, msg=""):
    """Emite progresso 0..100 que o Worker lê para atualizar o job ao vivo."""
    print(f"PROGRESS: {int(pct)} {msg}", flush=True)


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    parser = argparse.ArgumentParser(description="Gerador3D facial auto-rigging")
    parser.add_argument("--in", dest="input_path", required=True,
                        help="GLB de entrada do usuário")
    parser.add_argument("--out", dest="output_path", required=True,
                        help="Caminho do .vrm de saída")
    parser.add_argument("--template", dest="template_path", default="",
                        help="Template facial com os 52 shape keys ARKit "
                             "(.glb/.gltf/.vrm/.blend). Se omitido, procura "
                             "template_face.* ao lado deste script ou em "
                             "RIG_TEMPLATE_PATH.")
    return parser.parse_args(argv)


def resolve_template_path(explicit):
    """Descobre o template facial. Ordem: --template, env, arquivos padrão."""
    candidates = []
    if explicit:
        candidates.append(explicit)
    env = os.environ.get("RIG_TEMPLATE_PATH", "")
    if env:
        candidates.append(env)
    here = os.path.dirname(os.path.abspath(__file__))
    for ext in (".vrm", ".glb", ".gltf", ".blend"):
        candidates.append(os.path.join(here, f"template_face{ext}"))
        candidates.append(os.path.join(here, "templates", f"template_face{ext}"))
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return ""


# ──────────────────────────────────────────────────────────────────────────────
# Cena / import
# ──────────────────────────────────────────────────────────────────────────────

def reset_scene():
    """Limpa completamente a cena padrão do Blender."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # Limpa data órfã que possa ter sobrado.
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def import_any(path):
    """Importa GLB/GLTF/VRM/BLEND e devolve a lista de objetos novos."""
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf", ".vrm"):
        # O addon VRM intercepta .vrm; senão o importador glTF lê o binário
        # (um .vrm é um glTF válido) — por isso forçamos o gltf como fallback.
        try:
            bpy.ops.import_scene.gltf(filepath=path)
        except Exception:
            bpy.ops.import_scene.vrm(filepath=path)  # type: ignore[attr-defined]
    elif ext == ".blend":
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = list(src.objects)
        for obj in dst.objects:
            if obj is not None:
                bpy.context.collection.objects.link(obj)
    else:
        raise ValueError(f"Formato não suportado para import: {ext}")
    return [o for o in bpy.data.objects if o not in before]


def pick_face_mesh(objects):
    """Escolhe a malha que representa o rosto/cabeça.

    Heurística: preferimos uma malha cujo nome sugira cabeça/rosto; caso
    contrário, a malha com mais vértices (geralmente o corpo+cabeça do avatar).
    """
    meshes = [o for o in objects if o.type == "MESH" and o.data]
    if not meshes:
        return None
    keywords = ("face", "head", "rosto", "cabeca", "cabeça", "body", "avatar")
    named = [m for m in meshes if any(k in m.name.lower() for k in keywords)]
    pool = named or meshes
    return max(pool, key=lambda m: len(m.data.vertices))


def template_mesh_with_shapekeys(objects):
    """Acha a malha do template que tem shape keys (os blendshapes ARKit)."""
    meshes = [o for o in objects if o.type == "MESH" and o.data]
    with_keys = [m for m in meshes if m.data.shape_keys and
                 len(m.data.shape_keys.key_blocks) > 1]
    if not with_keys:
        return None
    return max(with_keys, key=lambda m: len(m.data.shape_keys.key_blocks))


# ──────────────────────────────────────────────────────────────────────────────
# Alinhamento + transferência de blendshapes
# ──────────────────────────────────────────────────────────────────────────────

def world_bounds(obj):
    """Bounding box do objeto em coordenadas de mundo (min, max)."""
    coords = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    mx = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    return mn, mx


def align_template_to_user(template, user):
    """Alinha o template à malha do usuário transformando o OBJETO do template.

    Transformamos o objeto (não a mesh data) porque a mesh tem shape keys e o
    Blender não permite aplicar transformações nesse caso. Object-transform move
    todas as shape keys de forma consistente.
    """
    t_min, t_max = world_bounds(template)
    u_min, u_max = world_bounds(user)
    t_size = t_max - t_min
    u_size = u_max - u_min
    t_center = (t_min + t_max) * 0.5
    u_center = (u_min + u_max) * 0.5

    # Escala uniforme pela maior dimensão (preserva proporção do template).
    t_dim = max(t_size.x, t_size.y, t_size.z, 1e-6)
    u_dim = max(u_size.x, u_size.y, u_size.z, 1e-6)
    scale = u_dim / t_dim

    template.scale = [s * scale for s in template.scale]
    bpy.context.view_layer.update()

    # Recentra após escalar.
    t_min, t_max = world_bounds(template)
    t_center = (t_min + t_max) * 0.5
    template.location += (u_center - t_center)
    bpy.context.view_layer.update()
    log(f"Template alinhado (escala x{scale:.3f}).")


def ensure_basis(mesh_obj):
    """Garante que a malha tenha ao menos a shape key 'Basis'."""
    if not mesh_obj.data.shape_keys:
        mesh_obj.shape_key_add(name="Basis", from_mix=False)


def transfer_blendshapes(user, template):
    """Transfere as shape keys do template para a malha do usuário via Surface
    Deform bake. Devolve a lista de nomes de shape keys criadas no usuário."""
    # Seleciona apenas o usuário e adiciona o modificador Surface Deform.
    bpy.ops.object.select_all(action="DESELECT")
    user.select_set(True)
    bpy.context.view_layer.objects.active = user

    mod = user.modifiers.new(name="GR3D_SurfaceDeform", type="SURFACE_DEFORM")
    mod.target = template

    # Bind precisa do template no estado Basis (todas as keys em 0).
    t_keys = template.data.shape_keys
    for kb in t_keys.key_blocks:
        kb.value = 0.0
    bpy.context.view_layer.update()

    bpy.ops.object.surfacedeform_bind(modifier=mod.name)
    if not mod.is_bound:
        user.modifiers.remove(mod)
        raise RuntimeError(
            "Surface Deform não conseguiu fazer o bind. O template está muito "
            "distante/desalinhado em relação à malha do usuário."
        )

    ensure_basis(user)
    n_user_verts = len(user.data.vertices)
    created = []

    transfer_keys = [kb for kb in t_keys.key_blocks if kb.name.lower() != "basis"]
    total = max(1, len(transfer_keys))

    for idx, kb in enumerate(transfer_keys):
        # Progresso da transferência ocupa a faixa 40..78.
        progress(40 + int(38 * idx / total), f"transferindo {kb.name}")
        # Preserva o nome ARKit vindo do template (ex.: "jawOpen").
        target_name = kb.name

        # Ativa só esta expressão no template.
        kb.value = 1.0
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()

        # Avalia a malha do usuário já deformada pelo Surface Deform.
        eval_obj = user.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        if len(eval_mesh.vertices) != n_user_verts:
            eval_obj.to_mesh_clear()
            kb.value = 0.0
            log(f"  ! Pulei '{kb.name}' (contagem de vértices divergente).")
            continue

        coords = [v.co.copy() for v in eval_mesh.vertices]
        eval_obj.to_mesh_clear()

        # Cria a shape key correspondente na malha do usuário e grava os
        # vértices deformados.
        new_key = user.shape_key_add(name=target_name, from_mix=False)
        for i, co in enumerate(coords):
            new_key.data[i].co = co
        new_key.value = 0.0
        created.append(target_name)

        # Reseta o template para a próxima expressão.
        kb.value = 0.0

    # Remove o modificador — as shape keys já estão "assadas" na malha.
    user.modifiers.remove(mod)
    log(f"Transferidas {len(created)} shape keys para a malha do usuário.")
    return created


# ──────────────────────────────────────────────────────────────────────────────
# Esqueleto humanoide (necessário para VRM)
# ──────────────────────────────────────────────────────────────────────────────

def find_armature(objects):
    for o in objects:
        if o.type == "ARMATURE":
            return o
    return None


def build_humanoid_armature(user):
    """Cria um esqueleto humanoide mínimo dimensionado pela bounding box da
    malha e faz o parent da malha a ele. Devolve o objeto armature."""
    u_min, u_max = world_bounds(user)
    height = max((u_max.z - u_min.z), (u_max.y - u_min.y), 1e-3)
    base = Vector((
        (u_min.x + u_max.x) * 0.5,
        (u_min.y + u_max.y) * 0.5,
        u_min.z,
    ))
    up_is_z = (u_max.z - u_min.z) >= (u_max.y - u_min.y)

    def place(frac_xyz):
        x, y, z = frac_xyz
        if up_is_z:
            return base + Vector((x * height, y * height, z * height))
        # Eixo Y como "para cima" (avatares glTF costumam ser Y-up).
        return base + Vector((x * height, z * height, y * height))

    arm_data = bpy.data.armatures.new("Armature")
    arm_obj = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm_obj)

    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = arm_data.edit_bones
    created = {}
    for name, head_frac, parent in HUMANOID_BONES:
        eb = ebones.new(name)
        eb.head = place(head_frac)
        # tail um pouco acima da head (será reposicionado abaixo se tiver filho).
        eb.tail = eb.head + Vector((0, 0, 0.04 * height))
        if parent and parent in created:
            eb.parent = created[parent]
        created[name] = eb

    # Aponta o tail de cada osso para o head do filho principal, deixando a
    # cadeia visualmente coerente.
    child_of = {}
    for name, _h, parent in HUMANOID_BONES:
        if parent:
            child_of.setdefault(parent, name)
    for parent, child in child_of.items():
        if parent in created and child in created:
            created[parent].tail = created[child].head
    bpy.ops.object.mode_set(mode="OBJECT")

    # Parenteia a malha ao "head" com um vertex group (pesos simples) para que
    # o VRM tenha skinning válido.
    user.parent = arm_obj
    mod = user.modifiers.new(name="GR3D_Armature", type="ARMATURE")
    mod.object = arm_obj
    vg = user.vertex_groups.get("head") or user.vertex_groups.new(name="head")
    vg.add(range(len(user.data.vertices)), 1.0, "REPLACE")
    log("Esqueleto humanoide criado e malha vinculada ao osso 'head'.")
    return arm_obj


# ──────────────────────────────────────────────────────────────────────────────
# VRM addon: humanoid + expressões + export
# ──────────────────────────────────────────────────────────────────────────────

def ensure_vrm_addon():
    """Tenta habilitar o VRM Add-on for Blender. Devolve True se disponível."""
    try:
        import addon_utils  # type: ignore
        for mod_name in ("io_scene_vrm", "VRM_Addon_for_Blender"):
            try:
                addon_utils.enable(mod_name, default_set=True, persistent=True)
            except Exception:
                continue
    except Exception:
        pass
    return hasattr(bpy.ops, "vrm") and hasattr(bpy.ops.export_scene, "vrm")


def assign_vrm_humanoid(arm_obj):
    """Pede ao addon para mapear automaticamente os ossos humanoides VRM."""
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    for op_name in (
        "assign_vrm1_humanoid_human_bones_automatically",
        "assign_vrm0_humanoid_human_bones_automatically",
    ):
        op = getattr(bpy.ops.vrm, op_name, None)
        if op is None:
            continue
        try:
            op(armature_name=arm_obj.name)
            log(f"Humanoid VRM mapeado via {op_name}.")
            return True
        except Exception as exc:  # noqa: BLE001
            log(f"  ! {op_name} falhou: {exc}")
    return False


def setup_vrm1_expressions(arm_obj, mesh_obj, available_shapes):
    """Registra as expressões VRM 1.0 apontando para as shape keys ARKit.

    Usa o modelo de dados do VRM Add-on (vrm_addon_extension.vrm1.expressions).
    Toda a operação é best-effort: versões diferentes do addon mudam a API,
    então protegemos cada passo.
    """
    ext = getattr(arm_obj.data, "vrm_addon_extension", None)
    if ext is None:
        log("  ! Extensão VRM não encontrada na armature; pulando expressões.")
        return False
    vrm1 = getattr(ext, "vrm1", None)
    expressions = getattr(vrm1, "expressions", None) if vrm1 else None
    if expressions is None:
        log("  ! API de expressões VRM1 indisponível; pulando.")
        return False

    preset = getattr(expressions, "preset", None)
    mesh_name = mesh_obj.data.name

    def add_binds(expr, binds):
        for shape_name, weight in binds:
            if shape_name not in available_shapes:
                continue
            try:
                bind = expr.morph_target_binds.add()
                bind.node.mesh_object_name = mesh_obj.name
                bind.index = shape_name
                bind.weight = float(weight)
            except Exception as exc:  # noqa: BLE001
                log(f"    ! bind {shape_name} falhou: {exc}")

    count = 0
    for vrm_name, binds in VRM_EXPRESSION_BINDS.items():
        expr = getattr(preset, vrm_name, None) if preset else None
        if expr is None:
            continue
        add_binds(expr, binds)
        count += 1
    log(f"Configuradas {count} expressões VRM (mesh '{mesh_name}').")
    return count > 0


def export_vrm(output_path):
    """Exporta a cena como .vrm. Levanta exceção se o operador falhar."""
    bpy.ops.export_scene.vrm(filepath=output_path)


def export_glb_fallback(output_path):
    """Fallback: exporta GLB (com morph targets) no caminho de saída."""
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_morph=True,
        export_morph_normal=True,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Orquestração
# ──────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    log(f"Blender {bpy.app.version_string}")
    log(f"Entrada: {args.input_path}")
    log(f"Saída:   {args.output_path}")

    if not os.path.isfile(args.input_path):
        raise FileNotFoundError(f"GLB de entrada não encontrado: {args.input_path}")

    template_path = resolve_template_path(args.template_path)
    if not template_path:
        raise FileNotFoundError(
            "Template facial não encontrado. Coloque um arquivo "
            "'template_face.glb' (com os 52 shape keys ARKit) na pasta "
            "worker-rigging/, ou aponte com --template / RIG_TEMPLATE_PATH."
        )
    log(f"Template: {template_path}")

    reset_scene()
    progress(5, "cena preparada")

    # 1. Importa o modelo do usuário.
    user_objs = import_any(args.input_path)
    user_mesh = pick_face_mesh(user_objs)
    if user_mesh is None:
        raise RuntimeError("Nenhuma malha encontrada no GLB do usuário.")
    log(f"Malha do usuário: '{user_mesh.name}' ({len(user_mesh.data.vertices)} vértices).")
    progress(15, "modelo importado")

    existing_armature = find_armature(user_objs)

    # 2. Importa o template facial.
    tmpl_objs = import_any(template_path)
    tmpl_mesh = template_mesh_with_shapekeys(tmpl_objs)
    if tmpl_mesh is None:
        raise RuntimeError(
            "O template não contém shape keys (blendshapes ARKit). "
            "Verifique se 'template_face' tem os 52 morph targets."
        )
    n_keys = len(tmpl_mesh.data.shape_keys.key_blocks) - 1
    log(f"Template: '{tmpl_mesh.name}' com {n_keys} shape keys.")
    progress(28, "template importado")

    # 3. Alinha o template ao usuário.
    align_template_to_user(tmpl_mesh, user_mesh)
    progress(38, "template alinhado")

    # 4. Transfere os blendshapes (Deformation Transfer / Surface Deform bake).
    created_shapes = transfer_blendshapes(user_mesh, tmpl_mesh)
    if not created_shapes:
        raise RuntimeError("Nenhuma shape key foi transferida; abortando.")

    progress(80, "blendshapes transferidos")

    # Limpa os objetos do template — não vão para o output.
    bpy.ops.object.select_all(action="DESELECT")
    for o in tmpl_objs:
        if o.name in bpy.data.objects:
            o.select_set(True)
    bpy.ops.object.delete(use_global=False)

    # 5. Esqueleto humanoide (reaproveita o do GLB ou cria um mínimo).
    armature = existing_armature
    if armature is None:
        try:
            armature = build_humanoid_armature(user_mesh)
        except Exception as exc:  # noqa: BLE001
            log(f"  ! Falha ao criar armature: {exc}")
            armature = None
    progress(86, "esqueleto pronto")

    # 6. Export VRM (com fallback para GLB).
    vrm_ok = ensure_vrm_addon()
    if vrm_ok and armature is not None:
        try:
            assign_vrm_humanoid(armature)
            setup_vrm1_expressions(armature, user_mesh, set(created_shapes))
            progress(94, "exportando VRM")
            export_vrm(args.output_path)
            log("Exportado como VRM com sucesso.")
            progress(100, "concluído")
            return
        except Exception as exc:  # noqa: BLE001
            log(f"  ! Export VRM falhou ({exc}); usando fallback GLB.")
            log(traceback.format_exc())
    else:
        log("  ! VRM addon indisponível ou sem armature; usando fallback GLB.")

    # Fallback: GLB com morph targets preservados (continua visualizável e
    # contém os blendshapes ARKit para consumidores compatíveis).
    progress(94, "exportando GLB (fallback)")
    export_glb_fallback(args.output_path)
    log("Exportado como GLB (fallback) com os morph targets ARKit preservados.")
    progress(100, "concluído")


if __name__ == "__main__":
    try:
        main()
        log("Finalizado!")
    except Exception as exc:  # noqa: BLE001
        # Mensagem em stderr para o Worker capturar e repassar ao frontend.
        sys.stderr.write(f"RIG_ERROR: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.exit(1)
