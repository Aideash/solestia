<script setup lang="ts">
import { computed, ref } from 'vue'
import { primeMeridianLabel } from '../data/selectionNotes.ts'
import {
  formatDayClock,
  formatDeg,
  formatEcc,
  formatQuantity,
  formatRad,
  simpleRatio,
  HOURS_PER_DAY,
  JULIAN_YEAR_DAYS,
} from '../lib/format.ts'
import { orbitPoint } from '../lib/kepler.ts'
import type { AsteroidBeltSnapshot } from '../lib/asteroidEphemeris.ts'
import type { ReadoutColumn, ReadoutRow } from '../lib/readout.ts'
import BodyReadout from './BodyReadout.vue'

const props = defineProps<{
  snapshot: AsteroidBeltSnapshot
  selectedAsteroid?: string | null
  live?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const sunR = 3.5
const beltInnerR = 27
const laneInnerR = 30
const laneOuterR = 42
const frameR = 46
const facingGap = 0.2
const facingMin = 0.35
const facingMax = 1.25
const pad = 6
const viewBox = `${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`
const minA = computed(() => props.snapshot.asteroids[0]?.a ?? 0)
const maxA = computed(() => props.snapshot.asteroids.at(-1)?.a ?? 1)

function laneRadius(a: number): number {
  const span = maxA.value - minA.value
  return span > 0 ? laneInnerR + ((a - minA.value) / span) * (laneOuterR - laneInnerR) : 36
}

const marks = computed(() =>
  props.snapshot.asteroids.map((asteroid) => {
    const radius = laneRadius(asteroid.a)
    const body = orbitPoint(cx, cy, radius, asteroid.offsetFromEarthPerihelion)
    const label = orbitPoint(cx, cy, radius + 2.2, asteroid.offsetFromEarthPerihelion)
    const facingOffset = asteroid.facing.longitude - props.snapshot.earthPerihelionLongitude
    const facingReach = 1.65 + facingGap
    const facingFrom = orbitPoint(body.x, body.y, facingReach, facingOffset)
    const facingTo = orbitPoint(
      body.x,
      body.y,
      facingReach + facingMin + (facingMax - facingMin) * asteroid.facing.inPlane,
      facingOffset,
    )
    const periTick = orbitPoint(cx, cy, radius, asteroid.perihelionOffsetFromEarthPerihelion)
    const periInner = orbitPoint(
      cx,
      cy,
      Math.max(0, radius - 1.4),
      asteroid.perihelionOffsetFromEarthPerihelion,
    )
    const horizontal = label.x - cx
    const anchor = Math.abs(horizontal) < 3 ? 'middle' : horizontal < 0 ? 'end' : 'start'
    return { asteroid, radius, body, label, anchor, facingFrom, facingTo, periTick, periInner }
  }),
)

const jupiter = computed(() => {
  const offset = props.snapshot.jupiterOffsetFromEarthPerihelion
  return {
    inner: orbitPoint(cx, cy, laneOuterR + 1, offset),
    edge: orbitPoint(cx, cy, frameR, offset),
    label: orbitPoint(cx, cy, frameR + 3.2, offset),
  }
})

function toggle(id: string) {
  emit('select', id)
}

type RotationKind = 'sidereal' | 'solar'
type OrbitUnit = 'earth' | 'local'

const ROTATION_KIND_WORDS: Record<RotationKind, string> = {
  sidereal: 'a sidereal day, one spin against the stars',
  solar: 'a solar day, noon to noon',
}

const rotationKind = ref<RotationKind>('sidereal')
const orbitUnit = ref<OrbitUnit>('earth')

function toggleRotationKind() {
  rotationKind.value = rotationKind.value === 'sidereal' ? 'solar' : 'sidereal'
}

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'local' : 'earth'
}

const rotationKindAria = computed(
  () =>
    `Rotation period as ${ROTATION_KIND_WORDS[rotationKind.value]}. ` +
    `Click to show ${ROTATION_KIND_WORDS[rotationKind.value === 'sidereal' ? 'solar' : 'sidereal']}.`,
)

const COLUMNS: ReadoutColumn[] = [
  {
    id: 'diameter',
    heading: 'D',
    label: 'Effective diameter (D)',
    title: 'Effective diameter',
    onByDefault: true,
  },
  {
    id: 'a',
    heading: 'a',
    label: 'Mean distance (a)',
    title: 'Semi-major axis',
    onByDefault: true,
  },
  {
    id: 'e',
    heading: 'e',
    label: 'Eccentricity (e)',
    title: 'Orbital eccentricity',
    onByDefault: true,
  },
  {
    id: 'rotation',
    heading: 'P_rot',
    label: 'Rotation period',
    title: 'Rotation period',
    onByDefault: true,
  },
  {
    id: 'orbit',
    heading: 'P_orb',
    label: 'Orbital period',
    title: 'Sidereal orbital period',
    onByDefault: true,
  },
  {
    id: 'longitude',
    heading: 'λ',
    label: 'Longitude (λ)',
    title: 'Current heliocentric longitude',
    onByDefault: true,
  },
  {
    id: 'r',
    heading: 'r',
    label: 'Current distance (r)',
    title: 'Current heliocentric distance',
    onByDefault: true,
  },
  {
    id: 'obliquity',
    heading: 'ε',
    label: 'Obliquity (ε)',
    title: 'Obliquity',
    onByDefault: false,
  },
  {
    id: 'inclination',
    heading: 'i',
    label: 'Orbital inclination (i)',
    title: 'Inclination to the J2000 ecliptic',
    onByDefault: false,
  },
  {
    id: 'anomaly',
    heading: 'M',
    label: 'Mean anomaly (M)',
    title: 'Osculating mean anomaly since perihelion',
    onByDefault: false,
  },
  {
    id: 'day',
    heading: 'rot',
    label: 'Rotation progress',
    title: 'Apparent local solar time at the prime meridian',
    onByDefault: false,
  },
  {
    id: 'w0',
    heading: 'W₀',
    label: 'Prime meridian at J2000 (W₀)',
    title: 'Prime-meridian angle at J2000',
    onByDefault: false,
  },
  {
    id: 'resonance',
    heading: 'P_orb/P_rot',
    label: 'Spin–orbit ratio',
    title: 'Sidereal orbits per spin',
    onByDefault: false,
  },
  {
    id: 'q',
    heading: 'q',
    label: 'Perihelion distance (q)',
    title: 'Perihelion distance',
    onByDefault: false,
  },
  {
    id: 'Q',
    heading: 'Q',
    label: 'Aphelion distance (Q)',
    title: 'Aphelion distance',
    onByDefault: false,
  },
]

const rows = computed((): ReadoutRow[] =>
  props.snapshot.asteroids.map((asteroid) => {
    const rotationDays =
      rotationKind.value === 'sidereal' ? asteroid.siderealRotationDays : asteroid.solarDayDays
    const localUnit = rotationKind.value === 'sidereal' ? 'sid. d' : 'sol. d'
    const spinOrbit = asteroid.siderealOrbitDays / asteroid.siderealRotationDays
    const spin = `Spin axis tilted ${formatDeg(asteroid.obliquity)} from ecliptic north${
      asteroid.retrograde ? ' — rotates retrograde' : ''
    }`
    const meridian = primeMeridianLabel(asteroid.id, 'iau')
    return {
      id: asteroid.id,
      name: asteroid.name,
      color: asteroid.color,
      detail: `(${asteroid.number})`,
      cells: {
        diameter: { primary: formatQuantity(asteroid.diameterKm, 'km') },
        a: { primary: formatQuantity(asteroid.a, 'AU') },
        e: { primary: formatEcc(asteroid.e) },
        rotation: {
          primary: formatQuantity(rotationDays * HOURS_PER_DAY, 'h'),
          secondary: formatQuantity(rotationDays, 'd'),
          title: spin,
        },
        orbit:
          orbitUnit.value === 'earth'
            ? {
                primary: formatQuantity(asteroid.siderealOrbitDays, 'd'),
                secondary: formatQuantity(asteroid.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
              }
            : { primary: formatQuantity(asteroid.siderealOrbitDays / rotationDays, localUnit) },
        longitude: {
          primary: formatDeg(asteroid.longitude),
          secondary: formatRad(asteroid.longitude),
        },
        r: { primary: formatQuantity(asteroid.distanceAu, 'AU') },
        obliquity: {
          primary: formatDeg(asteroid.obliquity),
          secondary: formatRad(asteroid.obliquity),
          title: spin,
        },
        inclination: {
          primary: formatDeg(asteroid.inclination),
          secondary: formatRad(asteroid.inclination),
        },
        anomaly: {
          primary: formatDeg(asteroid.meanAnomaly),
          secondary: formatRad(asteroid.meanAnomaly),
        },
        day: {
          primary: `${(asteroid.dayFraction * 100).toFixed(1)}%`,
          secondary: formatDayClock(asteroid.dayFraction),
        },
        w0: asteroid.primeMeridianDefined
          ? {
              primary: formatDeg(asteroid.w0),
              secondary: formatRad(asteroid.w0),
              title: meridian,
            }
          : { primary: 'none', title: meridian },
        resonance: {
          primary: spinOrbit.toFixed(3),
          secondary: simpleRatio(spinOrbit) ?? undefined,
        },
        q: { primary: formatQuantity(asteroid.a * (1 - asteroid.e), 'AU') },
        Q: { primary: formatQuantity(asteroid.a * (1 + asteroid.e), 'AU') },
      },
    }
  }),
)

const selectedMeridian = computed(() => {
  const asteroid = props.snapshot.asteroids.find((item) => item.id === props.selectedAsteroid)
  return asteroid ? `${asteroid.name} — ${primeMeridianLabel(asteroid.id, 'iau')}` : null
})
</script>

<template>
  <div class="belt-view">
    <div class="belt-view__diagram">
      <svg
        :viewBox="viewBox"
        role="img"
        aria-label="Large objects in the main asteroid belt"
        :class="{ live }"
      >
        <title>Large objects in the main asteroid belt</title>
        <desc>
          Seven objects are placed at their current heliocentric longitudes. Their radial lanes
          exaggerate differences in semi-major axis and do not show current distance. Earth’s
          perihelion is up. A short tick on each lane marks that object’s perihelion. The Jupiter
          symbol at the edge marks Jupiter’s current direction.
        </desc>

        <circle class="frame" :cx="cx" :cy="cy" :r="frameR" />
        <circle
          class="belt-field"
          :cx="cx"
          :cy="cy"
          :r="(beltInnerR + frameR - 1) / 2"
          :stroke-width="frameR - 1 - beltInnerR"
        />

        <g class="lanes" aria-hidden="true">
          <circle
            v-for="mark in marks"
            :key="mark.asteroid.id"
            :cx="cx"
            :cy="cy"
            :r="mark.radius"
          />
        </g>

        <g class="axis" aria-hidden="true">
          <line :x1="cx" y1="2.5" :x2="cx" y2="5" />
          <text :x="cx" y="1">
            <tspan font-size="1.5em">⊕</tspan>
            <tspan baseline-shift="sub" font-size="0.75em">peri</tspan>
            <title>Perihelion - Nearest Point to the Sun</title>
          </text>
          <text :x="cx" y="99">
            <tspan font-size="1.5em">⊕</tspan>
            <tspan baseline-shift="sub" font-size="0.75em">aph</tspan>
            <title>Aphelion - Farthest Point from the Sun</title>
          </text>
        </g>

        <g class="jupiter-mark" aria-hidden="true">
          <line
            :x1="jupiter.inner.x"
            :y1="jupiter.inner.y"
            :x2="jupiter.edge.x"
            :y2="jupiter.edge.y"
          />
          <text :x="jupiter.label.x" :y="jupiter.label.y">♃</text>
        </g>

        <g class="sun" @dblclick="emit('select', 'sun')">
          <circle :cx="cx" :cy="cy" :r="sunR" />
          <text :x="cx" :y="cy">☉</text>
        </g>

        <g
          v-for="mark in marks"
          :key="mark.asteroid.id"
          class="asteroid"
          :class="{
            selected: selectedAsteroid === mark.asteroid.id,
            muted: selectedAsteroid && selectedAsteroid !== mark.asteroid.id,
          }"
          :style="{ '--body-color': mark.asteroid.color }"
          @click="toggle(mark.asteroid.id)"
        >
          <title>
            ({{ mark.asteroid.number }}) {{ mark.asteroid.name }} —
            {{ formatDeg(mark.asteroid.longitude) }} heliocentric longitude; perihelion
            {{ formatDeg(mark.asteroid.perihelionLongitude) }};
            {{ primeMeridianLabel(mark.asteroid.id, 'iau') }}
          </title>
          <line
            class="asteroid__peri"
            :x1="mark.periInner.x"
            :y1="mark.periInner.y"
            :x2="mark.periTick.x"
            :y2="mark.periTick.y"
          />
          <line
            class="asteroid__facing"
            :x1="mark.facingFrom.x"
            :y1="mark.facingFrom.y"
            :x2="mark.facingTo.x"
            :y2="mark.facingTo.y"
          />
          <circle class="asteroid__disc" :cx="mark.body.x" :cy="mark.body.y" r="1.65" />
          <text class="asteroid__number" :x="mark.body.x" :y="mark.body.y">
            {{ mark.asteroid.number }}
          </text>
          <text
            v-if="selectedAsteroid === mark.asteroid.id"
            class="asteroid__label"
            :x="mark.label.x"
            :y="mark.label.y"
            :text-anchor="mark.anchor"
          >
            {{ mark.asteroid.name }}
          </text>
        </g>
      </svg>
    </div>

    <BodyReadout
      title="Belt data"
      body-heading="Object"
      :columns="COLUMNS"
      :rows="rows"
      storage-key="solestia.readoutColumns.belt"
      :selected-id="selectedAsteroid"
      @select="toggle"
    >
      <template #help>
        <p>
          <strong>D</strong> is the effective diameter, the sphere of equal volume. Only Ceres is
          round enough for that to be nearly literal; the rest are lumpy, so the figure stands in
          for a shape.
        </p>
        <p>
          <strong>a</strong> is the semi-major axis, which is what sets each object’s lane above.
          The lanes are spread far wider than the real spacing, so they rank mean distance rather
          than measure it, and they say nothing about the current distance <strong>r</strong> — an
          eccentric orbit can put an inner object outside an outer one for part of its year.
          <strong>q</strong> and <strong>Q</strong> are the perihelion and aphelion distances that
          <strong>e</strong> implies.
        </p>
        <p>
          <strong>λ</strong> (lambda) is heliocentric ecliptic longitude, measured from the J2000
          vernal equinox, and it is the angle each object is drawn at. <strong>i</strong> is
          inclination to the J2000 ecliptic; Pallas is tipped almost 35°, so the flat diagram
          flatters it. <strong>M</strong> is the osculating mean anomaly, the uniform fraction of
          the orbit since perihelion.
        </p>
        <p>
          <strong>P<sub>rot</sub></strong> is the IAU sidereal spin. Click the heading for the solar
          day instead, noon to noon. These are fast rotators — most of the belt turns in well under
          a day, so <strong>P<sub>orb</sub>/P<sub>rot</sub></strong> runs into the thousands and
          none of them is anywhere near locked. Hover a value for the axial tilt.
          <strong>rot</strong> is how far the prime meridian has come through its solar day, 0% at
          local midnight.
        </p>
        <p>
          <strong>W<sub>0</sub></strong> is the prime-meridian angle at J2000. Ceres, Pallas, Vesta,
          (52) Europa and Davida have a published cartographic meridian; Hygiea and Interamnia do
          not, so their W<sub>0</sub> reads <em>none</em> and the rotation column is a measured pole
          and period with an arbitrary zero.
        </p>
        <p>
          <strong>Accuracy.</strong> Positions are cubic Hermite interpolations of JPL Horizons
          state vectors rather than a fit to mean elements, so λ and r are good to well under an arc
          second inside the sampled window and pin to its edges outside. <strong>a</strong>,
          <strong>e</strong> and <strong>i</strong> are catalog reference values from the Small-Body
          Database, while M and the perihelion direction are osculating values derived from the
          interpolated state.
        </p>
      </template>
      <template #head-rotation>
        <button
          type="button"
          class="th-toggle"
          :aria-label="rotationKindAria"
          @click="toggleRotationKind"
        >
          <span class="th-sym">P<sub>rot</sub></span>
          <span class="th-mode">{{ rotationKind }}</span>
        </button>
      </template>
      <template #head-orbit>
        <button
          type="button"
          class="th-toggle"
          :aria-label="
            orbitUnit === 'earth'
              ? 'Orbital period in Earth days and years. Click to show the object’s own days.'
              : 'Orbital period in the object’s own days. Click to show Earth days and years.'
          "
          @click="toggleOrbitUnit"
        >
          <span class="th-sym">P<sub>orb</sub></span>
          <span class="th-mode">{{ orbitUnit === 'earth' ? 'Earth d' : 'own days' }}</span>
        </button>
      </template>
      <template #head-resonance>
        <span class="th-sym">P<sub>orb</sub>/P<sub>rot</sub></span>
      </template>
    </BodyReadout>

    <div class="belt-view__footnotes">
      <p class="belt-view__note">
        Radial separation is expanded for clarity; it encodes mean distance, not the object’s
        instantaneous distance. Positions are interpolated from JPL Horizons state vectors.
      </p>
      <p v-if="selectedMeridian" class="belt-view__meridian">{{ selectedMeridian }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.belt-view {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  width: 100%;
  min-width: 0;
}

.belt-view__diagram {
  width: 100%;
  aspect-ratio: 1;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.frame {
  fill: none;
  stroke: $color-border;
  stroke-width: 0.35;
}

.belt-field {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 7%, transparent);
}

.lanes circle {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 28%, transparent);
  stroke-width: 0.24;
}

.axis {
  fill: $color-text-muted;
  font-family: $font-mono;
  font-size: 1.7px;
  text-anchor: middle;
}

.axis line {
  stroke: $color-text-muted;
  stroke-width: 0.35;
}

.jupiter-mark {
  fill: $color-text-muted;
  font-size: 4.1px;
  pointer-events: none;
  text-anchor: middle;
}

.jupiter-mark line {
  stroke: $color-text-muted;
  stroke-dasharray: 1 1.2;
  stroke-width: 0.35;
}

.jupiter-mark text,
.sun text,
.asteroid text {
  dominant-baseline: middle;
}

.sun circle {
  fill: color-mix(in srgb, $color-accent 28%, $color-surface);
  stroke: $color-accent;
  stroke-width: 0.45;
}

.sun text {
  fill: $color-accent;
  font-size: 3.3px;
  text-anchor: middle;
}

.sun {
  cursor: pointer;
}

.asteroid {
  --body-color: #aaa;
  cursor: pointer;
  transition: opacity 180ms ease;
}

.asteroid__disc {
  fill: var(--body-color);
  stroke: color-mix(in srgb, var(--body-color) 45%, white);
  stroke-width: 0.35;
  transition:
    r 140ms ease,
    stroke-width 140ms ease;
}

.asteroid__facing {
  stroke: var(--body-color);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
  pointer-events: none;
}

.asteroid__peri {
  stroke: var(--body-color);
  stroke-width: 0.35;
  stroke-linecap: round;
  opacity: 0.65;
  pointer-events: none;
}

.asteroid__number {
  fill: color-mix(in srgb, var(--body-color) 18%, black);
  font-family: $font-mono;
  font-size: 1.35px;
  font-weight: 700;
  text-anchor: middle;
  pointer-events: none;
}

.asteroid__label {
  fill: $color-text;
  font-size: 1.85px;
  paint-order: stroke;
  stroke: $color-bg;
  stroke-width: 0.8px;
  stroke-linejoin: round;
  pointer-events: none;
}

.asteroid.selected .asteroid__disc {
  r: 2.05px;
  stroke: $color-accent;
  stroke-width: 0.65;
}

.asteroid.muted {
  opacity: 0.25;
}

.belt-view__footnotes {
  display: grid;
  gap: $spacing-xs;
}

.belt-view__note {
  margin: 0;
  color: $color-text-muted;
  font-size: 0.72rem;
  line-height: 1.45;
}

.belt-view__meridian {
  margin: 0;
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.7rem;
}

@media (prefers-reduced-motion: reduce) {
  .asteroid,
  .asteroid__disc {
    transition: none;
  }
}
</style>
