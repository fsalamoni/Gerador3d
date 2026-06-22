/**
 * AvatarCanvas — renders the avatar and is driven by face-tracking frames.
 *
 * Supports three model sources:
 *  - VRM  (.vrm)  → full expression + head-pose retargeting (perfect-sync style)
 *  - GLB  (.glb)  → head pose + ARKit morphs (native or procedurally generated)
 *  - none         → a procedural head that reacts to jaw/blink/pose (demo)
 *
 * Parent calls `applyFrame()` (via ref) on every tracking result; the render
 * loop smooths and applies the latest frame.
 *
 * Interactive mode (`interactive`) adds orbit controls + click-to-pick, used by
 * the facial-rig flow: the user marks eyes/mouth/jaw on the model and we
 * synthesize ARKit blendshapes on the fly ({@link buildProceduralMorphs}), so
 * even creatures and template-less generated meshes get working expressions.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import type { FaceFrame } from '../lib/face-tracking'
import { applyFaceToProcedural, applyFaceToVrm, applyFaceToGlbMorphs } from '../lib/avatar-mapping'
import {
  buildProceduralMorphs,
  loadLandmarks,
  type FaceLandmarks,
} from '../lib/procedural-face-rig'
import { buildMouthInterior, MOUTH_INTERIOR_NAME } from '../lib/mouth-interior'
import { buildEyeAnatomy, EYE_ANATOMY_NAME } from '../lib/eye-anatomy'
import { sampleSkinTone } from '../lib/skin-sampling'
import { exportGlb, exportVrm, type VrmMeta } from '../lib/avatar-export'

/** A surface point picked by clicking the model, in world + mesh-local space. */
export interface PickHit {
  world: [number, number, number]
  local: [number, number, number]
}

export interface AvatarCanvasHandle {
  applyFrame: (frame: FaceFrame) => void
  /** Arm one-shot pick mode; resolves on the next click on the model. */
  pickPoint: () => Promise<PickHit | null>
  cancelPick: () => void
  addMarker: (world: [number, number, number], color?: number) => void
  clearMarkers: () => void
  /** Redraw all markers from mesh-local positions (used to edit landmarks). */
  setMarkers: (points: { local: [number, number, number]; color?: number }[]) => void
  /** Heuristic landmark guess from the face mesh bounds (a starting point). */
  guessLandmarks: () => FaceLandmarks | null
  /** Build ARKit morphs on the face mesh from landmarks. `gain` = strength.
   * `parts.mouth` also generates a mouth interior (cavity + teeth + tongue);
   * `parts.eyes` generates eyeballs + eyelids that close as real geometry.
   * Throws if no mesh. */
  buildFaceRig: (
    lm: FaceLandmarks,
    gain?: number,
    parts?: { mouth?: boolean; eyes?: boolean },
  ) => string[]
  /** Whether a riggable mesh (with vertices) is loaded. */
  hasRiggableMesh: () => boolean
  /** Whether the loaded mesh already exposes ARKit-named morphs. */
  hasArkitMorphs: () => boolean
  /** Preview a single morph (0..1) with the camera off. */
  previewMorph: (name: string, value: number) => void
  clearPreview: () => void
  /** Bake the rigged avatar to a downloadable file (.glb keeps the whole model;
   * .vrm wraps the face mesh with a humanoid skeleton + VRM blendshapes). */
  exportAvatar: (format: 'glb' | 'vrm', meta?: VrmMeta) => Promise<ArrayBuffer>
}

interface Props {
  modelUrl?: string
  /** "vrm" | "glb"; inferred from the URL extension when omitted. */
  modelKind?: 'vrm' | 'glb'
  transparent?: boolean
  /** Enable orbit controls + click-to-pick (facial-rig flow). */
  interactive?: boolean
  className?: string
}

const ARKIT_HINT = ['jawOpen', 'mouthSmileLeft', 'eyeBlinkLeft', 'mouthFunnel']

function findLargestMesh(root: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null
  let bestN = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    const pos = m.isMesh ? (m.geometry as THREE.BufferGeometry)?.getAttribute('position') : null
    if (pos && pos.count > bestN) {
      bestN = pos.count
      best = m
    }
  })
  return best
}

function meshHasArkitMorphs(root: THREE.Object3D): boolean {
  let has = false
  root.traverse((o) => {
    const dict = (o as THREE.Mesh).morphTargetDictionary
    if (dict && ARKIT_HINT.some((k) => k in dict)) has = true
  })
  return has
}

const AvatarCanvas = forwardRef<AvatarCanvasHandle, Props>(function AvatarCanvas(
  { modelUrl, modelKind, transparent = false, interactive = false, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<FaceFrame | null>(null)

  // Shared three state (assigned in the effect, read by the handle methods).
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const rootRef = useRef<THREE.Object3D | null>(null) // vrm.scene or glbRoot
  const faceMeshRef = useRef<THREE.Mesh | null>(null)
  const markersRef = useRef<THREE.Group | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const pickResolveRef = useRef<((hit: PickHit | null) => void) | null>(null)
  const previewRef = useRef<{ name: string; value: number } | null>(null)

  useImperativeHandle(ref, () => ({
    applyFrame: (frame: FaceFrame) => {
      frameRef.current = frame
    },
    pickPoint: () =>
      new Promise<PickHit | null>((resolve) => {
        pickResolveRef.current?.(null) // cancel any pending pick
        pickResolveRef.current = resolve
      }),
    cancelPick: () => {
      pickResolveRef.current?.(null)
      pickResolveRef.current = null
    },
    addMarker: (world, color = 0x34d399) => {
      const group = markersRef.current
      if (!group) return
      group.add(makeMarker(world, color, markerRadius(rootRef.current)))
    },
    clearMarkers: () => {
      const group = markersRef.current
      if (!group) return
      for (const c of [...group.children]) group.remove(c)
    },
    setMarkers: (points) => {
      const group = markersRef.current
      const mesh = faceMeshRef.current
      if (!group) return
      for (const c of [...group.children]) group.remove(c)
      if (!mesh) return
      mesh.updateWorldMatrix(true, false)
      const r = markerRadius(rootRef.current)
      const v = new THREE.Vector3()
      for (const p of points) {
        v.set(p.local[0], p.local[1], p.local[2])
        mesh.localToWorld(v)
        group.add(makeMarker([v.x, v.y, v.z], p.color ?? 0x34d399, r))
      }
    },
    guessLandmarks: () => {
      const mesh = faceMeshRef.current
      if (!mesh) return null
      const geo = mesh.geometry as THREE.BufferGeometry
      geo.computeBoundingBox()
      const bb = geo.boundingBox
      if (!bb) return null
      const size = new THREE.Vector3()
      bb.getSize(size)
      const w = size.x || 1
      const hh = size.y || 1
      const cx = (bb.min.x + bb.max.x) / 2
      const zf = bb.max.z // assume +Z é a frente do rosto (o usuário ajusta se não for)
      const Y = (f: number) => bb.min.y + hh * f
      return {
        eyeLeft: [cx - w * 0.18, Y(0.66), zf],
        eyeRight: [cx + w * 0.18, Y(0.66), zf],
        mouthLeft: [cx - w * 0.11, Y(0.4), zf],
        mouthRight: [cx + w * 0.11, Y(0.4), zf],
        upperLip: [cx, Y(0.44), zf],
        lowerLip: [cx, Y(0.36), zf],
        browLeft: [cx - w * 0.18, Y(0.74), zf],
        browRight: [cx + w * 0.18, Y(0.74), zf],
        jaw: [cx, Y(0.22), zf],
      }
    },
    buildFaceRig: (lm, gain, parts) => {
      const mesh = faceMeshRef.current
      if (!mesh) throw new Error('Nenhuma malha de rosto carregada.')
      const names = buildProceduralMorphs(mesh, lm, gain ?? 1.5)
      // Drop any previously generated anatomy, then (re)build what's requested.
      for (const name of [MOUTH_INTERIOR_NAME, EYE_ANATOMY_NAME]) {
        const old = mesh.getObjectByName(name)
        if (old) old.parent?.remove(old)
      }
      if (parts?.mouth) {
        const interior = buildMouthInterior(mesh, lm)
        if (interior) mesh.add(interior)
      }
      if (parts?.eyes) {
        // Match the eyelids to the model's own skin instead of a neutral tone.
        const skin = sampleSkinTone(mesh, lm)
        const eyes = buildEyeAnatomy(mesh, lm, { skinColor: skin.color })
        if (eyes) mesh.add(eyes)
      }
      return names
    },
    hasRiggableMesh: () => Boolean(faceMeshRef.current),
    hasArkitMorphs: () => (rootRef.current ? meshHasArkitMorphs(rootRef.current) : false),
    previewMorph: (name, value) => {
      previewRef.current = { name, value }
      // Drive the morph wherever it exists across the face subtree (the face
      // mesh itself + any generated mouth/eye anatomy children).
      faceMeshRef.current?.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.morphTargetDictionary && name in m.morphTargetDictionary && m.morphTargetInfluences) {
          m.morphTargetInfluences[m.morphTargetDictionary[name]] = value
        }
      })
    },
    clearPreview: () => {
      previewRef.current = null
      faceMeshRef.current?.traverse((o) => {
        const inf = (o as THREE.Mesh).morphTargetInfluences
        if (inf) inf.fill(0)
      })
    },
    exportAvatar: (format, meta) => {
      if (format === 'vrm') {
        const mesh = faceMeshRef.current
        if (!mesh) return Promise.reject(new Error('Sem malha de rosto para exportar.'))
        // Neutralize any preview weights so the rest pose is exported.
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0)
        return exportVrm(mesh, meta ?? {})
      }
      const root = rootRef.current
      if (!root) return Promise.reject(new Error('Sem modelo para exportar.'))
      return exportGlb(root)
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    sceneRef.current = scene
    if (!transparent) scene.background = new THREE.Color(0x0b1020)

    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    if (transparent) renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 1.2)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(1, 2, 2)
    scene.add(key)

    const markers = new THREE.Group()
    scene.add(markers)
    markersRef.current = markers

    let controls: OrbitControls | null = null

    // Refs to the active model state
    let vrm: VRM | null = null
    let glbRoot: THREE.Object3D | null = null
    let proceduralHead: THREE.Group | null = null
    let jaw: THREE.Object3D | null = null
    let eyeL: THREE.Object3D | null = null
    let eyeR: THREE.Object3D | null = null
    let disposed = false

    const kind: 'vrm' | 'glb' | 'none' = !modelUrl
      ? 'none'
      : (modelKind ?? (modelUrl.toLowerCase().endsWith('.vrm') ? 'vrm' : 'glb'))

    function setHeadCam(y: number, dist: number) {
      camera.position.set(0, y, dist)
      camera.lookAt(0, y, 0)
      if (controls) {
        controls.target.set(0, y, 0)
        controls.update()
      }
    }

    function enableControls(focusY: number) {
      if (!interactive || controls) return
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.target.set(0, focusY, 0)
      controls.update()
    }

    /** After a model loads: pick the face mesh and apply any saved rig. */
    function onModelReady(root: THREE.Object3D) {
      rootRef.current = root
      const mesh = findLargestMesh(root)
      faceMeshRef.current = mesh
      if (mesh && modelUrl && !meshHasArkitMorphs(root)) {
        const saved = loadLandmarks(modelUrl)
        if (saved) {
          try {
            buildProceduralMorphs(mesh, saved)
          } catch {
            /* ignore — live tracking still drives head pose */
          }
        }
      }
    }

    if (kind === 'none') {
      const built = buildProceduralHead()
      proceduralHead = built.head
      jaw = built.jaw
      eyeL = built.eyeL
      eyeR = built.eyeR
      scene.add(proceduralHead)
      setHeadCam(1.5, 1.7)
      enableControls(1.5)
    } else if (kind === 'vrm') {
      const loader = new GLTFLoader()
      loader.register((parser) => new VRMLoaderPlugin(parser))
      loader.load(
        modelUrl as string,
        (gltf) => {
          if (disposed) return
          vrm = gltf.userData.vrm as VRM
          vrm.scene.rotation.y = Math.PI // face the camera
          scene.add(vrm.scene)
          setHeadCam(1.35, 1.1)
          enableControls(1.35)
          onModelReady(vrm.scene)
        },
        undefined,
        () => fallbackToProcedural(),
      )
    } else {
      const loader = new GLTFLoader()
      loader.load(
        modelUrl as string,
        (gltf) => {
          if (disposed) return
          glbRoot = gltf.scene
          glbRoot.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              mats.forEach((m) => { if (m) (m as THREE.Material).side = THREE.DoubleSide })
            }
          })
          frameObject(glbRoot)
          scene.add(glbRoot)
          setHeadCam(1.4, 2.0)
          enableControls(1.4)
          onModelReady(glbRoot)
        },
        undefined,
        () => fallbackToProcedural(),
      )
    }

    function fallbackToProcedural() {
      if (disposed) return
      const built = buildProceduralHead()
      proceduralHead = built.head
      jaw = built.jaw
      eyeL = built.eyeL
      eyeR = built.eyeR
      scene.add(proceduralHead)
      setHeadCam(1.5, 1.7)
    }

    // ── Click-to-pick (rig flow) ────────────────────────────────────────────
    // We pick on pointer-UP only when there was no drag, so orbiting the model
    // (a drag) never drops a stray marker.
    let downX = 0
    let downY = 0
    function onPointerDown(ev: PointerEvent) {
      downX = ev.clientX
      downY = ev.clientY
    }
    function onPointerUp(ev: PointerEvent) {
      const resolve = pickResolveRef.current
      const root = rootRef.current
      if (!resolve || !root) return
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return // was a drag
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycasterRef.current.setFromCamera(ndc, camera)
      const hits = raycasterRef.current.intersectObject(root, true)
      const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh)
      if (!hit) return
      // Prefer the clicked mesh as the face mesh (handles multi-mesh models).
      const hitMesh = hit.object as THREE.Mesh
      if ((hitMesh.geometry as THREE.BufferGeometry)?.getAttribute('position')) {
        faceMeshRef.current = hitMesh
      }
      const localV = hitMesh.worldToLocal(hit.point.clone())
      pickResolveRef.current = null
      resolve({
        world: [hit.point.x, hit.point.y, hit.point.z],
        local: [localV.x, localV.y, localV.z],
      })
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const clock = new THREE.Clock()
    let raf = 0
    function animate() {
      raf = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const frame = frameRef.current
      controls?.update()

      if (vrm) {
        if (frame) applyFaceToVrm(vrm, frame, 0.5)
        vrm.update(delta)
        // Also drive raw ARKit morphs directly (works when VRM expression binds
        // are missing, e.g. procedurally-rigged meshes). No-op without them.
        if (frame) applyFaceToGlbMorphs(vrm.scene, frame, 0.5)
      } else if (glbRoot && frame) {
        if (frame.matrix && frame.matrix.length >= 16) {
          const m = new THREE.Matrix4().fromArray(frame.matrix)
          const q = new THREE.Quaternion()
          m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
          const e = new THREE.Euler().setFromQuaternion(q, 'YXZ')
          const target = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(e.x * 0.4, -e.y * 0.4, -e.z * 0.4, 'YXZ'),
          )
          glbRoot.quaternion.slerp(target, 0.4)
        }
        applyFaceToGlbMorphs(glbRoot, frame, 0.5)
      } else if (proceduralHead) {
        if (frame) applyFaceToProcedural(proceduralHead, jaw, eyeL, eyeR, frame, 0.4)
      }

      renderer.render(scene, camera)
    }
    animate()

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
      rootRef.current = null
      faceMeshRef.current = null
      markersRef.current = null
      pickResolveRef.current = null
    }
  }, [modelUrl, modelKind, transparent, interactive])

  return <div ref={containerRef} className={`h-full w-full ${className}`} />
})

export default AvatarCanvas

// ── Procedural head (demo fallback) ───────────────────────────────────────────

function markerRadius(root: THREE.Object3D | null): number {
  if (!root) return 0.02
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  return Math.max(0.008, Math.max(size.x, size.y, size.z) * 0.02)
}

function makeMarker(world: [number, number, number], color: number, r: number): THREE.Mesh {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(r, 16, 16),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }),
  )
  s.renderOrder = 999
  s.position.set(world[0], world[1], world[2])
  return s
}

function buildProceduralHead(): {
  head: THREE.Group
  jaw: THREE.Mesh
  eyeL: THREE.Mesh
  eyeR: THREE.Mesh
} {
  const head = new THREE.Group()
  head.position.y = 1.5

  const skin = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b1020 })

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), skin)
  head.add(skull)

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.45), skin)
  jaw.position.set(0, -0.18, 0.12)
  head.add(jaw)

  const eyeGeo = new THREE.SphereGeometry(0.09, 16, 16)
  const eyeL = new THREE.Mesh(eyeGeo, dark)
  eyeL.position.set(-0.18, 0.08, 0.42)
  head.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, dark)
  eyeR.position.set(0.18, 0.08, 0.42)
  head.add(eyeR)

  return { head, jaw, eyeL, eyeR }
}

function frameObject(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = 1.6 / maxDim
  object.scale.setScalar(scale)
  object.position.sub(center.multiplyScalar(scale))
  object.position.y += 1.4
}
