/**
 * avatar-export — bake a rigged, downloadable avatar from the live studio mesh.
 *
 * The procedural rig ({@link buildProceduralMorphs}) gives a mesh ARKit-named
 * morph targets that work live in the Studio/OBS. This module turns that into a
 * portable FILE so the same expressions travel to VSeeFace / VTube Studio:
 *
 *  - bakeGlb: a .glb with the morph targets baked in (re-importable here, and
 *    usable by any glTF-morph-aware tool). Reliable and simple.
 *  - bakeVrm: a VRM 0.0 — a .glb plus a minimal humanoid skeleton (so it's a
 *    valid VRM) and a `blendShapeMaster` mapping the VRM expression presets
 *    (A/I/U/E/O, Blink, Joy…) to the ARKit morphs. This is what VTuber apps load.
 *
 * Everything happens in ONE coordinate space (the browser's), so there is no
 * cross-engine mismatch — the morphs and the skeleton agree by construction.
 */
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Export an object subtree to a binary glTF (.glb) ArrayBuffer, morphs included. */
export function exportGlb(root: THREE.Object3D): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true, onlyVisible: false, includeCustomExtensions: true },
    )
  })
}

// VRM0 humanoid layout — fractions of the model's height (Y-up assumed, as the
// app already displays these models upright). All vertices are weighted to the
// head bone, so the avatar follows head-pose as a bust; the remaining bones make
// the humanoid valid for VTuber apps.
const BONES: { name: string; y: number; x?: number; parent: string | null }[] = [
  { name: 'hips', y: 0.5, parent: null },
  { name: 'spine', y: 0.6, parent: 'hips' },
  { name: 'chest', y: 0.72, parent: 'spine' },
  { name: 'neck', y: 0.85, parent: 'chest' },
  { name: 'head', y: 0.92, parent: 'neck' },
  { name: 'leftUpperArm', y: 0.8, x: 0.12, parent: 'chest' },
  { name: 'leftLowerArm', y: 0.8, x: 0.22, parent: 'leftUpperArm' },
  { name: 'leftHand', y: 0.8, x: 0.3, parent: 'leftLowerArm' },
  { name: 'rightUpperArm', y: 0.8, x: -0.12, parent: 'chest' },
  { name: 'rightLowerArm', y: 0.8, x: -0.22, parent: 'rightUpperArm' },
  { name: 'rightHand', y: 0.8, x: -0.3, parent: 'rightLowerArm' },
  { name: 'leftUpperLeg', y: 0.48, x: 0.06, parent: 'hips' },
  { name: 'leftLowerLeg', y: 0.25, x: 0.06, parent: 'leftUpperLeg' },
  { name: 'leftFoot', y: 0.04, x: 0.06, parent: 'leftLowerLeg' },
  { name: 'rightUpperLeg', y: 0.48, x: -0.06, parent: 'hips' },
  { name: 'rightLowerLeg', y: 0.25, x: -0.06, parent: 'rightUpperLeg' },
  { name: 'rightFoot', y: 0.04, x: -0.06, parent: 'rightLowerLeg' },
]

/** Build a SkinnedMesh (mesh skinned 100% to `head`) + humanoid skeleton. */
function buildSkinned(mesh: THREE.Mesh): { scene: THREE.Object3D; skinned: THREE.SkinnedMesh } {
  const geo = (mesh.geometry as THREE.BufferGeometry).clone()
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const min = bb.min
  const size = new THREE.Vector3()
  bb.getSize(size)
  const h = Math.max(size.y, 1e-3)
  const cx = (bb.min.x + bb.max.x) / 2
  const cz = (bb.min.z + bb.max.z) / 2

  const bones: Record<string, THREE.Bone> = {}
  const world: Record<string, THREE.Vector3> = {}
  const order: THREE.Bone[] = []
  for (const b of BONES) {
    const bone = new THREE.Bone()
    bone.name = b.name
    const wp = new THREE.Vector3(cx + (b.x ?? 0) * h, min.y + b.y * h, cz)
    world[b.name] = wp
    if (b.parent) {
      bones[b.parent].add(bone)
      bone.position.copy(wp).sub(world[b.parent])
    } else {
      bone.position.copy(wp)
    }
    bones[b.name] = bone
    order.push(bone)
  }
  const headIndex = order.findIndex((b) => b.name === 'head')

  // Weight every vertex fully to the head bone.
  const n = geo.getAttribute('position').count
  const si = new Float32Array(n * 4)
  const sw = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    si[i * 4] = headIndex
    sw[i * 4] = 1
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(si), 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  // Preserve morph names for the exporter.
  if (mesh.morphTargetDictionary) {
    geo.userData.targetNames = Object.keys(mesh.morphTargetDictionary).sort(
      (a, b) => mesh.morphTargetDictionary![a] - mesh.morphTargetDictionary![b],
    )
  }

  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const skinned = new THREE.SkinnedMesh(geo, (mat as THREE.Material) ?? new THREE.MeshStandardMaterial())
  skinned.name = 'GR3D_Avatar'
  if (mesh.morphTargetDictionary) skinned.morphTargetDictionary = { ...mesh.morphTargetDictionary }
  if (mesh.morphTargetInfluences) skinned.morphTargetInfluences = mesh.morphTargetInfluences.slice()

  const scene = new THREE.Group()
  scene.add(skinned)
  skinned.add(bones.hips) // skeleton root lives under the skinned mesh
  skinned.bind(new THREE.Skeleton(order))
  return { scene, skinned }
}

export interface VrmMeta {
  title?: string
  author?: string
}

/** ARKit morph name → VRM0 blendShapeGroup (presetName + the morphs it blends).
 * Covers speech visemes (A/I/U/E/O), blink and the four VRM emotions, so the
 * exported avatar lip-syncs and emotes in VSeeFace / VTube Studio. */
const VRM_GROUPS: { name: string; preset: string; morphs: string[] }[] = [
  { name: 'A', preset: 'a', morphs: ['jawOpen'] },
  { name: 'I', preset: 'i', morphs: ['mouthStretchLeft', 'mouthStretchRight'] },
  { name: 'U', preset: 'u', morphs: ['mouthPucker'] },
  { name: 'E', preset: 'e', morphs: ['mouthStretchLeft', 'mouthStretchRight', 'jawOpen'] },
  { name: 'O', preset: 'o', morphs: ['mouthFunnel'] },
  { name: 'Blink', preset: 'blink', morphs: ['eyeBlinkLeft', 'eyeBlinkRight'] },
  { name: 'Blink_L', preset: 'blink_l', morphs: ['eyeBlinkLeft'] },
  { name: 'Blink_R', preset: 'blink_r', morphs: ['eyeBlinkRight'] },
  { name: 'Joy', preset: 'joy', morphs: ['mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight'] },
  { name: 'Angry', preset: 'angry', morphs: ['browDownLeft', 'browDownRight', 'mouthFrownLeft', 'mouthFrownRight', 'noseSneerLeft', 'noseSneerRight'] },
  { name: 'Sorrow', preset: 'sorrow', morphs: ['mouthFrownLeft', 'mouthFrownRight', 'browInnerUp'] },
  { name: 'Fun', preset: 'fun', morphs: ['mouthSmileLeft', 'mouthSmileRight', 'browOuterUpLeft', 'browOuterUpRight'] },
  { name: 'Neutral', preset: 'neutral', morphs: [] },
]

/**
 * Bake a VRM 0.0 (.glb + VRM extension) from a mesh that already carries ARKit
 * morphs. Returns the .vrm bytes. All-in-browser, single coordinate space.
 */
export async function exportVrm(mesh: THREE.Mesh, meta: VrmMeta = {}): Promise<ArrayBuffer> {
  const { scene, skinned } = buildSkinned(mesh)
  const glb = await exportGlb(scene)
  return injectVrm0(glb, skinned, meta)
}

/** Split a GLB, edit its JSON chunk to add the VRM0 extension, re-pack. */
function injectVrm0(glb: ArrayBuffer, skinned: THREE.SkinnedMesh, meta: VrmMeta): ArrayBuffer {
  const { json, bin } = parseGlb(glb)

  // Map our bone/mesh objects to the exporter's node indices (matched by name).
  const nodes: { name?: string; mesh?: number }[] = json.nodes ?? []
  const nodeByName = new Map<string, number>()
  nodes.forEach((nd, i) => { if (nd.name) nodeByName.set(nd.name, i) })

  const humanBones = BONES
    .filter((b) => nodeByName.has(b.name))
    .map((b) => ({ bone: b.name, node: nodeByName.get(b.name)!, useDefaultValues: true }))

  // The skinned mesh node + its glTF mesh index, and the morph index lookup.
  const meshNode = nodeByName.get('GR3D_Avatar')
  const meshIndex = meshNode != null ? nodes[meshNode]?.mesh ?? 0 : 0
  const dict = skinned.morphTargetDictionary ?? {}
  const targetNames: string[] = json.meshes?.[meshIndex]?.primitives?.[0]?.extras?.targetNames ?? []
  const morphIndex = (name: string): number => {
    const fromGltf = targetNames.indexOf(name)
    if (fromGltf >= 0) return fromGltf
    return name in dict ? dict[name] : -1
  }

  const blendShapeGroups = VRM_GROUPS.map((g) => ({
    name: g.name,
    presetName: g.preset,
    binds: g.morphs
      .map((m) => morphIndex(m))
      .filter((idx) => idx >= 0)
      .map((idx) => ({ mesh: meshIndex, index: idx, weight: 100 })),
    materialValues: [],
    isBinary: false,
  }))

  const headNode = nodeByName.get('head') ?? 0
  json.extensionsUsed = Array.from(new Set([...(json.extensionsUsed ?? []), 'VRM']))
  json.extensions = json.extensions ?? {}
  json.extensions.VRM = {
    exporterVersion: 'Gerador3D-0.4',
    specVersion: '0.0',
    meta: {
      title: meta.title || 'Gerador3D Avatar',
      author: meta.author || 'Gerador3D',
      version: '1',
      allowedUserName: 'Everyone',
      violentUssageName: 'Disallow',
      sexualUssageName: 'Disallow',
      commercialUssageName: 'Allow',
      licenseName: 'CC0',
    },
    humanoid: { humanBones },
    firstPerson: {
      firstPersonBone: headNode,
      firstPersonBoneOffset: { x: 0, y: 0, z: 0 },
      meshAnnotations: [],
    },
    blendShapeMaster: { blendShapeGroups },
    secondaryAnimation: { boneGroups: [], colliderGroups: [] },
    materialProperties: [],
  }

  return packGlb(json, bin)
}

// ── GLB container helpers ───────────────────────────────────────────────────

interface Gltf {
  nodes?: { name?: string; mesh?: number }[]
  meshes?: { primitives?: { extras?: { targetNames?: string[] } }[] }[]
  extensionsUsed?: string[]
  extensions?: Record<string, unknown> & { VRM?: unknown }
  [k: string]: unknown
}

function parseGlb(buf: ArrayBuffer): { json: Gltf; bin: Uint8Array } {
  const dv = new DataView(buf)
  const length = dv.getUint32(12, true)
  let offset = 12
  let json: Gltf | null = null
  let bin = new Uint8Array(0)
  while (offset < length) {
    const chunkLen = dv.getUint32(offset, true)
    const chunkType = dv.getUint32(offset + 4, true)
    const start = offset + 8
    const data = new Uint8Array(buf, start, chunkLen)
    if (chunkType === 0x4e4f534a) json = JSON.parse(dec.decode(data)) as Gltf // 'JSON'
    else if (chunkType === 0x004e4942) bin = data // 'BIN\0'
    offset = start + chunkLen
  }
  if (!json) throw new Error('GLB inválido (sem chunk JSON).')
  return { json, bin }
}

function pad4(n: number): number {
  return (4 - (n % 4)) % 4
}

function packGlb(json: Gltf, bin: Uint8Array): ArrayBuffer {
  const jsonBytes = enc.encode(JSON.stringify(json))
  const jsonPad = pad4(jsonBytes.length)
  const binPad = pad4(bin.length)
  const jsonChunkLen = jsonBytes.length + jsonPad
  const binChunkLen = bin.length + binPad
  const total = 12 + 8 + jsonChunkLen + (bin.length ? 8 + binChunkLen : 0)

  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  let o = 0
  dv.setUint32(o, 0x46546c67, true); o += 4 // 'glTF'
  dv.setUint32(o, 2, true); o += 4 // version
  dv.setUint32(o, total, true); o += 4 // total length
  // JSON chunk
  dv.setUint32(o, jsonChunkLen, true); o += 4
  dv.setUint32(o, 0x4e4f534a, true); o += 4 // 'JSON'
  u8.set(jsonBytes, o); o += jsonBytes.length
  for (let i = 0; i < jsonPad; i++) u8[o++] = 0x20 // space-pad JSON
  // BIN chunk
  if (bin.length) {
    dv.setUint32(o, binChunkLen, true); o += 4
    dv.setUint32(o, 0x004e4942, true); o += 4 // 'BIN\0'
    u8.set(bin, o); o += bin.length
    for (let i = 0; i < binPad; i++) u8[o++] = 0x00
  }
  return out
}
