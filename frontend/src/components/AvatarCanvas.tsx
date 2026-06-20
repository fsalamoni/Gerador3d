/**
 * AvatarCanvas — renders the avatar and is driven by face-tracking frames.
 *
 * Supports three model sources:
 *  - VRM  (.vrm)  → full expression + head-pose retargeting (perfect-sync style)
 *  - GLB  (.glb)  → head-pose only (generated meshes usually lack ARKit shapes)
 *  - none         → a procedural head that reacts to jaw/blink/pose (demo)
 *
 * Parent calls `applyFrame()` (via ref) on every tracking result; the render
 * loop smooths and applies the latest frame.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import type { FaceFrame } from '../lib/face-tracking'
import { applyFaceToProcedural, applyFaceToVrm, applyFaceToGlbMorphs } from '../lib/avatar-mapping'

export interface AvatarCanvasHandle {
  applyFrame: (frame: FaceFrame) => void
}

interface Props {
  modelUrl?: string
  /** "vrm" | "glb"; inferred from the URL extension when omitted. */
  modelKind?: 'vrm' | 'glb'
  transparent?: boolean
  className?: string
}

const AvatarCanvas = forwardRef<AvatarCanvasHandle, Props>(function AvatarCanvas(
  { modelUrl, modelKind, transparent = false, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<FaceFrame | null>(null)

  useImperativeHandle(ref, () => ({
    applyFrame: (frame: FaceFrame) => {
      frameRef.current = frame
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    if (!transparent) scene.background = new THREE.Color(0x0b1020)

    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    if (transparent) renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 1.2)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(1, 2, 2)
    scene.add(key)

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
    }

    if (kind === 'none') {
      const built = buildProceduralHead()
      proceduralHead = built.head
      jaw = built.jaw
      eyeL = built.eyeL
      eyeR = built.eyeR
      scene.add(proceduralHead)
      setHeadCam(1.5, 1.7)
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

    const clock = new THREE.Clock()
    let raf = 0
    function animate() {
      raf = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const frame = frameRef.current

      if (vrm) {
        if (frame) applyFaceToVrm(vrm, frame, 0.5)
        vrm.update(delta)
      } else if (glbRoot && frame) {
        // Pose da cabeça
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
        // Feições faciais via morph targets ARKit do GLB (se houver)
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
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [modelUrl, modelKind, transparent])

  return <div ref={containerRef} className={`h-full w-full ${className}`} />
})

export default AvatarCanvas

// ── Procedural head (demo fallback) ───────────────────────────────────────────

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
