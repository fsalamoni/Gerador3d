/**
 * ModelViewer — renders a GLB/GLTF model with Three.js, or a procedural avatar
 * placeholder when no URL is available (demo mode / pending jobs). Includes
 * orbit controls and gentle auto-rotation.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface Props {
  url?: string
  className?: string
  autoRotate?: boolean
}

export default function ModelViewer({ url, className = '', autoRotate = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b1020)

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 1.2, 3.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(2, 4, 3)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x6366f1, 0.8)
    rim.position.set(-3, 2, -2)
    scene.add(rim)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.6
    controls.target.set(0, 0.8, 0)

    const root = new THREE.Group()
    scene.add(root)

    let disposed = false

    function frameObject(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const scale = 1.8 / maxDim
      object.scale.setScalar(scale)
      object.position.sub(center.multiplyScalar(scale))
      object.position.y += 0.8
    }

    if (url) {
      const loader = new GLTFLoader()
      loader.load(
        url,
        (gltf) => {
          if (disposed) return
          // Modelos gerados (marching cubes) podem ter faces com orientação
          // invertida; renderizar double-sided evita o modelo "sumir".
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              mats.forEach((m) => { if (m) (m as THREE.Material).side = THREE.DoubleSide })
            }
          })
          root.add(gltf.scene)
          frameObject(gltf.scene)
        },
        undefined,
        () => {
          if (!disposed) root.add(makePlaceholder())
        },
      )
    } else {
      root.add(makePlaceholder())
    }

    let raf = 0
    const clock = new THREE.Clock()
    function animate() {
      raf = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      if (!url) root.rotation.y = t * 0.6
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    function onResize() {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          const mat = obj.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
    }
  }, [url, autoRotate])

  return <div ref={containerRef} className={`h-full w-full ${className}`} />
}

/** A stylized capsule "avatar" used as a placeholder when no model is loaded. */
function makePlaceholder(): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    metalness: 0.2,
    roughness: 0.4,
  })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 8, 24), material)
  body.position.y = 0.75
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), material)
  head.position.y = 1.7
  group.add(head)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 48),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  group.add(ground)

  return group
}
