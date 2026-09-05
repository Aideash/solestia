<script setup lang="ts">
import { computed, ref } from 'vue'
import { EARTH_ICE_RING_INDICES, EARTH_LAND_RINGS } from '../data/generated/earthLand.ts'
import { MOONS } from '../data/moons.ts'
import { MOON_MARIA } from '../data/moonSurface.ts'
import { PLANETS } from '../data/planets.ts'
import {
  dragShellCamera,
  intersectRayPlane,
  isBehindCameraShell,
  linearDistanceScale,
  orthographicRay,
  projectOrthographic,
  shellPose,
  sunMarkerKm,
  vecCross,
  vecNormalize,
  vecScale,
  type ShellCamera,
} from '../lib/camera.ts'
import { effectivePotential, effectivePotentialContours, type Cr3bpSystem } from '../lib/cr3bp.ts'
import { R_EARTH_KM, R_MOON_KM } from '../lib/eclipses.ts'
import { capRing, projectFrontPath } from '../lib/globe.ts'
import {
  centuriesSinceJ2000,
  KM_PER_AU,
  satelliteIauFrame,
  type PlanetSystemSnapshot,
  type Vec3,
} from '../lib/kepler.ts'
import {
  cavityFromWind,
  dipoleFieldLines,
  magnetopausePoints,
  QUIET_WIND,
  solarWindStreamlines,
  TAIL_LOBE_B_NT,
  type Dipole,
  type SolarWind,
} from '../lib/magnetosphere.ts'

export type FieldsMode = 'gravity' | 'magnetism'

export type SceneFeature = {
  id: string
  label: string
  positionKm: Vec3
  variant?: 'perturbed'
  referenceId?: string
}

const props = withDefaults(
  defineProps<{
    snapshot: PlanetSystemSnapshot
    mode: FieldsMode
    camera: ShellCamera
    viewRadiusAu: number
    cr3bp: Cr3bpSystem
    dipole: Dipole
    sunFromEarth: Vec3
    features: SceneFeature[]
    live?: boolean
    solarWind?: SolarWind
  }>(),
  {
    live: false,
    solarWind: () => QUIET_WIND,
  },
)

const emit = defineEmits<{
  'update:camera': [ShellCamera]
  'update:viewRadiusAu': [number]
  probe: [Vec3 | null, string | null]
  pin: [Vec3, string | null]
  reset: []
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const outerR = 42
const viewBox = `0 0 ${size} ${size}`
const SNAP_PX = 2.8
const WHEEL_FACTOR = 1.01

const svgEl = ref<SVGSVGElement | null>(null)
const hitEl = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
let pointerId = -1
let lastX = 0
let lastY = 0
let dragDistance = 0

const earthBody = PLANETS.find((planet) => planet.id === 'earth')
const moonBody = MOONS.find((moon) => moon.id === 'moon')
if (!earthBody || !moonBody) throw new Error('Earth or Moon is missing')

const pose = computed(() => shellPose(props.camera))
const days = computed(() => centuriesSinceJ2000(props.snapshot.at) * 36525)
const scaleFn = computed(() => linearDistanceScale(props.viewRadiusAu, outerR))
const worldPerScreen = computed(() => props.viewRadiusAu / outerR)

function toAu(km: Vec3): Vec3 {
  return vecScale(km, 1 / KM_PER_AU)
}

function projectKm(positionKm: Vec3) {
  return projectOrthographic(cx, cy, toAu(positionKm), pose.value, scaleFn.value)
}

const samplePlaneNormal = computed((): Vec3 => {
  if (props.mode === 'gravity') return props.cr3bp.basis.z
  const sun = vecNormalize(props.sunFromEarth)
  const dusk = vecCross({ x: 0, y: 0, z: 1 }, sun)
  if (Math.hypot(dusk.x, dusk.y, dusk.z) < 1e-8) return { x: 0, y: 1, z: 0 }
  return vecNormalize(dusk)
})

const earthR = computed(() => scaleFn.value(R_EARTH_KM / KM_PER_AU))
const moonR = computed(() => scaleFn.value(R_MOON_KM / KM_PER_AU))
const earthPt = computed(() => projectKm({ x: 0, y: 0, z: 0 }))
const moonPt = computed(() => {
  const moon = props.cr3bp.moonFromEarthKm
  return { ...projectKm(moon), km: moon }
})

const globePose = computed(() => pose.value)

const land = computed(() =>
  EARTH_LAND_RINGS.flatMap((ring, ringIndex) =>
    projectFrontPath(
      ring,
      earthBody.iau,
      days.value,
      globePose.value,
      earthPt.value.x,
      earthPt.value.y,
      Math.max(earthR.value, 0.7),
    ).map((path) => ({ ...path, ice: EARTH_ICE_RING_INDICES.has(ringIndex) })),
  ),
)

const maria = computed(() => {
  if (props.mode !== 'gravity') return []
  return MOON_MARIA.flatMap((cap) =>
    projectFrontPath(
      capRing(cap),
      satelliteIauFrame(moonBody, days.value),
      days.value,
      globePose.value,
      moonPt.value.x,
      moonPt.value.y,
      Math.max(moonR.value, 0.35),
    ),
  )
})

const contourPaths = computed(() => {
  if (props.mode !== 'gravity') return []
  const l1 = props.features.find((feature) => feature.id === 'l1')
  const l4 = props.features.find((feature) => feature.id === 'l4')
  if (!l1 || !l4) return []
  const uL1 = effectivePotential(props.cr3bp, l1.positionKm)
  const uL4 = effectivePotential(props.cr3bp, l4.positionKm)
  const span = uL4 - uL1
  const levels = [0.2, 0.45, 0.75, 1, 1.18, 1.4, 1.75].map((t) => uL1 + span * (t - 1))
  return effectivePotentialContours(props.cr3bp, levels, { samples: 52, extent: 1.42 }).map(
    (line) => {
      const pts = line.map(projectKm)
      if (pts.length < 2) return ''
      return pts.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
    },
  )
})

const lagrangeMarks = computed(() =>
  props.mode === 'gravity'
    ? props.features
        .filter((feature) => feature.id.startsWith('l'))
        .map((feature) => {
          const pt = projectKm(feature.positionKm)
          if (feature.variant !== 'perturbed' || !feature.referenceId) {
            return {
              ...feature,
              pt,
              labelX: pt.x - 1.3,
              labelY: pt.y - 1.3,
              labelAnchor: 'start',
            }
          }
          const reference = props.features.find((candidate) => candidate.id === feature.referenceId)
          const referencePt = reference ? projectKm(reference.positionKm) : pt
          const dx = pt.x - referencePt.x
          const dy = pt.y - referencePt.y
          const length = Math.hypot(dx, dy) || 1
          const ux = dx / length
          const uy = dy / length
          return {
            ...feature,
            pt,
            labelX: pt.x + ux * 1.5,
            labelY: pt.y + uy * 1.5 + (uy > 0.25 ? 1.5 : 0),
            labelAnchor: ux < -0.25 ? 'end' : ux > 0.25 ? 'start' : 'middle',
          }
        })
    : [],
)

const lagrangeTethers = computed(() => {
  if (props.mode !== 'gravity') return []
  return props.features.flatMap((feature) => {
    if (feature.variant !== 'perturbed' || !feature.referenceId) return []
    const reference = props.features.find((candidate) => candidate.id === feature.referenceId)
    if (!reference) return []
    return [
      {
        id: feature.id,
        from: projectKm(reference.positionKm),
        to: projectKm(feature.positionKm),
      },
    ]
  })
})

const fieldLinePaths = computed(() => {
  if (props.mode !== 'magnetism') return []
  return dipoleFieldLines(props.dipole, props.sunFromEarth, props.solarWind).map((line) => {
    const pts = line.map(projectKm)
    if (pts.length < 2) return { d: '', depth: 0 }
    const depth = pts.reduce((sum, point) => sum + point.depth, 0) / pts.length
    return {
      d: pts.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
      depth,
    }
  })
})

const magnetopausePath = computed(() => {
  if (props.mode !== 'magnetism') return ''
  const pts = magnetopausePoints(props.sunFromEarth, 64, props.solarWind).map(projectKm)
  return pts.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
})

const sunMark = computed(() => {
  const km = sunMarkerKm(props.sunFromEarth, props.cr3bp.separationKm)
  if (isBehindCameraShell(toAu(km), pose.value.look, props.viewRadiusAu)) return null
  const pt = projectKm(km)
  const dx = pt.x - cx
  const dy = pt.y - cy
  const r = Math.hypot(dx, dy)
  if (r > outerR) {
    const k = outerR / r
    return {
      kind: 'cue' as const,
      x: cx + dx * k,
      y: cy + dy * k,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }
  return { kind: 'physical' as const, ...pt }
})

const windPaths = computed(() => {
  if (props.mode !== 'magnetism') return []
  const cavity = cavityFromWind(props.solarWind.pdynNPa)
  const strength = Math.sqrt(cavity.lobeBnT / TAIL_LOBE_B_NT)
  const opacity = Math.min(1, 0.45 + 0.25 * strength)
  return solarWindStreamlines(props.sunFromEarth, props.solarWind).map((line, index) => {
    const pts = line.map(projectKm)
    if (pts.length < 2) return { key: index, d: '', opacity }
    return {
      key: index,
      d: pts.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '),
      opacity,
    }
  })
})

function svgPoint(event: PointerEvent): { x: number; y: number } | null {
  const svg = svgEl.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = event.clientX
  pt.y = event.clientY
  const loc = pt.matrixTransform(svg.getScreenCTM()?.inverse())
  return { x: loc.x, y: loc.y }
}

function pick(sx: number, sy: number): { km: Vec3; snap: string | null } | null {
  const ray = orthographicRay(sx, sy, cx, cy, pose.value, worldPerScreen.value)
  const hitAu =
    intersectRayPlane(ray.origin, ray.dir, { x: 0, y: 0, z: 0 }, samplePlaneNormal.value) ??
    ray.origin
  const km = vecScale(hitAu, KM_PER_AU)
  let snap: string | null = null
  const hits: { id: string; d: number; priority: number }[] = []
  for (const feature of props.features) {
    const pt = projectKm(feature.positionKm)
    const d = Math.hypot(pt.x - sx, pt.y - sy)
    if (d < SNAP_PX) {
      const priority = feature.id.startsWith('l') || feature.id === 'nose' ? 2 : 1
      hits.push({ id: feature.id, d, priority })
    }
  }
  hits.sort((a, b) => b.priority - a.priority || a.d - b.d)
  if (hits[0]) snap = hits[0].id
  const snappedKm = snap
    ? (props.features.find((feature) => feature.id === snap)?.positionKm ?? km)
    : km
  return { km: snappedKm, snap }
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  pointerId = event.pointerId
  lastX = event.clientX
  lastY = event.clientY
  dragDistance = 0
  dragging.value = true
  hitEl.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  const screen = svgPoint(event)
  if (screen) {
    const picked = pick(screen.x, screen.y)
    emit('probe', picked?.km ?? null, picked?.snap ?? null)
  }
  if (!dragging.value || event.pointerId !== pointerId) return
  const svg = svgEl.value
  if (!svg) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  dragDistance += Math.hypot(dx, dy)
  lastX = event.clientX
  lastY = event.clientY
  const width = svg.getBoundingClientRect().width || 1
  emit(
    'update:camera',
    dragShellCamera(props.camera, (dx / width) * Math.PI, (dy / width) * Math.PI),
  )
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== pointerId) return
  const wasDrag = dragDistance > 5
  dragging.value = false
  pointerId = -1
  if (wasDrag) return
  const screen = svgPoint(event)
  if (!screen) return
  const picked = pick(screen.x, screen.y)
  if (picked) emit('pin', picked.km, picked.snap)
}

function onPointerLeave() {
  if (!dragging.value) emit('probe', null, null)
}

function onDoubleClick(event: MouseEvent) {
  event.preventDefault()
  emit('reset')
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  const factor = event.deltaY > 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR
  emit('update:viewRadiusAu', Math.min(0.02, Math.max(0.00005, props.viewRadiusAu * factor)))
}
</script>

<template>
  <div class="diagram">
    <svg
      ref="svgEl"
      class="diagram__svg"
      :viewBox="viewBox"
      role="img"
      :aria-label="
        mode === 'gravity'
          ? 'Earth–Moon effective potential. Drag to orbit. Click to pin a sample. Double-click to reset.'
          : 'Earth magnetosphere. Drag to orbit. Click to pin a sample. Double-click to reset.'
      "
    >
      <title>
        {{
          live
            ? mode === 'gravity'
              ? 'Earth–Moon Lagrange field now'
              : 'Earth magnetosphere now'
            : mode === 'gravity'
              ? `Earth–Moon Lagrange field at ${snapshot.at.toISOString()}`
              : `Earth magnetosphere at ${snapshot.at.toISOString()}`
        }}
      </title>
      <defs>
        <g id="field-view__earth">
          <circle class="earth" :cx="earthPt.x" :cy="earthPt.y" :r="Math.max(earthR, 0.7)" />
          <path
            v-for="(path, index) in land"
            :key="`land-${index}`"
            class="land"
            :class="{ ice: path.ice }"
            :d="path.d"
          />
        </g>
      </defs>
      <g v-if="sunMark?.kind === 'physical' && sunMark.depth >= 0" class="sun-marker">
        <circle :cx="sunMark.x" :cy="sunMark.y" r="2.2" />
        <text :x="sunMark.x" :y="sunMark.y + 4.2" text-anchor="middle">Sun</text>
      </g>
      <g>
        <path v-for="(d, index) in contourPaths" :key="`c-${index}`" class="contour" :d="d" />
        <path
          v-for="(line, index) in fieldLinePaths"
          :key="`b-${index}`"
          class="field-line"
          :class="{ 'field-line--far': line.depth > 0 }"
          :d="line.d"
        />
      </g>
      <g v-if="mode === 'magnetism'">
        <g class="wind" aria-hidden="true">
          <path
            v-for="line in windPaths"
            :key="line.key"
            pathLength="1"
            :d="line.d"
            :style="{ opacity: line.opacity }"
          />
        </g>
        <path v-if="magnetopausePath" class="magnetopause" :d="magnetopausePath" />
        <use href="#field-view__earth" />
      </g>
      <g v-else-if="mode === 'gravity'">
        <use v-if="moonPt.depth < 0" href="#field-view__earth" />
        <circle class="moon" :cx="moonPt.x" :cy="moonPt.y" :r="Math.max(moonR, 0.35)" />
        <path v-for="(path, index) in maria" :key="`m-${index}`" class="maria" :d="path.d" />
        <use v-if="moonPt.depth >= 0" href="#field-view__earth" />
        <line
          v-for="tether in lagrangeTethers"
          :key="`tether-${tether.id}`"
          class="lagrange-tether"
          :x1="tether.from.x"
          :y1="tether.from.y"
          :x2="tether.to.x"
          :y2="tether.to.y"
        />
        <g
          v-for="mark in lagrangeMarks"
          :key="mark.id"
          class="lagrange"
          :class="{ 'lagrange--perturbed': mark.variant === 'perturbed' }"
        >
          <circle :cx="mark.pt.x" :cy="mark.pt.y" r="0.7" />
          <text :x="mark.labelX" :y="mark.labelY" :text-anchor="mark.labelAnchor">
            {{ mark.label }}
          </text>
        </g>
      </g>
      <g v-if="sunMark?.kind === 'physical' && sunMark.depth < 0" class="sun-marker">
        <circle :cx="sunMark.x" :cy="sunMark.y" r="2.2" />
        <text :x="sunMark.x" :y="sunMark.y + 4.2" text-anchor="middle">Sun</text>
      </g>
      <g
        v-if="sunMark?.kind === 'cue'"
        class="sun-cue"
        :transform="`translate(${sunMark.x} ${sunMark.y}) rotate(${sunMark.angle})`"
      >
        <title>Sun direction — marker is outside this view</title>
        <polygon points="2.4,0 -1.4,1.6 -1.4,-1.6" />
        <text :transform="`rotate(${-sunMark.angle})`" y="4.4" text-anchor="middle">Sun</text>
      </g>
    </svg>
    <div
      ref="hitEl"
      class="diagram__hit"
      :class="{ 'diagram__hit--drag': dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @dblclick="onDoubleClick"
      @wheel.prevent="onWheel"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.diagram {
  position: relative;
}

.diagram__svg {
  display: block;
  width: 100%;
  height: auto;
  min-height: 400px;
  max-height: 60vh;
  overflow: visible;
  user-select: none;
  pointer-events: none;
}

.diagram__hit {
  position: absolute;
  inset: 0;
  cursor: grab;
  touch-action: none;
}

.diagram__hit--drag {
  cursor: grabbing;
}

.sun-marker circle {
  fill: $color-accent;
}

.sun-marker text,
.sun-cue text {
  fill: $color-text-muted;
  font-size: 2.4px;
}

.sun-cue polygon {
  fill: $color-accent;
}

.contour {
  fill: none;
  stroke: color-mix(in srgb, $color-accent 45%, $color-border);
  stroke-width: 0.22;
}

.field-line {
  fill: none;
  stroke: color-mix(in srgb, #7eb6ff 80%, $color-border);
  stroke-width: 0.28;
}

.field-line--far {
  opacity: 0.35;
}

.magnetopause {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 70%, $color-accent);
  stroke-width: 0.35;
  stroke-dasharray: 0.9 0.7;
}

.wind path {
  fill: none;
  stroke: color-mix(in srgb, $color-accent 55%, transparent);
  stroke-width: 0.28;
  stroke-dasharray: 0.06 0.05;
  stroke-dashoffset: 1.1;
  animation: wind-flow 10s linear infinite;
}

@keyframes wind-flow {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wind path {
    animation: none;
  }
}

.earth {
  fill: #1a3358;
  stroke: color-mix(in srgb, $color-text 25%, #1a3358);
  stroke-width: 0.15;
}

.land {
  fill: color-mix(in srgb, #6b8f6b 70%, #1a3358);
  stroke: none;
}

.land.ice {
  fill: color-mix(in srgb, #d8e6f0 55%, #1a3358);
}

.moon {
  fill: #8a8680;
  stroke: color-mix(in srgb, $color-text 20%, #8a8680);
  stroke-width: 0.12;
}

.maria {
  fill: color-mix(in srgb, #5c5854 80%, #8a8680);
}

.lagrange circle {
  fill: $color-accent;
}

.lagrange-tether {
  stroke: color-mix(in srgb, #a9a3ff 55%, transparent);
  stroke-width: 0.18;
  stroke-dasharray: 0.7 0.7;
}

.lagrange--perturbed circle {
  fill: #a9a3ff;
  stroke: color-mix(in srgb, #a9a3ff 45%, $color-text);
  stroke-width: 0.16;
}

.lagrange text {
  fill: $color-text;
  font-size: 2.2px;
  font-family: $font-mono;
}

.lagrange--perturbed text {
  fill: #c0bcff;
}
</style>
