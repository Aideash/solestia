<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  cameraAxes,
  dragShellCamera,
  linearDistanceScale,
  projectOrthographic,
  shellPose,
  vecCross,
  vecDot,
  vecNormalize,
  vecScale,
  vecSub,
  type CameraFrame,
  type DragDirection,
  type ShellCamera,
} from '../lib/camera.ts'
import {
  R_EARTH_KM,
  R_MOON_KM,
  R_SUN_KM,
  activeCone,
  // coneRing,
  envelopeHitSamples,
  envelopeMoonPositions,
  type EclipseGeometry,
  type ShadowCaster,
} from '../lib/eclipses.ts'
import {
  KM_PER_AU,
  satelliteRelativeOrbitPositions,
  splitClosedByDepth,
  type PlanetSystemSnapshot,
  type Vec3,
} from '../lib/kepler.ts'

const props = defineProps<{
  snapshot: PlanetSystemSnapshot
  geometry: EclipseGeometry
  camera: ShellCamera
  caster: ShadowCaster
  cameraFrame: CameraFrame
  dragDirection: DragDirection
  showEnvelope: boolean
  live?: boolean
}>()

const emit = defineEmits<{
  'update:camera': [ShellCamera]
  'update:caster': [ShadowCaster]
  'update:cameraFrame': [CameraFrame]
  'update:dragDirection': [DragDirection]
  'update:showEnvelope': [boolean]
  reset: []
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const outerR = 42
const viewBox = `0 0 ${size} ${size}`

const settingsOpen = ref(false)
const isAnimated = ref(true)
const settingsRoot = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const dragging = ref(false)
let pointerId = -1
let lastX = 0
let lastY = 0

const pose = computed(() => shellPose(props.camera))
const earthCentered = (helio: Vec3): Vec3 => vecSub(helio, props.geometry.earth)

const maxDistance = computed(() => {
  const moon = props.snapshot.satellites[0]
  return moon ? moon.a * (1 + moon.e) * 1.08 : 0.003
})
const scale = computed(() => linearDistanceScale(maxDistance.value, outerR))

function project(position: Vec3) {
  return projectOrthographic(cx, cy, position, pose.value, scale.value)
}

const earthR = computed(() => scale.value(R_EARTH_KM / KM_PER_AU))
const moonR = computed(() => scale.value(R_MOON_KM / KM_PER_AU))
const earthPt = computed(() => project({ x: 0, y: 0, z: 0 }))
const moonPt = computed(() => project(props.geometry.moonRelative))

const orbit = computed(() => {
  const points = satelliteRelativeOrbitPositions('moon', props.snapshot.at).map(project)
  return splitClosedByDepth(points, 'positive')
})

const cone = computed(() => activeCone(props.geometry, props.caster))

// ------------------------------------------------------------
// To small to see, disabled for now
//
// function ringPath(centerHelio: Vec3, radiusKm: number, samples = 48): string {
//   const points = coneRing(
//     earthCentered(centerHelio),
//     cone.value.axis,
//     radiusKm / KM_PER_AU,
//     samples,
//   ).map(project)
//   if (points.length < 2) return ''
//   return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`
// }
//
// const umbraPath = computed(() => {
//   if (cone.value.hit.kind === 'miss') return ''
//   const radius = Math.abs(cone.value.hit.umbraRadiusKm)
//   if (!(radius > 0) || cone.value.hit.alongKm <= 0) return ''
//   return ringPath(cone.value.target, radius)
// })
// const penumbraPath = computed(() => {
//   if (cone.value.hit.kind === 'miss') return ''
//   const radius = cone.value.hit.penumbraRadiusKm
//   if (!(radius > 0) || cone.value.hit.alongKm <= 0) return ''
//   return ringPath(cone.value.target, radius)
// })
// ------------------------------------------------------------

const umbraApex = computed(() => project(earthCentered(cone.value.umbraApex)))
const casterPt = computed(() =>
  project(props.caster === 'moon' ? props.geometry.moonRelative : { x: 0, y: 0, z: 0 }),
)

const envelopeArc = computed(() => {
  if (!props.showEnvelope) return ''
  // Only worth the clutter near a syzygy, but then draw the whole track: the
  // Moon could be anywhere along it, not only where it happens to eclipse.
  if (envelopeHitSamples(props.geometry, props.caster).length === 0) return ''
  const points = envelopeMoonPositions(props.geometry, 17).map((moon) =>
    project(earthCentered(moon)),
  )
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
})

const moonDepth = computed(() => vecDot(props.geometry.moonRelative, cameraAxes(pose.value).look))

const sunMarker = computed(() => {
  const unit = vecNormalize(props.geometry.sunFromEarth)
  const { look } = cameraAxes(pose.value)
  if (vecDot(unit, look) <= 0) return null
  return project(vecScale(unit, maxDistance.value * 0.975))
})

/**
 * The rays read as lines printed on a flat strip that lies in the ecliptic and
 * runs along the Sun axis, so both the dashes and their spacing are just that
 * strip foreshortened: strokes shrink as the camera turns down the Sun axis,
 * and the bundle tightens as the strip turns edge-on.
 */
const sunRayView = computed(() => {
  const dir = props.geometry.sunFromEarth
  const length = Math.hypot(dir.x, dir.y, dir.z)
  const { look, right, up } = cameraAxes(pose.value)
  const unit = length < 1e-12 ? { x: 0, y: 0, z: 0 } : vecScale(dir, 1 / length)
  // A stroke along the Sun axis keeps `sin` of the angle between that axis and
  // the look direction: full side-on, nothing looking toward or away.
  const alongLook = Math.min(1, Math.abs(vecDot(unit, look)))
  const dashLength = 0.2 + 4 * Math.sqrt(Math.max(0, 1 - alongLook * alongLook))
  if (length < 1e-12) {
    return { rays: [] as { x1: number; y1: number; x2: number; y2: number }[], dashLength }
  }
  const far = vecScale(unit, maxDistance.value * 1.4)
  const origin = project({ x: 0, y: 0, z: 0 })
  const tip = project(far)
  const dx = tip.x - origin.x
  const dy = tip.y - origin.y
  const span = Math.hypot(dx, dy) || 1
  // Rays are spaced along the strip's width: perpendicular to them, in the
  // ecliptic. Projecting that width carries the tightening and the shear of a
  // strip seen at an angle, and is untouched by facing the Sun.
  const width = vecNormalize(vecCross({ x: 0, y: 0, z: 1 }, unit))
  let stepX = vecDot(width, right)
  let stepY = -vecDot(width, up)
  const acrossStrip = Math.hypot(stepX, stepY)
  if (acrossStrip > 1e-6) {
    stepX /= acrossStrip
    stepY /= acrossStrip
  } else {
    // Edge-on, where the width vanishes: hold its limiting screen direction.
    stepX = -dy / span
    stepY = dx / span
  }
  // Never quite collapse to a single line; a hairline of separation still reads
  // as a bundle of rays.
  const gap = 3.2 * (0.1 + acrossStrip)
  const rays = [-2, -1, 0, 1, 2].map((k) => {
    const offsetX = stepX * gap * k
    const offsetY = stepY * gap * k
    return {
      x1: origin.x + offsetX - dx * 0.9,
      y1: origin.y + offsetY - dy * 0.9,
      x2: origin.x + offsetX + dx * 1.1,
      y2: origin.y + offsetY + dy * 1.1,
    }
  })
  return { rays, dashLength }
})

const insetX = 14
const insetY = 12
const insetCaptionY = 20.5
const insetMeanDiscSize = 4.5
/**
 * One absolute scale for both discs, pinned so the mean Sun draws at radius
 * 4.5. Concentric on a shared scale, the Sun's 3.4% yearly swing and the
 * Moon's wider monthly one each read as a rim of one disc past the other, and
 * equal angular radii genuinely coincide. A perigee Moon is the widest case
 * and still clears the caption.
 */
const insetScale = insetMeanDiscSize / Math.asin(R_SUN_KM / KM_PER_AU)

const inset = computed(() => ({
  sunR: insetScale * props.geometry.sunApparent,
  moonR: insetScale * props.geometry.moonApparent,
}))

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

function onSettingsDocPointer(event: PointerEvent) {
  if (!settingsOpen.value) return
  const target = event.target
  if (target instanceof Node && settingsRoot.value?.contains(target)) return
  settingsOpen.value = false
}

function onSettingsDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !settingsOpen.value) return
  settingsOpen.value = false
  event.preventDefault()
  event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('pointerdown', onSettingsDocPointer)
  document.addEventListener('keydown', onSettingsDocKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onSettingsDocPointer)
  document.removeEventListener('keydown', onSettingsDocKeydown, true)
})

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  pointerId = event.pointerId
  lastX = event.clientX
  lastY = event.clientY
  dragging.value = true
  svgEl.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value || event.pointerId !== pointerId) return
  const svg = svgEl.value
  if (!svg) return
  const dx = event.clientX - lastX
  const dy = event.clientY - lastY
  lastX = event.clientX
  lastY = event.clientY
  const width = svg.getBoundingClientRect().width || 1
  const sign = props.dragDirection === 'inverted' ? -1 : 1
  const dragX = (dx / width) * Math.PI * sign
  const dragY = (dy / width) * Math.PI * sign
  emit('update:camera', dragShellCamera(props.camera, dragX, dragY))
}

function onPointerUp(event: PointerEvent) {
  if (event.pointerId !== pointerId) return
  dragging.value = false
  pointerId = -1
}

function onDoubleClick(event: MouseEvent) {
  event.preventDefault()
  emit('reset')
}

function toggleCaster() {
  emit('update:caster', props.caster === 'moon' ? 'earth' : 'moon')
}

function toggleCameraFrame() {
  emit('update:cameraFrame', props.cameraFrame === 'solar' ? 'sidereal' : 'solar')
}

function toggleDragDirection() {
  emit('update:dragDirection', props.dragDirection === 'normal' ? 'inverted' : 'normal')
}

/** Material Symbols glyphs, inlined like the settings gear rather than pulled from a font. */
const ICONS = {
  sun: [
    'M12,7c-2.76,0-5,2.24-5,5s2.24,5,5,5s5-2.24,5-5S14.76,7,12,7L12,7z M2,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0 c-0.55,0-1,0.45-1,1S1.45,13,2,13z M20,13l2,0c0.55,0,1-0.45,1-1s-0.45-1-1-1l-2,0c-0.55,0-1,0.45-1,1S19.45,13,20,13z M11,2v2 c0,0.55,0.45,1,1,1s1-0.45,1-1V2c0-0.55-0.45-1-1-1S11,1.45,11,2z M11,20v2c0,0.55,0.45,1,1,1s1-0.45,1-1v-2c0-0.55-0.45-1-1-1 C11.45,19,11,19.45,11,20z M5.99,4.58c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41l1.06,1.06 c0.39,0.39,1.03,0.39,1.41,0s0.39-1.03,0-1.41L5.99,4.58z M18.36,16.95c-0.39-0.39-1.03-0.39-1.41,0c-0.39,0.39-0.39,1.03,0,1.41 l1.06,1.06c0.39,0.39,1.03,0.39,1.41,0c0.39-0.39,0.39-1.03,0-1.41L18.36,16.95z M19.42,5.99c0.39-0.39,0.39-1.03,0-1.41 c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L19.42,5.99z M7.05,18.36 c0.39-0.39,0.39-1.03,0-1.41c-0.39-0.39-1.03-0.39-1.41,0l-1.06,1.06c-0.39,0.39-0.39,1.03,0,1.41s1.03,0.39,1.41,0L7.05,18.36z',
  ],
  moon: [
    'M12,3c-4.97,0-9,4.03-9,9s4.03,9,9,9s9-4.03,9-9c0-0.46-0.04-0.92-0.1-1.36c-0.98,1.37-2.58,2.26-4.4,2.26 c-2.98,0-5.4-2.42-5.4-5.4c0-1.81,0.89-3.42,2.26-4.4C12.92,3.04,12.46,3,12,3L12,3z',
  ],
  star: [
    'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  ],
  camera: [
    'M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z',
    'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z',
  ],
  cameraSwitch: [
    'M16,7h-1l-1-1h-4L9,7H8C6.9,7,6,7.9,6,9v6c0,1.1,0.9,2,2,2h8c1.1,0,2-0.9,2-2V9C18,7.9,17.1,7,16,7z M12,14 c-1.1,0-2-0.9-2-2c0-1.1,0.9-2,2-2s2,0.9,2,2C14,13.1,13.1,14,12,14z',
    'M8.57,0.51l4.48,4.48V2.04c4.72,0.47,8.48,4.23,8.95,8.95c0,0,2,0,2,0C23.34,3.02,15.49-1.59,8.57,0.51z',
    'M10.95,21.96C6.23,21.49,2.47,17.73,2,13.01c0,0-2,0-2,0c0.66,7.97,8.51,12.58,15.43,10.48l-4.48-4.48V21.96z',
  ],
} satisfies Record<string, readonly string[]>

/**
 * Each setting is a pair of equal choices rather than a feature switched on and
 * off, so the icons carry which is which and the switch only says which side is
 * taken. The aria-label spells that out, since "checked" alone would not.
 */
const switches = computed(() => [
  {
    key: 'type',
    title: 'Type',
    label: 'Eclipse type. Off is solar, on is lunar.',
    checked: props.caster === 'earth',
    off: { name: 'Solar', paths: ICONS.sun },
    on: { name: 'Lunar', paths: ICONS.moon },
    toggle: toggleCaster,
  },
  {
    key: 'camera-frame',
    title: 'Camera frame',
    label: 'Camera frame. Off is solar, on is sidereal.',
    checked: props.cameraFrame === 'sidereal',
    off: { name: 'Solar', paths: ICONS.sun },
    on: { name: 'Sidereal', paths: ICONS.star },
    toggle: toggleCameraFrame,
  },
  {
    key: 'drag',
    title: 'Drag',
    label: 'Drag direction. Off is normal, on is inverted.',
    checked: props.dragDirection === 'inverted',
    off: { name: 'Normal', paths: ICONS.camera },
    on: { name: 'Inverted', paths: ICONS.cameraSwitch },
    toggle: toggleDragDirection,
  },
])
</script>

<template>
  <div class="diagram">
    <div ref="settingsRoot" class="diagram__settings">
      <button
        type="button"
        class="diagram__settings-btn"
        :aria-expanded="settingsOpen"
        aria-controls="eclipse-settings"
        aria-haspopup="true"
        aria-label="Eclipse display settings"
        @click="toggleSettings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z"
          />
        </svg>
      </button>
      <Transition name="menu">
        <div
          v-show="settingsOpen"
          id="eclipse-settings"
          class="diagram__settings-menu"
          aria-labelledby="eclipse-settings-title"
        >
          <p id="eclipse-settings-title" class="diagram__settings-title">Display</p>
          <label class="diagram__settings-item">
            <input
              type="checkbox"
              :checked="showEnvelope"
              @change="emit('update:showEnvelope', ($event.target as HTMLInputElement).checked)"
            />
            Error envelope
          </label>
          <label class="diagram__settings-item">
            <input v-model="isAnimated" type="checkbox" />
            Animated rays
          </label>
          <template v-for="control in switches" :key="control.key">
            <p class="diagram__settings-title">{{ control.title }}</p>
            <div class="diagram__settings-switch">
              <svg
                class="diagram__switch-icon"
                :class="{ 'diagram__switch-icon--active': !control.checked }"
                viewBox="0 0 24 24"
                role="img"
              >
                <title>{{ control.off.name }}</title>
                <path
                  v-for="(d, index) in control.off.paths"
                  :key="index"
                  fill="currentColor"
                  :d="d"
                />
              </svg>
              <button
                type="button"
                role="switch"
                class="diagram__switch"
                :aria-checked="control.checked"
                :aria-label="control.label"
                @click="control.toggle()"
              >
                <span class="diagram__switch-thumb" />
              </button>
              <svg
                class="diagram__switch-icon"
                :class="{ 'diagram__switch-icon--active': control.checked }"
                viewBox="0 0 24 24"
                role="img"
              >
                <title>{{ control.on.name }}</title>
                <path
                  v-for="(d, index) in control.on.paths"
                  :key="index"
                  fill="currentColor"
                  :d="d"
                />
              </svg>
              <span class="diagram__switch-mode">{{
                control.checked ? control.on.name : control.off.name
              }}</span>
            </div>
          </template>
          <button type="button" class="diagram__settings-reset" @click="emit('reset')">
            Reset camera
          </button>
        </div>
      </Transition>
    </div>
    <svg
      ref="svgEl"
      class="diagram__svg"
      :class="{ 'diagram__svg--drag': dragging }"
      :viewBox="viewBox"
      role="img"
      aria-label="Earth–Moon geometry. Drag to orbit the camera. Double-click to reset."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDoubleClick"
    >
      <title>
        {{
          live
            ? 'Earth–Moon eclipse geometry now'
            : `Earth–Moon eclipse geometry at ${snapshot.at.toISOString()}`
        }}
      </title>
      <desc>
        Orthographic view of the Earth–Moon system to linear scale. Parallel lines mark the Sun’s
        direction. Umbra and penumbra cones belong to the selected caster. This is mean-element
        geometry, not a prediction.
      </desc>
      <g v-if="sunMarker" class="sun-marker">
        <title>Sun — shown directionally; distance is not to scale</title>
        <circle :cx="sunMarker.x" :cy="sunMarker.y" r="2.5" />
        <text :x="sunMarker.x" :y="sunMarker.y + 4.6" text-anchor="middle">Sun</text>
      </g>
      <g
        class="rays"
        aria-hidden="true"
        :style="{ '--ray-period': String(sunRayView.dashLength + 1) }"
      >
        <line
          v-for="(ray, index) in sunRayView.rays"
          :class="{ animated: isAnimated }"
          :key="index"
          :x1="ray.x1"
          :y1="ray.y1"
          :x2="ray.x2"
          :y2="ray.y2"
          :stroke-dasharray="`${sunRayView.dashLength} 1`"
        />
      </g>
      <g class="orbit-far" aria-hidden="true">
        <path v-for="(d, index) in orbit.far" :key="`far-${index}`" class="orbit" :d="d" />
      </g>
      <path v-if="envelopeArc" class="envelope" :d="envelopeArc" />
      <line class="axis" :x1="umbraApex.x" :y1="umbraApex.y" :x2="casterPt.x" :y2="casterPt.y" />
      <circle
        v-if="moonDepth > 0"
        class="moon"
        :cx="moonPt.x"
        :cy="moonPt.y"
        :r="Math.max(moonR, 0.45)"
      />
      <circle class="earth" :cx="earthPt.x" :cy="earthPt.y" :r="Math.max(earthR, 0.7)" />
      <g class="orbit-near" aria-hidden="true">
        <path v-for="(d, index) in orbit.near" :key="`near-${index}`" class="orbit" :d="d" />
      </g>
      <circle
        v-if="moonDepth <= 0"
        class="moon"
        :cx="moonPt.x"
        :cy="moonPt.y"
        :r="Math.max(moonR, 0.45)"
      />
      <!-- <path v-if="penumbraPath" class="penumbra" :d="penumbraPath" />
      <path v-if="umbraPath" class="umbra" :d="umbraPath" /> -->
      <g class="inset" aria-hidden="true">
        <circle class="inset-sun" :cx="insetX - 8" :cy="insetY" :r="inset.sunR / 2" />
        <circle class="inset-sun" :cx="insetX" :cy="insetY" :r="inset.sunR" />
        <circle class="inset-moon" :cx="insetX" :cy="insetY" :r="inset.moonR" />
        <circle class="inset-moon" :cx="insetX + 8" :cy="insetY" :r="inset.moonR / 2" />
        <circle class="inset-block" :cx="insetX" :cy="insetY" :r="insetMeanDiscSize" />
        <text :x="insetX" :y="insetCaptionY" text-anchor="middle">apparent size</text>
      </g>
    </svg>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;
@use '../styles/menu' as menu;

.diagram {
  position: relative;
}

.diagram__settings {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
}

.diagram__settings-btn {
  @include menu.icon-button;
}

.diagram__settings-btn svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform 250ms ease;
}

.diagram__settings-btn:hover svg,
.diagram__settings-btn[aria-expanded='true'] svg {
  transform: rotate(45deg);
}

.diagram__settings-menu {
  @include menu.menu-panel;
}

.diagram__settings-title {
  @include menu.menu-title;
}

.diagram__settings-item {
  @include menu.menu-item;
}

.diagram__settings-switch {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.5rem 0.35rem;
}

.diagram__switch-icon {
  flex: none;
  width: 0.8rem;
  height: 0.8rem;
  color: color-mix(in srgb, $color-text-muted 60%, transparent);
  transition: color 120ms ease;
}

.diagram__switch-icon--active {
  color: $color-accent;
}

.diagram__switch {
  position: relative;
  flex: none;
  width: 1.9rem;
  height: 1rem;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: border-color 120ms ease;
}

.diagram__switch:hover,
.diagram__switch:focus-visible {
  border-color: color-mix(in srgb, $color-accent 70%, var(--border-strong));
  outline: none;
}

.diagram__switch:focus-visible {
  outline: 1px solid color-mix(in srgb, $color-accent 70%, transparent);
  outline-offset: 2px;
}

.diagram__switch-thumb {
  position: absolute;
  top: 50%;
  left: 0.15rem;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: $color-text-muted;
  transform: translateY(-50%);
  transition:
    transform 120ms ease,
    background-color 120ms ease;
}

.diagram__switch[aria-checked='true'] .diagram__switch-thumb {
  background: $color-text;
  transform: translate(0.85rem, -50%);
}

.diagram__switch-mode {
  margin-left: auto;
  color: $color-text;
  font-family: $font-mono;
  font-size: 0.75rem;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .diagram__switch,
  .diagram__switch-icon,
  .diagram__switch-thumb {
    transition: none;
  }
}

.diagram__settings-reset {
  display: block;
  width: 100%;
  margin-top: 0.2rem;
  padding: 0.35rem 0.5rem;
  border: 0;
  border-radius: $radius-sm;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;
}

.diagram__settings-reset:hover,
.diagram__settings-reset:focus-visible {
  color: $color-text;
  background: color-mix(in srgb, $color-border 40%, transparent);
  outline: none;
}

@include menu.menu-transition;

@media (prefers-reduced-motion: reduce) {
  .diagram__settings-btn svg {
    transition: none;
  }

  .diagram__settings-btn:hover svg,
  .diagram__settings-btn[aria-expanded='true'] svg {
    transform: none;
  }
}

.diagram__svg {
  width: 100%;
  height: auto;
  display: block;
  touch-action: none;
  cursor: grab;
}

.diagram__svg--drag {
  cursor: grabbing;
}

.rays line {
  stroke: color-mix(in srgb, #f5c542 55%, transparent);
  stroke-width: 0.18;
  stroke-dashoffset: 0;
  &.animated {
    animation: dash 2.5s linear infinite;
  }
}

@keyframes dash {
  to {
    stroke-dashoffset: var(--ray-period, 5.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rays line.animated {
    animation: none;
  }
}

.orbit {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.35;
}

.orbit-far .orbit {
  opacity: 0.55;
}

.penumbra {
  fill: color-mix(in srgb, #6a6a78 28%, transparent);
  stroke: none;
}

.umbra {
  fill: color-mix(in srgb, #1a1a22 55%, transparent);
  stroke: none;
}

.envelope {
  fill: none;
  stroke: #d64545;
  stroke-width: 0.45;
  stroke-dasharray: 0.8 0.55;
}

.axis {
  stroke: color-mix(in srgb, var(--text-dim) 50%, transparent);
  stroke-width: 0.2;
}

.earth {
  fill: #286eaa;
  stroke: none;
}

.moon {
  fill: #c9c9c4;
  stroke: #000;
  stroke-width: 0.15;
}

.inset-sun {
  fill: #f5c542;
  stroke: #f5c542;
  stroke-width: 0.25;
}

.sun-marker circle {
  fill: #f5c542;
  filter: drop-shadow(0 0 1.2px color-mix(in srgb, #f5c542 70%, transparent));
}

.sun-marker text {
  fill: #f5c542;
  font-size: 2.2px;
}

.inset-moon {
  fill: #c9c9c4;
  stroke: #c9c9c4;
  stroke-width: 0.25;
}

.inset-block {
  fill: #000;
  stroke: none;
}

.inset text {
  fill: $color-text-muted;
  font-size: 2.1px;
}
</style>
