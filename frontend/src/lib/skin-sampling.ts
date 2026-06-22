/**
 * Skin-tone sampling — reads a representative skin colour from the uploaded or
 * generated face mesh so the procedurally-built eyelids match the model instead
 * of using a fixed neutral tone (the honest gap noted when eye anatomy shipped).
 *
 * Conservative & fully local (no AI, no network). It tries, in order:
 *   1) the diffuse texture (`material.map`), sampled at the eye/cheek landmarks;
 *   2) vertex colours;
 *   3) the material's flat colour;
 *   4) a neutral default.
 *
 * Texture pixel-reads need a canvas, so they are guarded: with no DOM (Node smoke
 * tests) or a CORS-tainted texture, sampling returns null and the next fallback
 * runs — it never throws. Colours come back as {@link THREE.Color} in the working
 * (linear) space so they can be copied straight onto a material, matching how a
 * hex passed to a material is interpreted (texture bytes are decoded from sRGB).
 */
import * as THREE from 'three'
import { computeFaceFrame, meshCentroid, type FaceLandmarks } from './procedural-face-rig'

/** Neutral mid-tone fallback (same value the eyelids used before sampling). */
export const DEFAULT_SKIN_TONE = 0xc8967a

export type SkinToneSource = 'texture' | 'vertexColor' | 'material' | 'default'

export interface SkinTone {
  /** Working-space colour, ready to assign to a MeshStandardMaterial `color`. */
  color: THREE.Color
  /** Where the tone came from — useful for honest logging/debugging. */
  source: SkinToneSource
}

/**
 * Sample a skin tone from `faceMesh`. `lm` (landmarks, in mesh-local space) lets
 * the sampler target real skin near the eyes/cheeks; without it, it averages the
 * whole texture / material. Always returns a usable colour.
 */
export function sampleSkinTone(faceMesh: THREE.Mesh, lm?: FaceLandmarks): SkinTone {
  const geom = faceMesh.geometry as THREE.BufferGeometry | undefined
  const mat = pickMaterial(faceMesh.material)
  const samples = lm ? skinSamplePoints(geom, lm) : []

  // 1) diffuse texture, decoded from sRGB.
  const map = (mat as THREE.MeshStandardMaterial | undefined)?.map
  if (map) {
    const c = sampleTexture(map, geom, samples)
    if (c) return { color: tintForLid(c), source: 'texture' }
  }
  // 2) vertex colours (assumed already in working space).
  if (geom?.getAttribute('color')) {
    const c = sampleVertexColors(geom, samples)
    if (c) return { color: tintForLid(c), source: 'vertexColor' }
  }
  // 3) flat material colour (already working space).
  const flat = (mat as { color?: unknown } | undefined)?.color
  if (flat instanceof THREE.Color) {
    return { color: tintForLid(flat.clone()), source: 'material' }
  }
  // 4) neutral default.
  return { color: new THREE.Color(DEFAULT_SKIN_TONE), source: 'default' }
}

/** Pick the most skin-like material: prefer a textured one, then a coloured one. */
function pickMaterial(material: THREE.Material | THREE.Material[] | undefined): THREE.Material | undefined {
  if (!material) return undefined
  const list = Array.isArray(material) ? material : [material]
  return (
    list.find((m) => (m as THREE.MeshStandardMaterial).map) ??
    list.find((m) => (m as { color?: unknown }).color instanceof THREE.Color) ??
    list[0]
  )
}

/** Local-space points over skin: just above each eye (eyelid) and the cheeks. */
function skinSamplePoints(geom: THREE.BufferGeometry | undefined, lm: FaceLandmarks): THREE.Vector3[] {
  const pos = geom?.getAttribute('position') as THREE.BufferAttribute | undefined
  const f = computeFaceFrame(lm, pos ? meshCentroid(pos) : undefined)
  const eyeL = new THREE.Vector3(...lm.eyeLeft)
  const eyeR = new THREE.Vector3(...lm.eyeRight)
  const mouthL = new THREE.Vector3(...lm.mouthLeft)
  const mouthR = new THREE.Vector3(...lm.mouthRight)
  // Nudge toward the brow so we sample lid skin, not the eye opening / lashes.
  const up = f.up.clone().multiplyScalar(f.eyeW * 0.18)
  return [
    eyeL.clone().add(up),
    eyeR.clone().add(up),
    eyeL.clone().lerp(mouthL, 0.45), // cheek L
    eyeR.clone().lerp(mouthR, 0.45), // cheek R
  ]
}

/** Index of the geometry vertex nearest to a local point, or -1. */
function nearestVertex(geom: THREE.BufferGeometry | undefined, p: THREE.Vector3): number {
  const pos = geom?.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return -1
  let best = -1
  let bd = Infinity
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p.x
    const dy = pos.getY(i) - p.y
    const dz = pos.getZ(i) - p.z
    const d = dx * dx + dy * dy + dz * dz
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

/** Average the diffuse texture at the sample UVs (or whole image). Browser-only. */
function sampleTexture(
  map: THREE.Texture,
  geom: THREE.BufferGeometry | undefined,
  samples: THREE.Vector3[],
): THREE.Color | null {
  if (typeof document === 'undefined') return null
  const img = map.image as { width?: number; height?: number } | undefined
  const w = img?.width ?? 0
  const h = img?.height ?? 0
  if (!w || !h) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img as CanvasImageSource, 0, 0)
    const data = ctx.getImageData(0, 0, w, h).data // throws if CORS-tainted → caught
    const acc = new THREE.Color(0, 0, 0)
    let n = 0
    const wrap01 = (t: number) => ((t % 1) + 1) % 1
    const addPixel = (x: number, y: number) => {
      const i = (y * w + x) * 4
      if (data[i + 3] < 8) return // skip transparent
      acc.add(new THREE.Color().setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace))
      n++
    }
    const uv = geom?.getAttribute('uv') as THREE.BufferAttribute | undefined
    if (uv && samples.length) {
      for (const p of samples) {
        const idx = nearestVertex(geom, p)
        if (idx < 0) continue
        const x = Math.min(w - 1, Math.max(0, Math.floor(wrap01(uv.getX(idx)) * w)))
        const y = Math.min(h - 1, Math.max(0, Math.floor((1 - wrap01(uv.getY(idx))) * h)))
        addPixel(x, y)
      }
    }
    if (n === 0) {
      // No UVs / no samples: average a coarse grid of the whole texture.
      const step = Math.max(1, Math.floor(Math.min(w, h) / 16))
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) addPixel(x, y)
    }
    if (n === 0) return null
    return acc.multiplyScalar(1 / n)
  } catch {
    return null
  }
}

/** Average vertex colours at the sample points (or a coarse stride). */
function sampleVertexColors(geom: THREE.BufferGeometry, samples: THREE.Vector3[]): THREE.Color | null {
  const col = geom.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!col) return null
  const acc = new THREE.Color(0, 0, 0)
  let n = 0
  const addAt = (i: number) => {
    acc.r += col.getX(i)
    acc.g += col.getY(i)
    acc.b += col.getZ(i)
    n++
  }
  if (samples.length) {
    for (const p of samples) {
      const idx = nearestVertex(geom, p)
      if (idx >= 0) addAt(idx)
    }
  }
  if (n === 0) {
    const step = Math.max(1, Math.floor(col.count / 256))
    for (let i = 0; i < col.count; i += step) addAt(i)
  }
  if (n === 0) return null
  acc.r /= n
  acc.g /= n
  acc.b /= n
  return acc
}

/** Eyelid skin reads slightly deeper than the cheek average — keep it subtle. */
function tintForLid(c: THREE.Color): THREE.Color {
  return c.multiplyScalar(0.92)
}
