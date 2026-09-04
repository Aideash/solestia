<script setup lang="ts">
import { computed } from 'vue'
import { EARTH_ICE_RING_INDICES, EARTH_LAND_RINGS } from '../data/generated/earthLand.ts'
import { MOONS } from '../data/moons.ts'
import { MOON_MARIA, MOON_RAY_CRATERS } from '../data/moonSurface.ts'
import { PLANETS, type IauFrame } from '../data/planets.ts'
import { shellPose, vecSub, type ShellCamera } from '../lib/camera.ts'
import {
  activeCone,
  shadowEnvelope,
  shadowFootprint,
  type EclipseGeometry,
  type ShadowCaster,
} from '../lib/eclipses.ts'
import {
  capRing,
  nightFillPath,
  projectFrontPath,
  projectRegionPath,
  type SurfaceCap,
  type SurfaceRegion,
} from '../lib/globe.ts'
import { centuriesSinceJ2000, satelliteIauFrame, type PlanetSystemSnapshot } from '../lib/kepler.ts'

const props = defineProps<{
  snapshot: PlanetSystemSnapshot
  geometry: EclipseGeometry
  camera: ShellCamera
  caster: ShadowCaster
  showEnvelope: boolean
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const radius = 42
const viewBox = `0 0 ${size} ${size}`

const earthBody = PLANETS.find((planet) => planet.id === 'earth')
const moonBody = MOONS.find((moon) => moon.id === 'moon')
if (!earthBody || !moonBody) throw new Error('Earth or Moon is missing')

const pose = computed(() => shellPose(props.camera))
const days = computed(() => centuriesSinceJ2000(props.snapshot.at) * 36525)
const cone = computed(() => activeCone(props.geometry, props.caster))

const targetIau = computed((): IauFrame =>
  props.caster === 'earth' ? satelliteIauFrame(moonBody, days.value) : earthBody.iau,
)

const sunFromTarget = computed(() =>
  props.caster === 'moon'
    ? props.geometry.sunFromEarth
    : vecSub({ x: 0, y: 0, z: 0 }, props.geometry.moon),
)

const land = computed(() => {
  if (props.caster === 'earth') return []
  return EARTH_LAND_RINGS.flatMap((ring, ringIndex) =>
    projectFrontPath(ring, targetIau.value, days.value, pose.value, cx, cy, radius).map((path) => ({
      ...path,
      ice: EARTH_ICE_RING_INDICES.has(ringIndex),
    })),
  )
})

/**
 * Lunar features, drawn only when the Moon is the disc. Their rings live in the
 * body frame, so the maria show themselves exactly when the near side is turned
 * toward the camera, which is where they are.
 */
function capPaths(caps: readonly SurfaceCap[]) {
  if (props.caster === 'moon') return []
  return caps.flatMap((cap) =>
    projectFrontPath(capRing(cap), targetIau.value, days.value, pose.value, cx, cy, radius),
  )
}

const maria = computed(() => capPaths(MOON_MARIA))
const rayCraters = computed(() => capPaths(MOON_RAY_CRATERS))

const night = computed(() => nightFillPath(sunFromTarget.value, pose.value, cx, cy, radius))

function regionPath(region: SurfaceRegion | null): string | null {
  if (!region) return null
  return projectRegionPath(region, pose.value, cx, cy, radius)
}

const penumbra = computed(() => regionPath(shadowFootprint(cone.value, 'penumbra')))
const umbra = computed(() => regionPath(shadowFootprint(cone.value, 'umbra')))
/** Past the umbral apex the same cone lands as an antumbra: an annular ring. */
const antumbral = computed(() => cone.value.hit.umbraRadiusKm < 0)

/**
 * One band per drawn shadow, each bracketing the shadow of its own name. A
 * single band cannot: the umbra's band is the narrow one worth reading, but it
 * says nothing about where the penumbra falls, and through a penumbral eclipse
 * — where the umbra never lands — it leaves the only shadow on the disc
 * unbounded, appearing and vanishing on its own schedule.
 *
 * A band shows even where its own shadow misses, which is the useful case: an
 * umbra band over an untouched Moon is the model allowing that the eclipse
 * could really be partial.
 */
const envelopes = computed(() => {
  if (!props.showEnvelope) return []
  return (['penumbra', 'umbra'] as const)
    .map((feature) => ({
      feature,
      d: regionPath(shadowEnvelope(props.geometry, props.caster, feature)),
    }))
    .filter((band): band is { feature: 'penumbra' | 'umbra'; d: string } => band.d !== null)
})

const discColor = computed(() => (props.caster === 'moon' ? '#286eaa' : '#c9c9c4'))
const label = computed(() => (props.caster === 'moon' ? 'Earth' : 'Moon'))
</script>

<template>
  <div class="globe">
    <svg
      class="globe__svg"
      :viewBox="viewBox"
      role="img"
      :aria-label="`${label} as seen from the same camera, with the active shadow footprint.`"
    >
      <title>{{ label }} disc</title>
      <defs>
        <clipPath id="eclipse-target-disc">
          <circle :cx="cx" :cy="cy" :r="radius" />
        </clipPath>
      </defs>
      <circle class="disc" :cx="cx" :cy="cy" :r="radius" :fill="discColor" />
      <g clip-path="url(#eclipse-target-disc)">
        <path
          v-for="(path, index) in land"
          :key="index"
          class="land"
          :class="{ 'land--ice': path.ice }"
          :d="path.d"
        />
        <path v-for="(path, index) in maria" :key="`mare-${index}`" class="mare" :d="path.d" />
        <path
          v-for="(path, index) in rayCraters"
          :key="`ray-${index}`"
          class="ray-crater"
          :d="path.d"
        />
        <path v-if="night" class="night" :d="night" />
        <path v-if="penumbra" class="penumbra" :d="penumbra" />
        <path
          v-for="band in envelopes"
          :key="`envelope-${band.feature}`"
          class="envelope"
          :class="`envelope--${band.feature}`"
          :d="band.d"
        />
        <path v-if="umbra" :class="antumbral ? 'antumbra' : 'umbra'" :d="umbra" />
      </g>
      <circle class="limb" :cx="cx" :cy="cy" :r="radius" />
    </svg>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.globe__svg {
  width: 100%;
  height: auto;
  display: block;
}

.night {
  fill: rgb(0 0 0 / 38%);
  pointer-events: none;
}

.land {
  fill: #2f8a2f;
  stroke: color-mix(in srgb, #d5e4c8 70%, #237523);
  stroke-width: 0.3;
  stroke-linejoin: round;
}

.land--ice {
  fill: #e8eef2;
  stroke: #f7fafc;
}

/* Unstroked, unlike the coastlines: a mare shades into the highlands around it
   rather than ending at a line, and an outline would also draw the bracketing
   ellipse as though it were a mapped edge. */
.mare {
  fill: #8f8f8c;
  stroke: none;
}

.ray-crater {
  fill: color-mix(in srgb, #f2f2ec 60%, transparent);
  stroke: none;
}

.penumbra {
  fill: color-mix(in srgb, #2a2a33 32%, transparent);
  stroke: none;
}

.umbra {
  fill: color-mix(in srgb, #0c0c10 62%, transparent);
  stroke: none;
}

.antumbra {
  fill: color-mix(in srgb, #0c0c10 28%, transparent);
  stroke: color-mix(in srgb, #f4f4f8 70%, transparent);
  stroke-width: 0.25;
  stroke-dasharray: 0.7 0.5;
}

/* The bands nest, the umbra's inside the penumbra's, so the outer one is drawn
   back to let the tighter bound read as the one to follow. */
.envelope {
  fill: color-mix(in srgb, #d64545 9%, transparent);
  stroke: color-mix(in srgb, #d64545 55%, transparent);
  stroke-width: 0.3;
  stroke-dasharray: 0.7 0.45;
}

.envelope--umbra {
  fill: color-mix(in srgb, #d64545 12%, transparent);
  stroke: #d64545;
  stroke-width: 0.4;
}

.limb {
  fill: none;
  stroke: color-mix(in srgb, var(--text-dim) 45%, transparent);
  stroke-width: 0.25;
}
</style>
