"""Testa make_template.expression_offset com stubs. Rode: python tests/test_template.py"""
import sys, types, math, importlib.util
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1]

class V:
    __slots__ = ("x", "y", "z")
    def __init__(self, t=(0.0, 0.0, 0.0)): self.x, self.y, self.z = map(float, t)
    def __sub__(self, o): return V((self.x-o.x, self.y-o.y, self.z-o.z))
    def __add__(self, o): return V((self.x+o.x, self.y+o.y, self.z+o.z))
    @property
    def length_squared(self): return self.x**2 + self.y**2 + self.z**2
    @property
    def length(self): return math.sqrt(self.length_squared)
    def copy(self): return V((self.x, self.y, self.z))

mathutils = types.ModuleType("mathutils"); mathutils.Vector = V
bpy = types.ModuleType("bpy"); bpy.app = types.SimpleNamespace(version_string="stub")
sys.modules["mathutils"], sys.modules["bpy"] = mathutils, bpy

spec = importlib.util.spec_from_file_location("mt", str(WORKER / "make_template.py"))
mt = importlib.util.module_from_spec(spec); spec.loader.exec_module(mt)

hx, hy, hz = 0.92*0.11, 0.98*0.11, 1.18*0.11
H = V((hx, hy, hz)); S = max(hx, hy, hz)
C = {
    "mouth": V((0, 0.82*hy, -0.32*hz)), "mouthL": V((0.28*hx, 0.80*hy, -0.30*hz)),
    "mouthR": V((-0.28*hx, 0.80*hy, -0.30*hz)), "eyeL": V((0.42*hx, 0.78*hy, 0.18*hz)),
    "eyeR": V((-0.42*hx, 0.78*hy, 0.18*hz)), "browL": V((0.42*hx, 0.74*hy, 0.40*hz)),
    "browR": V((-0.42*hx, 0.74*hy, 0.40*hz)), "browInL": V((0.16*hx, 0.80*hy, 0.42*hz)),
    "browInR": V((-0.16*hx, 0.80*hy, 0.42*hz)), "cheekL": V((0.55*hx, 0.58*hy, -0.10*hz)),
    "cheekR": V((-0.55*hx, 0.58*hy, -0.10*hz)), "nose": V((0, 1.0*hy, 0)),
}
samples = []
n = 22
for i in range(n):
    for j in range(n):
        u = math.pi*(i/(n-1)) - math.pi/2; v = 2*math.pi*(j/(n-1))
        samples.append(V((hx*math.cos(u)*math.cos(v), hy*math.cos(u)*math.sin(v), hz*math.sin(u))))

OK = []
def check(n_, c): print(("PASS" if c else "FAIL"), "-", n_); OK.append(bool(c))

check("52 ARKit shapes", len(mt.ARKIT_SHAPES) == 52 and len(set(mt.ARKIT_SHAPES)) == 52)
zero, mx = [], 0.0
for name in mt.ARKIT_SHAPES:
    tot = 0.0
    for co in samples:
        l = mt.expression_offset(name, co, H, C, S).length; tot += l; mx = max(mx, l)
    if tot <= 1e-9: zero.append(name)
check("all 52 deform", not zero)
check("bounded displacement", mx < 0.5*(2*hz))
check("jawOpen down", mt.expression_offset("jawOpen", V((0, 0.7*hy, -0.7*hz)), H, C, S).z < 0)
check("smileLeft up", mt.expression_offset("mouthSmileLeft", C["mouthL"], H, C, S).z > 0)

# Corretude direcional das expressões mais usadas (lip-sync + emoções).
def off(name, co): return mt.expression_offset(name, co, H, C, S)
above_eyeL = C["eyeL"] + V((0, 0, 0.03*hz))
below_mouth = V((0, 0.80*hy, -0.55*hz))   # ponto baixo/frontal (lower>0)
check("blinkLeft pálpebra desce", off("eyeBlinkLeft", above_eyeL).z < 0)
check("browDownLeft desce", off("browDownLeft", C["browL"]).z < 0)
check("browInnerUp sobe", off("browInnerUp", C["browInL"]).z > 0)
check("browOuterUpLeft sobe", off("browOuterUpLeft", C["browL"]).z > 0)
check("frownLeft desce", off("mouthFrownLeft", C["mouthL"]).z < 0)
check("jawLeft vai p/ esquerda (+x)", off("jawLeft", below_mouth).x > 0)
check("jawRight vai p/ direita (-x)", off("jawRight", below_mouth).x < 0)
check("pucker projeta p/ frente (+y)", off("mouthPucker", C["mouth"]).y > 0)
check("funnel projeta p/ frente (+y)", off("mouthFunnel", C["mouth"]).y > 0)
check("stretchLeft estica p/ fora (+x)", off("mouthStretchLeft", C["mouthL"]).x > 0)
check("cheekPuff infla p/ frente (+y)", off("cheekPuff", C["cheekL"]).y > 0)
check("tongueOut projeta p/ frente (+y)", off("tongueOut", C["mouth"]).y > 0)
check("eyeLookUpLeft sobe", off("eyeLookUpLeft", C["eyeL"]).z > 0)
check("smile eleva bochecha", off("mouthSmileLeft", C["cheekL"]).z > 0)

print("\nRESULT:", "ALL PASS" if all(OK) else "SOME FAILED", f"({sum(OK)}/{len(OK)})")
sys.exit(0 if all(OK) else 1)
