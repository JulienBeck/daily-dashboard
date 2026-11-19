import {
  ACESFilmicToneMapping,
  type AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  type Material,
  type Mesh,
  type Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { tint } from './wardrobe.js'

export interface Stage {
  show(parts: ReadonlySet<string>): void
  dispose(): void
}

interface Model {
  scene: Object3D
  animations: AnimationClip[]
}

const loader = new GLTFLoader()
const models = new Map<string, Promise<Model>>()

function load(url: string): Promise<Model> {
  let model = models.get(url)
  if (!model) {
    model = loader.loadAsync(url)
    model.catch(() => models.delete(url))
    models.set(url, model)
  }
  return model
}

function paint(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials as (Material & { color?: Color })[]) {
      const colour = tint(material.name)
      if (colour && material.color) material.color.set(colour)
    }
  })
}

export async function createStage(canvas: HTMLCanvasElement, url: string, still: boolean): Promise<Stage> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  try {
    return await stage(renderer, canvas, await load(url), still)
  } catch (error) {
    renderer.dispose()
    throw error
  }
}

function stage(renderer: WebGLRenderer, canvas: HTMLCanvasElement, model: Model, still: boolean): Stage {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95

  const scene = new Scene()
  const environment = new PMREMGenerator(renderer)
  scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.7
  scene.add(new HemisphereLight(0xfff1dc, 0x2a2018, 0.6))
  const key = new DirectionalLight(0xffe6c4, 2.4)
  key.position.set(1.6, 2.6, 2.4)
  scene.add(key)
  const rim = new DirectionalLight(0xa8c4ff, 1.6)
  rim.position.set(-1.8, 2.2, -2.2)
  scene.add(rim)

  const figure = clone(model.scene)
  paint(figure)
  scene.add(figure)

  const bounds = new Box3().setFromObject(figure)
  const size = bounds.getSize(new Vector3())
  const centre = bounds.getCenter(new Vector3())
  const camera = new PerspectiveCamera(22, 1, 0.1, 50)
  const fit = () => {
    const width = canvas.clientWidth || 240
    const height = canvas.clientHeight || 340
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const distance = Math.max(size.y * 1.08, (size.x * 1.25) / camera.aspect) / (2 * Math.tan((camera.fov * Math.PI) / 360))
    camera.position.set(centre.x, centre.y + size.y * 0.02, centre.z + distance)
    camera.lookAt(centre.x, centre.y, centre.z)
    camera.updateProjectionMatrix()
  }
  fit()

  const mixer = new AnimationMixer(figure)
  const idle = model.animations.find((clip) => clip.name === 'idle')
  if (idle) {
    const action = mixer.clipAction(idle).play()
    action.paused = still
    mixer.update(0)
  }

  let turn = 0
  let dragging: number | null = null
  const down = (event: PointerEvent) => {
    dragging = event.clientX
    canvas.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (dragging === null) return
    turn += (event.clientX - dragging) * 0.012
    dragging = event.clientX
  }
  const up = () => {
    dragging = null
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)

  const resize = new ResizeObserver(fit)
  resize.observe(canvas)

  const timer = new Timer()
  let frame = 0
  const draw = () => {
    timer.update()
    mixer.update(timer.getDelta())
    if (dragging === null) turn *= 0.94
    figure.rotation.y = turn
    renderer.render(scene, camera)
    frame = requestAnimationFrame(draw)
  }
  draw()

  return {
    show(parts) {
      figure.traverse((node) => {
        if ((node as Mesh).isMesh) node.visible = parts.has(node.name) || parts.has(node.parent?.name ?? '')
      })
    },
    dispose() {
      cancelAnimationFrame(frame)
      resize.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      mixer.stopAllAction()
      environment.dispose()
      renderer.dispose()
    },
  }
}
