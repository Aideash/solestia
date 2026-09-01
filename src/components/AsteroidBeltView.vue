<script setup lang="ts">
import { computed, ref } from 'vue'
import { primeMeridianLabel } from '../data/selectionNotes.ts'
import {
  formatDayClock,
  formatDeg,
  formatEcc,
  formatHeliocentricDistance,
  formatQuantity,
  formatRad,
  simpleRatio,
  HOURS_PER_DAY,
  JULIAN_YEAR_DAYS,
  type DistanceUnit,
} from '../lib/format.ts'
import {
  edgeOnWhisker,
  orbitPoint,
  projectEdgeOn,
  projectEclipticTopDown,
  splitClosedByDepth,
  type Facing,
} from '../lib/kepler.ts'
import { asteroidOrbitPositions, type AsteroidBeltSnapshot } from '../lib/asteroidEphemeris.ts'
import type { ViewPlane } from '../data/planetSystems.ts'
import type { ReadoutColumn, ReadoutRow } from '../lib/readout.ts'
import BodyReadout from './BodyReadout.vue'

const props = defineProps<{
  snapshot: AsteroidBeltSnapshot
  selectedAsteroid?: string | null
  viewPlane?: ViewPlane
  live?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const sunR = 3.5
const laneOuterR = 42
const frameR = 46
const facingGap = 0.2
const facingMin = 0.35
const facingMax = 1.25
/** The same whisker for the Sun, scaled to its larger disc. */
const sunFacingGap = 0.35
const sunFacingMin = 0.6
const sunFacingMax = 1.6
const pad = 6
const viewBox = `${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`

const useEdge = computed(() => props.viewPlane === 'edge')

const asteroidR = 1.65

type Point = { x: number; y: number }
type ViewWhisker = { from: Point; to: Point; variant: 'flat' | 'near' | 'far' }

/**
 * A prime-meridian whisker for one body. Seen from ecliptic north it is a
 * bearing starting clear of the disc; edge-on it stands on the surface, so its
 * own disc hides it while the meridian faces away and it paints across the
 * face while the meridian faces the camera.
 */
function whiskerFor(
  center: Point,
  bodyRadius: number,
  facing: Facing,
  origin: number,
  gap: number,
  min: number,
  max: number,
): ViewWhisker | null {
  if (useEdge.value) {
    const edge = edgeOnWhisker(center, bodyRadius, facing, origin, min, max)
    return edge && { from: edge.from, to: edge.to, variant: edge.far ? 'far' : 'near' }
  }
  const offset = facing.longitude - origin
  const reach = bodyRadius + gap
  return {
    from: orbitPoint(center.x, center.y, reach, offset),
    to: orbitPoint(center.x, center.y, reach + min + (max - min) * facing.inPlane, offset),
    variant: 'flat',
  }
}

/**
 * The belt is one annulus rather than a system spanning decades of distance,
 * so it takes a plain proportional scale instead of the orrery's compressed
 * one: seven semi-major axes packed into 2.4–3.2 AU give that scale almost no
 * spacing to pin against, and it collapses the whole belt toward the Sun.
 * Proportional also keeps the camera honest, since a body twice as far from
 * the Sun draws twice as far from it.
 */
const auToRadius = computed(() => {
  const widest = Math.max(
    ...props.snapshot.asteroids.map((asteroid) => asteroid.a * (1 + asteroid.e)),
  )
  return widest > 0 ? laneOuterR / widest : 1
})

function scaleAu(distance: number): number {
  return distance * auToRadius.value
}

function laneRadius(a: number): number {
  return scaleAu(a)
}

/** The main belt at its true radial extent under the same scale, 2.06–3.27 AU. */
const beltField = computed(() => {
  const inner = scaleAu(2.06)
  const outer = scaleAu(3.27)
  return { radius: (inner + outer) / 2, width: outer - inner }
})

const projectedMarks = computed(() => {
  const origin = props.snapshot.earthPerihelionLongitude
  const at = props.snapshot.at
  const scale = scaleAu
  const project = useEdge.value ? projectEdgeOn : projectEclipticTopDown
  return props.snapshot.asteroids.map((asteroid) => {
    const radius = laneRadius(asteroid.a)
    const projected = project(cx, cy, asteroid.position, origin, scale)
    const samples = asteroidOrbitPositions(asteroid.id, at)
    const orbitPoints = samples.map((sample) => project(cx, cy, sample, origin, scale))
    const { far, near } = splitClosedByDepth(orbitPoints, useEdge.value ? 'positive' : 'negative')
    const peri = samples[0] ? project(cx, cy, samples[0], origin, scale) : projected
    const periDx = peri.x - cx
    const periDy = peri.y - cy
    const periLen = Math.hypot(periDx, periDy)
    const periInner =
      periLen > 1e-6
        ? {
            x: peri.x - (periDx / periLen) * 1.4,
            y: peri.y - (periDy / periLen) * 1.4,
          }
        : peri
    const body = { x: projected.x, y: projected.y }
    const bodyDx = body.x - cx
    const bodyDy = body.y - cy
    const bodyLen = Math.hypot(bodyDx, bodyDy)
    const label =
      bodyLen > 1e-6
        ? {
            x: body.x + (bodyDx / bodyLen) * 3.2,
            y: body.y + (bodyDy / bodyLen) * 3.2,
          }
        : { x: body.x, y: body.y - 3.2 }
    const labelX = label.x
    const anchor = Math.abs(labelX - cx) < 3 ? 'middle' : labelX < cx ? 'end' : 'start'
    const whisker = whiskerFor(
      body,
      asteroidR,
      asteroid.facing,
      origin,
      facingGap,
      facingMin,
      facingMax,
    )
    return {
      asteroid,
      radius,
      body,
      depth: projected.depth,
      far,
      near,
      stem: { x1: projected.x, y1: cy, x2: projected.x, y2: projected.y },
      periTick: peri,
      periInner,
      whisker,
      label,
      anchor,
    }
  })
})

const projectedBodies = computed(() =>
  [...projectedMarks.value].sort((a, b) => (useEdge.value ? b.depth - a.depth : a.depth - b.depth)),
)

/**
 * Where the Carrington prime meridian points. The Sun's axis is tilted only 7°
 * from ecliptic north, so edge-on this whisker stays close to the horizontal
 * while it sweeps in and out across the disc.
 */
const sunFacing = computed(() =>
  whiskerFor(
    { x: cx, y: cy },
    sunR,
    props.snapshot.sun.facing,
    props.snapshot.earthPerihelionLongitude,
    sunFacingGap,
    sunFacingMin,
    sunFacingMax,
  ),
)

const projectedJupiter = computed(() => {
  const origin = props.snapshot.earthPerihelionLongitude
  const position = props.snapshot.jupiterPosition
  const distance = Math.hypot(position.x, position.y, position.z)
  const project = useEdge.value ? projectEdgeOn : projectEclipticTopDown
  const projected = project(cx, cy, position, origin, () => frameR)
  const dx = projected.x - cx
  const dy = projected.y - cy
  const len = Math.hypot(dx, dy)
  if (len < 1e-6 || distance < 1e-12) {
    return {
      inner: { x: cx, y: cy },
      edge: { x: cx + frameR, y: cy },
      label: { x: cx + frameR + 3.2, y: cy },
    }
  }
  return {
    inner: { x: cx + (dx / len) * (laneOuterR + 1), y: cy + (dy / len) * (laneOuterR + 1) },
    edge: { x: cx + (dx / len) * frameR, y: cy + (dy / len) * frameR },
    label: { x: cx + (dx / len) * (frameR + 3.2), y: cy + (dy / len) * (frameR + 3.2) },
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
const distanceUnit = ref<DistanceUnit>('AU')

function toggleRotationKind() {
  rotationKind.value = rotationKind.value === 'sidereal' ? 'solar' : 'sidereal'
}

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'local' : 'earth'
}

function toggleDistanceUnit() {
  distanceUnit.value = distanceUnit.value === 'AU' ? 'km' : 'AU'
}

const distanceUnitAria = computed(() =>
  distanceUnit.value === 'AU'
    ? 'Current distance in AU. Click to show kilometers. Mean, perihelion, and aphelion follow.'
    : 'Current distance in kilometers. Click to show AU. Mean, perihelion, and aphelion follow.',
)

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
        a: formatHeliocentricDistance(asteroid.a, distanceUnit.value),
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
        r: formatHeliocentricDistance(asteroid.distanceAu, distanceUnit.value),
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
        q: formatHeliocentricDistance(asteroid.a * (1 - asteroid.e), distanceUnit.value),
        Q: formatHeliocentricDistance(asteroid.a * (1 + asteroid.e), distanceUnit.value),
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
        :aria-label="
          useEdge
            ? 'Large objects in the main asteroid belt, edge-on to the ecliptic'
            : 'Large objects in the main asteroid belt, viewed from ecliptic north'
        "
        :class="{ live }"
      >
        <title>Large objects in the main asteroid belt</title>
        <desc>
          {{
            useEdge
              ? 'Seven objects and their sampled orbits are shown edge-on to the ecliptic. Vertical is ecliptic north. Screen radius is proportional to heliocentric distance. Bodies nearer along Earth’s perihelion direction are drawn in front. The Jupiter symbol marks Jupiter’s current direction. Each whisker stands on the surface point its prime meridian passes through: it slides in from the limb and shortens as that meridian turns to face the camera, paints across the disc while facing the viewer, and its own disc hides it while facing away. The Sun’s axis is tilted only 7 degrees from ecliptic north, so its whisker stays close to the horizontal.'
              : 'Seven objects and their sampled orbits are seen by an orthographic camera north of the ecliptic. Screen radius is proportional to heliocentric distance, so inclined orbits foreshorten toward the Sun. Faint circles mark each semi-major axis. Earth’s perihelion is up. Bodies above the ecliptic are drawn in front. The Jupiter symbol marks Jupiter’s current direction. The whisker on the Sun points where the Carrington prime meridian faces.'
          }}
        </desc>

        <circle class="frame" :cx="cx" :cy="cy" :r="frameR" />
        <circle
          v-if="!useEdge"
          class="belt-field"
          :cx="cx"
          :cy="cy"
          :r="beltField.radius"
          :stroke-width="beltField.width"
        />
        <line
          v-if="useEdge"
          class="ecliptic"
          :x1="cx - frameR"
          :y1="cy"
          :x2="cx + frameR"
          :y2="cy"
        />

        <g v-if="!useEdge" class="axis" aria-hidden="true">
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
          <title>Jupiter</title>
          <line
            :x1="projectedJupiter.inner.x"
            :y1="projectedJupiter.inner.y"
            :x2="projectedJupiter.edge.x"
            :y2="projectedJupiter.edge.y"
          />
          <text :x="projectedJupiter.label.x" :y="projectedJupiter.label.y">♃</text>
        </g>

        <g
          v-for="mark in projectedMarks"
          :key="`far-${mark.asteroid.id}`"
          class="orbit-far"
          :class="{ selected: selectedAsteroid === mark.asteroid.id }"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.far" :key="index" class="orbit" :d="d" />
        </g>

        <g class="sun" @dblclick="emit('select', 'sun')">
          <title>
            Sun — Carrington prime meridian faces
            {{ formatDeg(snapshot.sun.facing.longitude) }} ecliptic longitude
          </title>
          <line
            v-if="sunFacing?.variant === 'far'"
            class="sun__facing facing--far"
            :x1="sunFacing.from.x"
            :y1="sunFacing.from.y"
            :x2="sunFacing.to.x"
            :y2="sunFacing.to.y"
          />
          <circle :cx="cx" :cy="cy" :r="sunR" />
          <line
            v-if="sunFacing && sunFacing.variant !== 'far'"
            class="sun__facing"
            :class="{ 'facing--near': sunFacing.variant === 'near' }"
            :x1="sunFacing.from.x"
            :y1="sunFacing.from.y"
            :x2="sunFacing.to.x"
            :y2="sunFacing.to.y"
          />
          <text :x="cx" :y="cy">☉</text>
        </g>

        <g
          v-for="mark in projectedMarks"
          :key="`near-${mark.asteroid.id}`"
          class="orbit-near"
          :class="{ selected: selectedAsteroid === mark.asteroid.id }"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.near" :key="index" class="orbit" :d="d" />
        </g>
        <g
          v-for="mark in projectedBodies"
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
            {{ formatDeg(mark.asteroid.longitude) }} heliocentric longitude; inclination
            {{ formatDeg(mark.asteroid.inclination) }};
            {{ primeMeridianLabel(mark.asteroid.id, 'iau') }}
          </title>
          <!-- <line
            v-if="useEdge"
            class="asteroid__stem"
            :x1="mark.stem.x1"
            :y1="mark.stem.y1"
            :x2="mark.stem.x2"
            :y2="mark.stem.y2"
          /> -->
          <line
            class="asteroid__peri"
            :x1="mark.periInner.x"
            :y1="mark.periInner.y"
            :x2="mark.periTick.x"
            :y2="mark.periTick.y"
          />
          <line
            v-if="mark.whisker?.variant === 'far'"
            class="asteroid__facing facing--far"
            :x1="mark.whisker.from.x"
            :y1="mark.whisker.from.y"
            :x2="mark.whisker.to.x"
            :y2="mark.whisker.to.y"
          />
          <circle class="asteroid__disc" :cx="mark.body.x" :cy="mark.body.y" :r="asteroidR" />
          <line
            v-if="mark.whisker && mark.whisker.variant !== 'far'"
            class="asteroid__facing"
            :class="{ 'facing--near': mark.whisker.variant === 'near' }"
            :x1="mark.whisker.from.x"
            :y1="mark.whisker.from.y"
            :x2="mark.whisker.to.x"
            :y2="mark.whisker.to.y"
          />
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
          <strong>a</strong> is the semi-major axis, which sets the faint circle each object’s orbit
          is measured against above. Screen radius is simply proportional to distance, so the belt
          is drawn to scale and the objects sit in a narrow annulus: Ceres and Pallas share a circle
          because their mean distances really do agree to a few thousandths of an AU.
          <strong>r</strong> is the full three-dimensional distance, so an inclined object draws a
          little inside its circle even at that distance. Click the heading to lead with AU or km;
          <strong>a</strong>, <strong>q</strong>, and <strong>Q</strong> follow.
          <strong>q</strong> and <strong>Q</strong> are the perihelion and aphelion distances that
          <strong>e</strong> implies.
        </p>
        <p>
          <strong>λ</strong> (lambda) is heliocentric ecliptic longitude, measured from the J2000
          vernal equinox. The ecliptic view is an orthographic camera from ecliptic north, so
          <strong>i</strong> foreshortens the orbit; Pallas’s almost 35° tilt is visible in its oval
          trace. Edge rotates that camera 90° and shows the same tilt as height above the ecliptic.
          <strong>M</strong> is the osculating mean anomaly, the uniform fraction of the orbit since
          perihelion.
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
          <strong>Accuracy.</strong> Positions are interpolated from JPL Horizons state vectors half
          a year apart rather than fitted to mean elements. The curve between two of them matches
          position, velocity and gravitational acceleration at both ends, which holds λ within a few
          arc seconds inside the sampled window — half an arc minute for Pallas, the most eccentric
          of the seven — and pins to its edges outside. <strong>a</strong>, <strong>e</strong> and
          <strong>i</strong> are catalog reference values from the Small-Body Database, while M and
          the perihelion direction are osculating values derived from the interpolated state.
        </p>
      </template>
      <template #head-r>
        <button
          type="button"
          class="th-toggle"
          :aria-label="distanceUnitAria"
          @click="toggleDistanceUnit"
        >
          <span class="th-sym">r</span>
          <span class="th-mode">{{ distanceUnit }}</span>
        </button>
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
        Screen radius is proportional to heliocentric distance, so the belt is drawn to scale and
        crowds into one annulus. Positions are interpolated from JPL Horizons state vectors. Edge
        rotates the ecliptic camera 90°; vertical is ecliptic north.
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

.ecliptic {
  stroke: $color-text-muted;
  stroke-width: 0.28;
  stroke-dasharray: 1 1.2;
  opacity: 0.7;
}

.orbit {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 45%, transparent);
  stroke-width: 0.28;
}

.orbit-far .orbit {
  opacity: 0.65;
}

// .asteroid__stem {
//   stroke: color-mix(in srgb, var(--body-color) 40%, transparent);
//   stroke-width: 0.22;
//   pointer-events: none;
// }

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
  text-anchor: middle;
  cursor: default;
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

.sun__facing {
  --facing-stroke: #{$color-accent};

  stroke: var(--facing-stroke);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
  pointer-events: none;
}

.sun {
  cursor: pointer;
}

g.orbit-near,
g.orbit-far {
  cursor: pointer;

  &.selected .orbit {
    stroke: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  &:hover {
    opacity: 0.6;
  }

  &.selected:hover {
    opacity: 0.8;
  }
}

svg:has(g.selected) {
  g.orbit-near,
  g.orbit-far {
    &:not(.selected):not(:hover) {
      opacity: 0.4;
    }
  }
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
  --facing-stroke: var(--body-color);

  stroke: var(--facing-stroke);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
  pointer-events: none;
}

/**
 * Edge-on, a whisker stands on the body's surface. Facing the camera it paints
 * across the disc, so it is darkened to read against the color underneath.
 * Facing away it is buried, and only what clears the limb shows — dimmed with
 * `stroke-opacity` so it multiplies with the group's own fading rather than
 * fighting it. Both rules follow the bases they override.
 */
.facing--near {
  stroke: color-mix(in srgb, var(--facing-stroke) 45%, black);
}

.facing--far {
  stroke-opacity: 0.45;
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
