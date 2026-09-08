<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PerspectiveCamera,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ConstellationDepthMode } from '../../lib/constellationGeometry.ts'
import { constellationAtJ2000, unitDirectionToEquatorial } from '../../lib/constellationRegions.ts'
import type { Vec3 } from '../../lib/kepler.ts'
import {
  orbitRotateSpeed,
  overviewDragDelta,
  type ConstellationDragMode,
} from './constellationDragControls.ts'
import { sliceOrbitMinDistance, syncGeometryBounds } from './constellationSceneBounds.ts'
import { canRebuildInPlace, shouldAnimateCamera, type SceneMode } from './constellationSceneLifecycle.ts'
import {
  FOCUS_GOLD_COLOR,
  SLICE_GEOMETRY_COLOR,
  buildOverviewFigureEdges,
  buildOverviewStarField,
  buildSelectionModel,
  collectNameWorthyPicks,
  collectStemFootSpots,
  pickNearestByScreenDistance,
  type ConstellationScaleData,
  type ConstellationSelectionModel,
  type NameWorthyPick,
  type OverviewStarField,
} from './constellationSceneModel.ts'
import {
  deselectMorphAmount,
  deselectOpacityAmount,
  deselectPhaseWeights,
  earthPovCameraOffset,
  easeInOutCubic,
  frontFacingCameraOffset,
  yawPitchFromDirection,
} from './constellationSceneTransition.ts'

const props = withDefaults(
  defineProps<{
    selectedId?: string | null
    showStems?: boolean
    depthMode?: ConstellationDepthMode
    previewFigureLines?: boolean
    listPreviewId?: string | null
    dragMode?: ConstellationDragMode
  }>(),
  {
    selectedId: null,
    showStems: false,
    depthMode: 'compressed',
    previewFigureLines: true,
    listPreviewId: null,
    dragMode: 'normal',
  },
)

const emit = defineEmits<{
  select: [id: string]
  'scale-change': [scale: ConstellationScaleData | null]
}>()

// --- Constants -------------------------------------------------------------
const OVERVIEW_RADIUS = 100
const SLICE_TARGET_RADIUS = 60
const OVERVIEW_DIM_OPACITY = 0.16
const TRANSITION_MS = 1100
const SLICE_CAMERA_DISTANCE = SLICE_TARGET_RADIUS * 2.4
const CAMERA_FOV = 60
const DRAG_THRESHOLD_PX = 6
const CLICK_MAX_MS = 500
const PICK_THRESHOLD = 1.6
const NAME_PICK_RADIUS_PX = 18
const MAX_PITCH = (85 * Math.PI) / 180

// --- Template refs and accessible state ------------------------------------
const container = ref<HTMLDivElement | null>(null)
const webglFailed = ref(false)
const instructionsId = useId()
const objectTooltip = ref<{
  name: string
  detailLines: readonly string[]
  x: number
  y: number
} | null>(null)

// --- Three.js state (deliberately non-reactive) ----------------------------
// Three objects must never be wrapped in Vue reactivity, or their internal
// mutation breaks. Everything below lives in plain closure variables.
let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raycaster: Raycaster | null = null
let resizeObserver: ResizeObserver | null = null
let reducedMotionQuery: MediaQueryList | null = null

let overviewField: OverviewStarField | null = null
let overviewPoints: Points | null = null
let overviewMaterial: ShaderMaterial | null = null

// Transient gold hover marker: the only place focus gold is used, to preview
// which selectable star a click/tap would open.
let hoverPoints: Points | null = null
let hoverMaterial: ShaderMaterial | null = null

// Overview stick-figure preview driven by list hover or sky-region hover.
let previewLines: LineSegments | null = null
let previewLineMaterial: LineBasicMaterial | null = null
let previewConstellationId: string | null = null
let regionPreviewId: string | null = null

let selectionGroup: Group | null = null
/** Unit depth of the active selection; drives the Earth-view exit aim. */
let activeSelectionDepth: Vec3 | null = null
/** Slice-space Earth position relative to the orbit target (centroid). */
let activeEarthWorldOffset: Vec3 | null = null
type Morphable = { attribute: Float32BufferAttribute; start: Float32Array; end: Float32Array }
let morphables: Morphable[] = []
let nameWorthyPicks: { pick: NameWorthyPick; world: Vector3 }[] = []
const nameWorthyScreenScratch = new Vector3()

let rafId = 0
let needsRender = false

let sceneMode: SceneMode = 'overview'
// A depth/stem change arriving mid-transition can't remap the slice yet; this
// flag remembers to apply the latest props once the fly-in settles.
let pendingRebuild = false

// Overview orientation (camera sits at Earth and looks outward).
let yaw = 0
let pitch = 0

// Pointer gesture bookkeeping for drag-vs-click discrimination.
let pointerDownX = 0
let pointerDownY = 0
let pointerDownTime = 0
let pointerMoved = false
let dragging = false
let activePointerId: number | null = null

// Camera transition endpoints. Deselect also uses the mid pose (Earth line of sight
// at slice distance) between start and end.
let camStart = new Vector3()
let camMid = new Vector3()
let camEnd = new Vector3()
let lookStart = new Vector3()
let lookMid = new Vector3()
let lookEnd = new Vector3()
let overviewOpacityStart = 1
let overviewOpacityEnd = 1
let transitionStartTime = 0

// Settled-slice Earth POV tween: stays in `slice` mode, keeps OrbitControls free,
// and yields immediately if the user starts dragging mid-flight.
let earthPovAnimating = false
let earthPovStartTime = 0
const earthPovCamStart = new Vector3()
const earthPovCamEnd = new Vector3()

const VERTEX_SHADER = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uPixelRatio;
uniform float uSizeScale;
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uSizeScale * uPixelRatio;
}
`

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
uniform float uOpacity;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vColor, alpha * uOpacity);
}
`

// --- Helpers ---------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false
}

function scheduleFrame(): void {
  if (rafId === 0) rafId = requestAnimationFrame(animate)
}

function requestRender(): void {
  needsRender = true
  scheduleFrame()
}

function overviewLookDirection(): Vector3 {
  const cosPitch = Math.cos(pitch)
  return new Vector3(
    cosPitch * Math.cos(yaw),
    cosPitch * Math.sin(yaw),
    Math.sin(pitch),
  ).normalize()
}

function applyOverviewCamera(): void {
  if (!camera) return
  camera.position.set(0, 0, 0)
  const look = overviewLookDirection().multiplyScalar(OVERVIEW_RADIUS)
  camera.lookAt(look)
  requestRender()
}

// --- Overview construction -------------------------------------------------

function buildOverview(): void {
  if (!scene) return
  overviewField = buildOverviewStarField()
  const { count, positions, colors, sizes } = overviewField

  const scaled = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i++) scaled[i] = positions[i] * OVERVIEW_RADIUS

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(scaled, 3))
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors.slice(), 3))
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes.slice(), 1))

  overviewMaterial = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
      uSizeScale: { value: 1 },
      uOpacity: { value: 1 },
    },
  })

  overviewPoints = new Points(geometry, overviewMaterial)
  overviewPoints.name = `overview-${count}`
  scene.add(overviewPoints)

  buildHoverMarker()
}

function buildHoverMarker(): void {
  if (!scene) return
  const focusGold = new Color(FOCUS_GOLD_COLOR)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(3), 3))
  geometry.setAttribute(
    'aColor',
    new Float32BufferAttribute(Float32Array.of(focusGold.r, focusGold.g, focusGold.b), 3),
  )
  geometry.setAttribute('aSize', new Float32BufferAttribute(Float32Array.of(11), 1))
  hoverMaterial = new ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
      uSizeScale: { value: 1 },
      uOpacity: { value: 0.9 },
    },
  })
  hoverPoints = new Points(geometry, hoverMaterial)
  hoverPoints.name = 'hover-marker'
  hoverPoints.visible = false
  scene.add(hoverPoints)
}

function hideHover(): void {
  if (hoverPoints?.visible) {
    hoverPoints.visible = false
    requestRender()
  }
}

function clearObjectTooltip(): void {
  if (objectTooltip.value !== null) objectTooltip.value = null
}

function disposePreviewLines(): void {
  if (!previewLines) return
  scene?.remove(previewLines)
  previewLines.geometry.dispose()
  previewLines = null
  previewLineMaterial?.dispose()
  previewLineMaterial = null
  previewConstellationId = null
}

function setPreviewConstellation(id: string | null): void {
  if (!props.previewFigureLines || sceneMode !== 'overview' || props.selectedId !== null) {
    disposePreviewLines()
    return
  }
  if (id === previewConstellationId) return
  disposePreviewLines()
  if (!id || !scene) return
  const field = buildOverviewFigureEdges(id)
  if (!field) return
  const scaled = new Float32Array(field.positions.length)
  for (let i = 0; i < field.positions.length; i++) scaled[i] = field.positions[i] * OVERVIEW_RADIUS
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(scaled, 3))
  previewLineMaterial = new LineBasicMaterial({
    color: new Color(FOCUS_GOLD_COLOR),
    transparent: true,
    opacity: 0.85,
  })
  previewLines = new LineSegments(geometry, previewLineMaterial)
  previewLines.name = `preview-edges-${id}`
  scene.add(previewLines)
  previewConstellationId = id
  requestRender()
}

function syncPreviewFromSources(): void {
  setPreviewConstellation(props.listPreviewId ?? regionPreviewId)
}

function pickRegionId(event: PointerEvent): string | null {
  if (!raycaster || !camera) return null
  const ndc = pointerToNdc(event)
  if (!ndc) return null
  raycaster.setFromCamera(ndc, camera)
  const direction = raycaster.ray.direction
  if (direction.lengthSq() < 1e-12) return null
  const equatorial = unitDirectionToEquatorial({
    x: direction.x,
    y: direction.y,
    z: direction.z,
  })
  return constellationAtJ2000(equatorial.raDeg, equatorial.decDeg)
}

// --- Selection construction ------------------------------------------------

function frameBasis(model: ConstellationSelectionModel): {
  east: Vector3
  north: Vector3
  depth: Vector3
  matrix: Matrix4
} {
  const east = new Vector3(model.frame.east.x, model.frame.east.y, model.frame.east.z)
  const north = new Vector3(model.frame.north.x, model.frame.north.y, model.frame.north.z)
  const depth = new Vector3(model.frame.depth.x, model.frame.depth.y, model.frame.depth.z)
  const matrix = new Matrix4().makeBasis(east, north, depth)
  return { east, north, depth, matrix }
}

function overviewStartVector(direction: Vec3): Vector3 {
  return new Vector3(direction.x, direction.y, direction.z).multiplyScalar(OVERVIEW_RADIUS)
}

function makeColorArray(count: number, color: Color): Float32Array {
  const array = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    array[i * 3] = color.r
    array[i * 3 + 1] = color.g
    array[i * 3 + 2] = color.b
  }
  return array
}

function registerMorphable(
  geometry: BufferGeometry,
  starts: Vector3[],
  ends: Vector3[],
): Float32BufferAttribute {
  const start = new Float32Array(starts.length * 3)
  const end = new Float32Array(ends.length * 3)
  for (let i = 0; i < starts.length; i++) {
    start[i * 3] = starts[i].x
    start[i * 3 + 1] = starts[i].y
    start[i * 3 + 2] = starts[i].z
    end[i * 3] = ends[i].x
    end[i * 3 + 1] = ends[i].y
    end[i * 3 + 2] = ends[i].z
  }
  const attribute = new Float32BufferAttribute(start.slice(), 3)
  geometry.setAttribute('position', attribute)
  morphables.push({ attribute, start, end })
  return attribute
}

function buildSelection(model: ConstellationSelectionModel): void {
  if (!scene) return
  disposeSelection()

  const group = new Group()
  group.name = `selection-${model.id}`
  morphables = []
  nameWorthyPicks = []
  activeSelectionDepth = {
    x: model.frame.depth.x,
    y: model.frame.depth.y,
    z: model.frame.depth.z,
  }

  const { east, north, depth } = frameBasis(model)
  const centroid = model.centroidLocal

  // Fit scale so the compressed slice fills a comfortable on-screen radius.
  let maxReach = 0
  const localToWorld = (local: Vec3): Vector3 =>
    new Vector3()
      .addScaledVector(east, local.x - centroid.x)
      .addScaledVector(north, local.y - centroid.y)
      .addScaledVector(depth, local.z - centroid.z)
  for (const star of model.stars) {
    if (star.displayLocal) maxReach = Math.max(maxReach, localToWorld(star.displayLocal).length())
  }
  for (const landmark of model.landmarks) {
    maxReach = Math.max(maxReach, localToWorld(landmark.displayLocal).length())
  }
  const fitScale = maxReach > 1e-6 ? SLICE_TARGET_RADIUS / maxReach : 1
  const slicePoint = (local: Vec3): Vector3 => localToWorld(local).multiplyScalar(fitScale)
  // Earth is the local-frame origin; in true scale this is the correct POV stand.
  const earthWorld = slicePoint({ x: 0, y: 0, z: 0 })
  activeEarthWorldOffset = { x: earthWorld.x, y: earthWorld.y, z: earthWorld.z }

  const starColor = SLICE_GEOMETRY_COLOR
  const referenceColor = new Color(SLICE_GEOMETRY_COLOR)

  // Placed stars (those with a measured distance) morph into the slice. Figure
  // stars keep their measured spectral color and only read larger/brighter; the
  // focus gold is reserved for the transient hover marker, not a persistent fill.
  const placedStars = model.stars.filter((star) => star.displayLocal !== null)
  if (placedStars.length > 0) {
    const geometry = new BufferGeometry()
    const starts: Vector3[] = []
    const ends: Vector3[] = []
    const colors = new Float32Array(placedStars.length * 3)
    const sizes = new Float32Array(placedStars.length)
    placedStars.forEach((star, index) => {
      starts.push(overviewStartVector(star.direction))
      ends.push(slicePoint(star.displayLocal as Vec3))
      colors[index * 3] = star.color.r
      colors[index * 3 + 1] = star.color.g
      colors[index * 3 + 2] = star.color.b
      sizes[index] = star.size * (star.kind === 'figure' ? 1.5 : 0.9)
    })
    registerMorphable(geometry, starts, ends)
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1))
    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
        uSizeScale: { value: 1 },
        uOpacity: { value: 1 },
      },
    })
    const points = new Points(geometry, material)
    points.name = 'selected-stars'
    group.add(points)
  }

  // Figure edges: only where both endpoints have a placed position.
  const edgeStarts: Vector3[] = []
  const edgeEnds: Vector3[] = []
  for (const edge of model.edges) {
    const from = model.stars[edge.fromIndex]
    const to = model.stars[edge.toIndex]
    if (!from.displayLocal || !to.displayLocal) continue
    edgeStarts.push(overviewStartVector(from.direction), overviewStartVector(to.direction))
    edgeEnds.push(slicePoint(from.displayLocal), slicePoint(to.displayLocal))
  }
  if (edgeStarts.length > 0) {
    const geometry = new BufferGeometry()
    registerMorphable(geometry, edgeStarts, edgeEnds)
    const material = new LineBasicMaterial({
      color: new Color(starColor),
      transparent: true,
      opacity: 0.75,
    })
    const lines = new LineSegments(geometry, material)
    lines.name = 'figure-edges'
    group.add(lines)
  }

  // Stems down to the reference plane, plus a soft light spot at every foot,
  // built and disposed together so the two never drift apart.
  if (props.showStems) {
    const directionById = new Map<string, Vec3>()
    for (const star of model.stars) directionById.set(star.id, star.direction)
    for (const landmark of model.landmarks) directionById.set(landmark.id, landmark.direction)

    const stemStarts: Vector3[] = []
    const stemEnds: Vector3[] = []
    const collectStem = (direction: Vec3, stem: { tip: Vec3; foot: Vec3 } | null): void => {
      if (!stem) return
      const origin = overviewStartVector(direction)
      stemStarts.push(origin, origin)
      stemEnds.push(slicePoint(stem.tip), slicePoint(stem.foot))
    }
    for (const star of model.stars) collectStem(star.direction, star.stem)
    for (const landmark of model.landmarks) collectStem(landmark.direction, landmark.stem)
    if (stemStarts.length > 0) {
      const geometry = new BufferGeometry()
      registerMorphable(geometry, stemStarts, stemEnds)
      const material = new LineBasicMaterial({
        color: referenceColor,
        transparent: true,
        opacity: 0.35,
      })
      const stems = new LineSegments(geometry, material)
      stems.name = 'stems'
      group.add(stems)
    }

    const footSpots = collectStemFootSpots(model)
    if (footSpots.length > 0) {
      const geometry = new BufferGeometry()
      const spotStarts: Vector3[] = []
      const spotEnds: Vector3[] = []
      for (const spot of footSpots) {
        const direction = directionById.get(spot.sourceId)
        if (!direction) continue
        spotStarts.push(overviewStartVector(direction))
        spotEnds.push(slicePoint(spot.position))
      }
      registerMorphable(geometry, spotStarts, spotEnds)
      geometry.setAttribute(
        'aColor',
        new Float32BufferAttribute(makeColorArray(spotEnds.length, referenceColor), 3),
      )
      geometry.setAttribute(
        'aSize',
        new Float32BufferAttribute(new Float32Array(spotEnds.length).fill(13), 1),
      )
      const material = new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
          uSizeScale: { value: 1 },
          uOpacity: { value: 0.55 },
        },
      })
      const spots = new Points(geometry, material)
      spots.name = 'stem-foot-spots'
      group.add(spots)
    }
  }

  // In-galaxy landmarks.
  if (model.landmarks.length > 0) {
    const geometry = new BufferGeometry()
    const starts: Vector3[] = []
    const ends: Vector3[] = []
    for (const landmark of model.landmarks) {
      starts.push(overviewStartVector(landmark.direction))
      ends.push(slicePoint(landmark.displayLocal))
    }
    registerMorphable(geometry, starts, ends)
    geometry.setAttribute(
      'aColor',
      new Float32BufferAttribute(makeColorArray(ends.length, referenceColor), 3),
    )
    geometry.setAttribute(
      'aSize',
      new Float32BufferAttribute(new Float32Array(ends.length).fill(7), 1),
    )
    const material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: renderer?.getPixelRatio() ?? 1 },
        uSizeScale: { value: 1 },
        uOpacity: { value: 1 },
      },
    })
    const points = new Points(geometry, material)
    points.name = 'landmarks'
    group.add(points)
  }

  // Restrained reference-plane outline beneath the slice.
  const referenceOutline = buildReferencePlaneOutline(model, slicePoint, referenceColor)
  if (referenceOutline) group.add(referenceOutline)

  const named = collectNameWorthyPicks(model)
  for (const pick of named) {
    nameWorthyPicks.push({ pick, world: slicePoint(pick.position) })
  }

  scene.add(group)
  selectionGroup = group
}

function buildReferencePlaneOutline(
  model: ConstellationSelectionModel,
  slicePoint: (local: Vec3) => Vector3,
  color: Color,
): Line | null {
  const { bounds, referencePlaneY } = model.slice
  if (bounds.minX === bounds.maxX && bounds.minZ === bounds.maxZ) return null
  const corners: Vec3[] = [
    { x: bounds.minX, y: referencePlaneY, z: bounds.minZ },
    { x: bounds.maxX, y: referencePlaneY, z: bounds.minZ },
    { x: bounds.maxX, y: referencePlaneY, z: bounds.maxZ },
    { x: bounds.minX, y: referencePlaneY, z: bounds.maxZ },
    { x: bounds.minX, y: referencePlaneY, z: bounds.minZ },
  ]
  const geometry = new BufferGeometry().setFromPoints(corners.map((corner) => slicePoint(corner)))
  const material = new LineBasicMaterial({ color, transparent: true, opacity: 0.25 })
  const line = new Line(geometry, material)
  line.name = 'reference-plane'
  return line
}

// --- Transitions -----------------------------------------------------------

function startSelectionTransition(model: ConstellationSelectionModel): void {
  if (!camera) return
  cancelEarthPovAnimation()
  hideHover()
  regionPreviewId = null
  disposePreviewLines()
  clearObjectTooltip()
  if (renderer) renderer.domElement.style.cursor = 'default'
  // A fresh build already reflects the current props, so drop any deferred remap.
  pendingRebuild = false
  buildSelection(model)
  sceneMode = 'toSlice'

  // Side view: offset along the frame's east axis, lifted along north.
  const { east, north } = frameBasis(model)
  camStart = camera.position.clone()
  camEnd = new Vector3()
    .addScaledVector(east, SLICE_CAMERA_DISTANCE)
    .addScaledVector(north, SLICE_CAMERA_DISTANCE * 0.35)
  lookStart = overviewLookDirection().multiplyScalar(OVERVIEW_RADIUS).add(camStart)
  lookEnd = new Vector3(0, 0, 0)
  overviewOpacityStart = overviewMaterial?.uniforms.uOpacity.value ?? 1
  overviewOpacityEnd = OVERVIEW_DIM_OPACITY

  if (prefersReducedMotion()) {
    finishTransition()
  } else {
    transitionStartTime = performance.now()
    requestRender()
  }
}

function cancelEarthPovAnimation(): void {
  if (!earthPovAnimating) return
  earthPovAnimating = false
  if (camera) {
    camera.lookAt(0, 0, 0)
    controls?.update()
  }
  requestRender()
}

function applyEarthPovProgress(t: number): void {
  if (!camera) return
  const eased = easeInOutCubic(t)
  camera.position.lerpVectors(earthPovCamStart, earthPovCamEnd, eased)
  camera.lookAt(0, 0, 0)
}

function finishEarthPovAnimation(): void {
  earthPovAnimating = false
  applyEarthPovProgress(1)
  controls?.update()
  requestRender()
}

function goToEarthPov(): void {
  if (!camera || sceneMode !== 'slice' || !activeSelectionDepth) return
  cancelEarthPovAnimation()

  const facing = earthPovCameraOffset({
    depthMode: props.depthMode,
    earthWorld: activeEarthWorldOffset ?? { x: 0, y: 0, z: 0 },
    depth: activeSelectionDepth,
    currentDistance: camera.position.length(),
    fallbackDistance: SLICE_CAMERA_DISTANCE,
  })
  earthPovCamStart.copy(camera.position)
  earthPovCamEnd.set(facing.x, facing.y, facing.z)

  if (prefersReducedMotion()) {
    camera.position.copy(earthPovCamEnd)
    camera.lookAt(0, 0, 0)
    controls?.update()
    requestRender()
    return
  }

  earthPovAnimating = true
  earthPovStartTime = performance.now()
  requestRender()
}

defineExpose({ goToEarthPov })

function startDeselectTransition(): void {
  if (!camera) return
  cancelEarthPovAnimation()
  sceneMode = 'toOverview'
  disableControls()

  let depth = activeSelectionDepth
  if (!depth) {
    const look = overviewLookDirection()
    depth = { x: look.x, y: look.y, z: look.z }
  }
  activeSelectionDepth = depth
  const facing = frontFacingCameraOffset(depth, camera.position.length(), SLICE_CAMERA_DISTANCE)

  // Phase 1 endpoint: Earth line of sight at slice distance, looking at origin.
  // Phase 2 endpoint: camera at Earth looking along the constellation's sky direction.
  camStart = camera.position.clone()
  camMid.set(facing.x, facing.y, facing.z)
  camEnd.set(0, 0, 0)
  lookStart.set(0, 0, 0)
  lookMid.set(0, 0, 0)
  lookEnd.set(depth.x * OVERVIEW_RADIUS, depth.y * OVERVIEW_RADIUS, depth.z * OVERVIEW_RADIUS)
  overviewOpacityStart = overviewMaterial?.uniforms.uOpacity.value ?? OVERVIEW_DIM_OPACITY
  overviewOpacityEnd = 1

  if (prefersReducedMotion()) {
    finishTransition()
  } else {
    transitionStartTime = performance.now()
    requestRender()
  }
}

function applyMorphProgress(morphT: number): void {
  for (const morphable of morphables) {
    const array = morphable.attribute.array as Float32Array
    for (let i = 0; i < array.length; i++) {
      array[i] = morphable.start[i] + (morphable.end[i] - morphable.start[i]) * morphT
    }
    morphable.attribute.needsUpdate = true
  }
  // Position attributes moved; refresh spheres so frustum culling tracks the slice.
  if (selectionGroup) syncGeometryBounds(selectionGroup)
}

function applyTransitionProgress(t: number): void {
  if (sceneMode === 'toOverview') {
    const { reorient, zoomMorph } = deselectPhaseWeights(t)
    const reorientEased = easeInOutCubic(reorient)
    const zoomEased = easeInOutCubic(zoomMorph)
    applyMorphProgress(deselectMorphAmount(t))
    if (overviewMaterial) {
      const opacityT = deselectOpacityAmount(t)
      overviewMaterial.uniforms.uOpacity.value =
        overviewOpacityStart + (overviewOpacityEnd - overviewOpacityStart) * opacityT
    }
    if (camera) {
      if (zoomMorph <= 0) {
        camera.position.lerpVectors(camStart, camMid, reorientEased)
        const look = new Vector3().lerpVectors(lookStart, lookMid, reorientEased)
        camera.lookAt(look)
      } else {
        camera.position.lerpVectors(camMid, camEnd, zoomEased)
        const look = new Vector3().lerpVectors(lookMid, lookEnd, zoomEased)
        camera.lookAt(look)
      }
    }
    return
  }

  const eased = easeInOutCubic(t)
  applyMorphProgress(eased)
  if (overviewMaterial) {
    overviewMaterial.uniforms.uOpacity.value =
      overviewOpacityStart + (overviewOpacityEnd - overviewOpacityStart) * eased
  }
  if (camera && shouldAnimateCamera(sceneMode)) {
    camera.position.lerpVectors(camStart, camEnd, eased)
    const look = new Vector3().lerpVectors(lookStart, lookEnd, eased)
    camera.lookAt(look)
  }
}

function finishTransition(): void {
  applyTransitionProgress(1)
  if (sceneMode === 'toSlice') {
    sceneMode = 'slice'
    enableControls()
    if (pendingRebuild) {
      pendingRebuild = false
      rebuildSelectionInPlace()
    }
  } else if (sceneMode === 'toOverview') {
    if (activeSelectionDepth) {
      const aim = yawPitchFromDirection(activeSelectionDepth)
      yaw = aim.yaw
      pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, aim.pitch))
    }
    sceneMode = 'overview'
    pendingRebuild = false
    disposeSelection()
    clearObjectTooltip()
    applyOverviewCamera()
    syncPreviewFromSources()
  }
  requestRender()
}

// --- OrbitControls ---------------------------------------------------------

function enableControls(): void {
  if (!camera || !renderer) return
  if (!controls) {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.enablePan = false
    controls.addEventListener('change', requestRender)
    controls.addEventListener('start', cancelEarthPovAnimation)
  }
  controls.rotateSpeed = orbitRotateSpeed(props.dragMode)
  controls.minDistance = sliceOrbitMinDistance(camera.near, SLICE_TARGET_RADIUS)
  controls.maxDistance = SLICE_TARGET_RADIUS * 20
  controls.target.set(0, 0, 0)
  controls.enabled = true
  controls.update()
}

function disableControls(): void {
  if (controls) controls.enabled = false
}

// --- Picking (drag vs click) -----------------------------------------------

function pointerToNdc(event: PointerEvent): Vector2 | null {
  if (!renderer) return null
  const rect = renderer.domElement.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return new Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
}

function pickSelectable(event: PointerEvent): { index: number; id: string } | null {
  if (!raycaster || !camera || !overviewPoints || !overviewField) return null
  const ndc = pointerToNdc(event)
  if (!ndc) return null
  raycaster.setFromCamera(ndc, camera)
  raycaster.params.Points = { threshold: PICK_THRESHOLD }
  const hits = raycaster.intersectObject(overviewPoints, false)
  for (const hit of hits) {
    if (hit.index === undefined) continue
    const pickId = overviewField.pickIds[hit.index]
    if (pickId !== null) return { index: hit.index, id: pickId }
  }
  return null
}

function updateHover(event: PointerEvent): void {
  if (sceneMode !== 'overview') return

  const regionId = pickRegionId(event)
  regionPreviewId = regionId
  if (renderer) renderer.domElement.style.cursor = regionId ? 'pointer' : 'grab'
  syncPreviewFromSources()

  if (!hoverPoints || !overviewField) return
  const hit = pickSelectable(event)
  if (!hit) {
    hideHover()
    return
  }
  const base = hit.index * 3
  const attribute = hoverPoints.geometry.getAttribute('position') as Float32BufferAttribute
  attribute.setXYZ(
    0,
    overviewField.positions[base] * OVERVIEW_RADIUS,
    overviewField.positions[base + 1] * OVERVIEW_RADIUS,
    overviewField.positions[base + 2] * OVERVIEW_RADIUS,
  )
  attribute.needsUpdate = true
  hoverPoints.visible = true
  requestRender()
}

function updateObjectTooltip(event: PointerEvent): void {
  if (sceneMode !== 'slice') {
    clearObjectTooltip()
    return
  }
  if (!camera || !renderer || nameWorthyPicks.length === 0 || !container.value) {
    clearObjectTooltip()
    return
  }
  const rect = container.value.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    clearObjectTooltip()
    return
  }

  // Project each named object to CSS pixels and pick the nearest within a small
  // radius. Three.js Points raycasting uses a world-space threshold sorted by
  // camera distance, which lets one nearer star dominate most of the view.
  const screenTargets: { x: number; y: number }[] = []
  const visibleIndices: number[] = []
  for (let index = 0; index < nameWorthyPicks.length; index++) {
    const projected = nameWorthyScreenScratch.copy(nameWorthyPicks[index].world).project(camera)
    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      !Number.isFinite(projected.z) ||
      projected.z < -1 ||
      projected.z > 1
    ) {
      continue
    }
    visibleIndices.push(index)
    screenTargets.push({
      x: (projected.x * 0.5 + 0.5) * rect.width,
      y: (-projected.y * 0.5 + 0.5) * rect.height,
    })
  }

  const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  const localIndex = pickNearestByScreenDistance(screenTargets, pointer, NAME_PICK_RADIUS_PX)
  if (localIndex === null) {
    clearObjectTooltip()
    renderer.domElement.style.cursor = 'grab'
    return
  }

  const entry = nameWorthyPicks[visibleIndices[localIndex]]
  objectTooltip.value = {
    name: entry.pick.name,
    detailLines: entry.pick.detailLines,
    x: pointer.x + 12,
    y: pointer.y + 12,
  }
  renderer.domElement.style.cursor = 'pointer'
}

function onPointerDown(event: PointerEvent): void {
  if (sceneMode === 'slice') {
    // Track the gesture so a mid-Earth-POV drag can cancel the tween; OrbitControls
    // still owns the orbit itself.
    activePointerId = event.pointerId
    pointerDownX = event.clientX
    pointerDownY = event.clientY
    pointerMoved = false
    return
  }
  if (sceneMode !== 'overview') return
  hideHover()
  activePointerId = event.pointerId
  pointerDownX = event.clientX
  pointerDownY = event.clientY
  pointerDownTime = performance.now()
  pointerMoved = false
  dragging = true
  renderer?.domElement.setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (sceneMode === 'slice') {
    if (earthPovAnimating && event.pointerId === activePointerId) {
      const dx = event.clientX - pointerDownX
      const dy = event.clientY - pointerDownY
      if (!pointerMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        pointerMoved = true
        cancelEarthPovAnimation()
      }
    }
    updateObjectTooltip(event)
    return
  }
  if (sceneMode !== 'overview') return
  if (dragging && event.pointerId === activePointerId) {
    const dx = event.clientX - pointerDownX
    const dy = event.clientY - pointerDownY
    if (!pointerMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) pointerMoved = true
    if (!pointerMoved) return
    const { yawDelta, pitchDelta } = overviewDragDelta({
      movementX: event.movementX || 0,
      movementY: event.movementY || 0,
      mode: props.dragMode,
    })
    yaw += yawDelta
    pitch += pitchDelta
    pitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, pitch))
    applyOverviewCamera()
    return
  }
  if (!dragging) updateHover(event)
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return
  renderer?.domElement.releasePointerCapture?.(event.pointerId)
  const elapsed = performance.now() - pointerDownTime
  const wasClick = !pointerMoved && elapsed <= CLICK_MAX_MS
  dragging = false
  activePointerId = null
  if (wasClick && sceneMode === 'overview') {
    const regionId = pickRegionId(event)
    if (regionId !== null) emit('select', regionId)
  }
}

function onPointerLeave(): void {
  hideHover()
  regionPreviewId = null
  clearObjectTooltip()
  if (sceneMode === 'overview') syncPreviewFromSources()
  if (renderer && sceneMode === 'overview') renderer.domElement.style.cursor = 'grab'
}

// --- Resize and render loop ------------------------------------------------

function resizeToContainer(): void {
  if (!renderer || !camera || !container.value) return
  const width = container.value.clientWidth
  const height = container.value.clientHeight
  if (width === 0 || height === 0) return
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  const pixelRatio = renderer.getPixelRatio()
  if (overviewMaterial) overviewMaterial.uniforms.uPixelRatio.value = pixelRatio
  selectionGroup?.traverse((object) => {
    if (object instanceof Points) {
      const material = object.material as ShaderMaterial
      if (material.uniforms?.uPixelRatio) material.uniforms.uPixelRatio.value = pixelRatio
    }
  })
  requestRender()
}

function animate(): void {
  // On-demand loop: reschedule only while a transition runs or a render is
  // pending, so a stable overview or slice performs no work at all.
  rafId = 0
  if (sceneMode === 'toSlice' || sceneMode === 'toOverview') {
    const t = Math.min(1, (performance.now() - transitionStartTime) / TRANSITION_MS)
    applyTransitionProgress(t)
    needsRender = true
    if (t >= 1) finishTransition()
  } else if (earthPovAnimating) {
    const t = Math.min(1, (performance.now() - earthPovStartTime) / TRANSITION_MS)
    applyEarthPovProgress(t)
    needsRender = true
    if (t >= 1) finishEarthPovAnimation()
  }
  if (needsRender && renderer && scene && camera) {
    needsRender = false
    renderer.render(scene, camera)
  }
  if (sceneMode === 'toSlice' || sceneMode === 'toOverview' || earthPovAnimating || needsRender) {
    scheduleFrame()
  }
}

// --- Selection orchestration -----------------------------------------------

function applySelection(id: string | null): void {
  if (!scene) return
  if (id === null) {
    if (sceneMode !== 'overview') startDeselectTransition()
    emit('scale-change', null)
    return
  }
  const model = buildSelectionModel(id, props.depthMode)
  if (!model) {
    emit('scale-change', null)
    return
  }
  emit('scale-change', model.scale)
  startSelectionTransition(model)
}

function rebuildSelectionInPlace(): void {
  const id = props.selectedId
  // Only remap a settled slice. During the fly-in (`toSlice`), the fly-out
  // (`toOverview`), or the overview, an in-place rebuild would fight the
  // running transition, so defer until the slice is stable.
  if (id === null || sceneMode !== 'slice') return
  const model = buildSelectionModel(id, props.depthMode)
  if (!model) return
  emit('scale-change', model.scale)
  buildSelection(model)
  // Snap to the final placement; this is a display remap, not a re-entry.
  applyTransitionProgress(1)
  requestRender()
}

// --- Lifecycle -------------------------------------------------------------

onMounted(() => {
  const host = container.value
  if (!host) return

  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true })
  } catch {
    renderer = null
  }
  if (!renderer || !renderer.getContext()) {
    webglFailed.value = true
    renderer?.dispose()
    renderer = null
    return
  }

  renderer.setClearColor(0x05070d, 1)
  const canvas = renderer.domElement
  // Interactive widget semantics, not a static image: focusable, named, and
  // described by the visually-hidden instructions rendered in the template.
  canvas.setAttribute('role', 'application')
  canvas.setAttribute('tabindex', '0')
  canvas.setAttribute('aria-roledescription', 'interactive star map')
  canvas.setAttribute('aria-label', 'Night sky star map centered on Earth')
  canvas.setAttribute('aria-describedby', instructionsId)
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.touchAction = 'none'
  canvas.style.cursor = 'grab'
  host.appendChild(canvas)

  scene = new Scene()
  camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 20000)
  camera.up.set(0, 0, 1)
  raycaster = new Raycaster()

  buildOverview()
  applyOverviewCamera()
  resizeToContainer()

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)

  resizeObserver = new ResizeObserver(() => resizeToContainer())
  resizeObserver.observe(host)

  requestRender()

  if (props.selectedId !== null) applySelection(props.selectedId)
})

watch(
  () => props.selectedId,
  (id) => {
    if (!renderer) return
    applySelection(id)
  },
)

function requestSelectionRebuild(): void {
  if (!renderer || props.selectedId === null) return
  // Remap immediately when the slice is settled; otherwise defer until the
  // running transition finishes so the latest props are never silently dropped.
  if (canRebuildInPlace(sceneMode)) rebuildSelectionInPlace()
  else pendingRebuild = true
}

watch(() => props.depthMode, requestSelectionRebuild)

watch(() => props.showStems, requestSelectionRebuild)

watch(
  () => props.dragMode,
  () => {
    if (controls) controls.rotateSpeed = orbitRotateSpeed(props.dragMode)
  },
)

// --- Disposal --------------------------------------------------------------

function disposeSelection(): void {
  if (selectionGroup) {
    scene?.remove(selectionGroup)
    selectionGroup.traverse((object) => {
      if (object instanceof Points || object instanceof LineSegments || object instanceof Line) {
        object.geometry.dispose()
        const material = object.material
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
        else material.dispose()
      }
    })
  }
  selectionGroup = null
  morphables = []
  nameWorthyPicks = []
  activeSelectionDepth = null
  activeEarthWorldOffset = null
}

watch(
  () => props.listPreviewId,
  () => {
    if (sceneMode === 'overview') syncPreviewFromSources()
  },
)

watch(
  () => props.previewFigureLines,
  (enabled) => {
    if (!enabled) disposePreviewLines()
    else if (sceneMode === 'overview') syncPreviewFromSources()
  },
)

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0

  const canvas = renderer?.domElement
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerLeave)
  }

  resizeObserver?.disconnect()
  resizeObserver = null

  if (controls) {
    controls.removeEventListener('change', requestRender)
    controls.removeEventListener('start', cancelEarthPovAnimation)
    controls.dispose()
    controls = null
  }

  disposeSelection()
  disposePreviewLines()

  if (hoverPoints) {
    scene?.remove(hoverPoints)
    hoverPoints.geometry.dispose()
    hoverPoints = null
  }
  hoverMaterial?.dispose()
  hoverMaterial = null

  if (overviewPoints) {
    scene?.remove(overviewPoints)
    overviewPoints.geometry.dispose()
    overviewPoints = null
  }
  overviewMaterial?.dispose()
  overviewMaterial = null
  overviewField = null

  if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas)
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  raycaster = null
  reducedMotionQuery = null
})
</script>

<template>
  <div class="constellation-scene">
    <div ref="container" class="constellation-scene__canvas" />
    <div
      v-if="objectTooltip"
      class="constellation-scene__tooltip"
      role="status"
      aria-live="polite"
      :style="{ left: `${objectTooltip.x}px`, top: `${objectTooltip.y}px` }"
    >
      <strong>{{ objectTooltip.name }}</strong>
      <span v-for="line in objectTooltip.detailLines" :key="line">{{ line }}</span>
    </div>
    <p :id="instructionsId" class="constellation-scene__sr-only">
      Drag or swipe to look around the sky from Earth. Click or tap a constellation region to open
      its three-dimensional slice. Hover named stars and landmarks in a slice for their labels. Full
      keyboard search of the constellations is available in the search controls.
    </p>
    <p v-if="webglFailed" class="constellation-scene__fallback" role="alert">
      This 3D star map needs WebGL, which is unavailable in this browser or has been disabled.
      Enable hardware acceleration or try a different browser to explore the constellations.
    </p>
  </div>
</template>

<style scoped lang="scss">
.constellation-scene {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 20rem;
  overflow: hidden;
  background: #05070d;
}

.constellation-scene__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.constellation-scene__tooltip {
  position: absolute;
  z-index: 5;
  display: grid;
  gap: 0.2rem;
  max-width: min(16rem, calc(100% - 1.5rem));
  padding: 0.55rem 0.7rem;
  color: #fff4d6;
  pointer-events: none;
  background: color-mix(in srgb, #02040a 92%, transparent);
  border: 1px solid color-mix(in srgb, #f5c542 55%, transparent);
  border-radius: 0.35rem;
  box-shadow: 0 0.55rem 1.4rem rgb(0 0 0 / 35%);
  font-size: 0.82rem;
  line-height: 1.35;

  strong {
    font-size: 0.92rem;
    font-weight: 600;
  }

  span {
    color: color-mix(in srgb, #fff4d6 68%, transparent);
  }
}

.constellation-scene__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.constellation-scene__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 2rem;
  text-align: center;
  line-height: 1.5;
  color: var(--text, #e6ecff);
  background: #05070d;
}
</style>
