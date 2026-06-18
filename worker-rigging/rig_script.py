import bpy
import sys
import argparse

# O Blender passa os próprios argumentos antes do script, 
# então pegamos apenas o que vem depois do "--"
argv = sys.argv
if "--" not in argv:
    argv = []
else:
    argv = argv[argv.index("--") + 1:]

parser = argparse.ArgumentParser()
parser.add_argument("--in", dest="input_path", required=True)
parser.add_argument("--out", dest="output_path", required=True)
args = parser.parse_args(argv)

# 1. Limpa a cena padrão do Blender
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# 2. Importa a malha (GLB) do usuário
print(f"Importando {args.input_path}...")
bpy.ops.import_scene.gltf(filepath=args.input_path)

# ==============================================================================
# SEU ALGORITMO DE RIGGING (O CÉREBRO DA IA LOCAL) ENTRA AQUI!
# ==============================================================================
# Em um cenário real de auto-rigging facial, você faria:
# 1. Importaria um 'template_face.blend' contendo a estrutura de ossos e os 52 Shape Keys do ARKit.
# 2. Usaria o 'Shrinkwrap Modifier' para colar o template no modelo do usuário.
# 3. Aplicaria o modificador 'Surface Deform' e transferiria o peso dos vértices.
# 4. Usaria bpy.ops.vrm.model_build() (requer addon VRM) para fechar o pacote.
# 
# Como este é um esqueleto da infraestrutura, vamos simular que ele operou a malha
# exportando-a de volta no formato final exigido.
print("Executando Deformation Transfer e construindo hierarquia VRM...")
# ==============================================================================

# 3. Exporta o modelo "riggado".
# Observação: Para gerar .vrm real, você precisa instalar o Addon VRM no Blender
# e usar bpy.ops.export_scene.vrm(filepath=args.output_path).
# Como estamos mockando o motor interno, vamos devolver como GLB renomeado.
print(f"Exportando para {args.output_path}...")
bpy.ops.export_scene.gltf(filepath=args.output_path, export_format='GLB')

print("Finalizado!")
