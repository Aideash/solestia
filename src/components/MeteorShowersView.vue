<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ViewPlane } from '../data/planetSystems.ts'
import {
  formatDeg,
  formatEcc,
  formatHeliocentricDistance,
  formatQuantity,
  formatRad,
  JULIAN_YEAR_DAYS,
  type DistanceUnit,
} from '../lib/format.ts'
import {
  edgeOnWhisker,
  orbitPoint,
  projectEdgeOn,
  projectEclipticCylindrical,
  type Facing,
  type PlanetState,
} from '../lib/kepler.ts'
import { type MeteorParentState, type MeteorShowersSnapshot } from '../lib/meteorEphemeris.ts'
import { projectedKeplerOrbitPaths } from '../lib/orbitPath.ts'
import { extentRadialScale, type OrbitExtent } from '../lib/radialScale.ts'
import type { ReadoutColumn, ReadoutRow } from '../lib/readout.ts'
import BodyReadout from './BodyReadout.vue'

const props = defineProps<{
  snapshot: MeteorShowersSnapshot
  selectedParent?: string | null
  viewPlane?: ViewPlane
  live?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const sunR = 3.2
/**
 * The nearest perihelion and farthest aphelion share the available lane. The
 * inner clearance keeps the closest parent visually separate from the Sun.
 */
const laneInnerR = 7
const laneOuterR = 42
const frameR = 46
const parentR = 1.55
const planetR = 1.35
const earthR = 1.7
const facingGap = 0.2
const facingMin = 0.35
const facingMax = 1.25
const sunFacingGap = 0.35
const sunFacingMin = 0.6
const sunFacingMax = 1.6
/** Anti-sun tails are longer than prime-meridian whiskers. */
const tailGap = 0.15
const tailMin = 1.2
const tailMax = 4.5
const pad = 6
const viewBox = `${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`

const useEdge = computed(() => props.viewPlane === 'edge')

type Point = { x: number; y: number }
type ViewWhisker = { from: Point; to: Point; variant: 'flat' | 'near' | 'far' }

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
 * Opacity and length for the anti-sun tail. Bright near the Sun, fading past
 * ~3 AU so distant parents do not keep a full trail.
 */
function tailStrength(distanceAu: number): { opacity: number; lengthScale: number } {
  const opacity = Math.max(0.08, Math.min(1, (3.2 - distanceAu) / 2.6))
  const lengthScale = Math.max(0.25, Math.min(1, (2.8 - distanceAu) / 2.2))
  return { opacity, lengthScale }
}

/**
 * One stable logarithmic scale fitted to every displayed orbit's perihelion and
 * aphelion. Catalog-bound parent elements keep a sun-grazing fit from shrinking
 * the scale if interpolation ever goes hyperbolic.
 */
const scaleAu = computed(() => {
  const planets: OrbitExtent[] = [
    props.snapshot.mercury,
    props.snapshot.earth,
    props.snapshot.neptune,
  ]
  const parents = props.snapshot.parents.map(({ osculating }): OrbitExtent => osculating)
  return extentRadialScale([...planets, ...parents], laneInnerR, laneOuterR)
})

/** Faint 1 AU guide so the scale anchor is visible. */
const earthOrbitRing = computed(() => scaleAu.value(1))

function projectView(
  position: { x: number; y: number; z: number },
  origin: number,
  scale: (distance: number) => number,
) {
  return useEdge.value
    ? projectEdgeOn(cx, cy, position, origin, scale)
    : projectEclipticCylindrical(cx, cy, position, origin, scale)
}

function periTick(peri: Point): { periTick: Point; periInner: Point } {
  const periDx = peri.x - cx
  const periDy = peri.y - cy
  const periLen = Math.hypot(periDx, periDy)
  const periInner =
    periLen > 1e-6
      ? { x: peri.x - (periDx / periLen) * 1.4, y: peri.y - (periDy / periLen) * 1.4 }
      : peri
  return { periTick: peri, periInner }
}

function labelFor(body: Point): { label: Point; anchor: 'start' | 'middle' | 'end' } {
  const bodyDx = body.x - cx
  const bodyDy = body.y - cy
  const bodyLen = Math.hypot(bodyDx, bodyDy)
  const label =
    bodyLen > 1e-6
      ? { x: body.x + (bodyDx / bodyLen) * 3.2, y: body.y + (bodyDy / bodyLen) * 3.2 }
      : { x: body.x, y: body.y - 3.2 }
  const anchor = Math.abs(label.x - cx) < 3 ? 'middle' : label.x < cx ? 'end' : 'start'
  return { label, anchor }
}

function projectPlanet(planet: PlanetState) {
  const origin = props.snapshot.earthPerihelionLongitude
  const scale = scaleAu.value
  const projected = projectView(planet.position, origin, scale)
  const farSide = useEdge.value ? 'positive' : 'negative'
  const { far, near, peri } = projectedKeplerOrbitPaths(
    {
      a: planet.a,
      e: planet.e,
      i: planet.inclination,
      Omega: planet.nodeLongitude,
      varpi: planet.perihelionLongitude,
    },
    (position) => projectView(position, origin, scale),
    farSide,
  )
  const body = { x: projected.x, y: projected.y }
  const { label, anchor } = labelFor(body)
  const radius = planet.id === 'earth' ? earthR : planetR
  const whisker =
    planet.id === 'earth'
      ? whiskerFor(body, radius, planet.facing, origin, facingGap, facingMin, facingMax)
      : null
  return {
    planet,
    body,
    depth: projected.depth,
    far,
    near,
    ...periTick(peri),
    whisker,
    label,
    anchor,
    radius,
  }
}

const projectedPlanets = computed(() => {
  const marks = [
    projectPlanet(props.snapshot.mercury),
    projectPlanet(props.snapshot.earth),
    projectPlanet(props.snapshot.neptune),
  ]
  return [...marks].sort((a, b) => (useEdge.value ? b.depth - a.depth : a.depth - b.depth))
})

const projectedParents = computed(() => {
  const origin = props.snapshot.earthPerihelionLongitude
  const scale = scaleAu.value
  const farSide = useEdge.value ? 'positive' : 'negative'
  return props.snapshot.parents.map((parent) => {
    const projected = projectView(parent.position, origin, scale)
    const { far, near, peri } = projectedKeplerOrbitPaths(
      parent.osculating,
      (position) => projectView(position, origin, scale),
      farSide,
    )
    const body = { x: projected.x, y: projected.y }
    const { label, anchor } = labelFor(body)
    const strength = tailStrength(parent.distanceAu)
    const tailBase = whiskerFor(
      body,
      parentR,
      parent.tail,
      origin,
      tailGap,
      tailMin * strength.lengthScale,
      tailMax * strength.lengthScale,
    )
    const crossings = parent.earthCrossings.map((crossing, index) => {
      const point = projectView(crossing.position, origin, scale)
      return {
        key: `${parent.id}-cross-${index}`,
        point,
        shower: crossing.shower,
        depth: point.depth,
      }
    })
    return {
      parent,
      body,
      depth: projected.depth,
      far,
      near,
      ...periTick(peri),
      tail: tailBase,
      tailOpacity: strength.opacity,
      crossings,
      label,
      anchor,
      showerLabel: parent.showers.map((shower) => shower.name).join(' · '),
    }
  })
})

const projectedParentBodies = computed(() =>
  [...projectedParents.value].sort((a, b) =>
    useEdge.value ? b.depth - a.depth : a.depth - b.depth,
  ),
)

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

function toggle(id: string) {
  emit('select', id)
}

const distanceUnit = ref<DistanceUnit>('AU')
const orbitUnit = ref<'earth' | 'years'>('earth')

function toggleDistanceUnit() {
  distanceUnit.value = distanceUnit.value === 'AU' ? 'km' : 'AU'
}

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'years' : 'earth'
}

const distanceUnitAria = computed(() =>
  distanceUnit.value === 'AU'
    ? 'Current distance in AU. Click to show kilometers. Mean, perihelion, and aphelion follow.'
    : 'Current distance in kilometers. Click to show AU. Mean, perihelion, and aphelion follow.',
)

const COLUMNS: ReadoutColumn[] = [
  {
    id: 'showers',
    heading: 'shower',
    label: 'Associated shower(s)',
    title: 'Meteor shower(s) linked to this parent',
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
  {
    id: 'crossings',
    heading: '⊕',
    label: 'Earth-orbit crossings',
    title: 'Osculating approaches to Earth’s orbit near 1 AU',
    onByDefault: false,
  },
]

function parentDetail(parent: MeteorParentState): string {
  return parent.showers.map((shower) => shower.name).join(', ')
}

/** Summarize Earth approaches: near-ecliptic r ≈ 1, or a node just outside 1 AU. */
function crossingSummary(parent: MeteorParentState): {
  primary: string
  title: string
  note: string
} {
  const crossings = parent.earthCrossings
  if (crossings.length === 0) {
    return {
      primary: 'none',
      title: 'No osculating approach to Earth’s orbit',
      note: 'no osculating Earth-orbit approaches',
    }
  }
  const radii = crossings.map((crossing) =>
    Math.hypot(crossing.position.x, crossing.position.y, crossing.position.z),
  )
  const outside = radii.every((radius) => radius > 1.05)
  const names = crossings.map((crossing) => crossing.shower?.name ?? 'near Earth').join(', ')
  const count = crossings.length
  const plural = count === 1 ? '' : 's'
  if (outside) {
    const r = radii[0].toFixed(2)
    return {
      primary: names,
      title: `Closest ecliptic node at r ≈ ${r} AU (just outside Earth’s orbit)`,
      note: `closest ecliptic node at r ≈ ${r} AU`,
    }
  }
  return {
    primary: names,
    title: `${count} Earth-orbit approach${plural} near 1 AU`,
    note: `${count} osculating Earth-orbit approach${plural}`,
  }
}

const rows = computed((): ReadoutRow[] =>
  props.snapshot.parents.map((parent) => ({
    id: parent.id,
    name: parent.name,
    color: parent.color,
    detail: parentDetail(parent),
    cells: {
      showers: {
        primary: parent.showers.map((shower) => shower.name).join(', '),
        secondary: parent.showers.map((shower) => shower.peak).join('; '),
      },
      a: formatHeliocentricDistance(parent.a, distanceUnit.value),
      e: { primary: formatEcc(parent.e) },
      orbit:
        orbitUnit.value === 'earth'
          ? {
              primary: formatQuantity(parent.siderealOrbitDays, 'd'),
              secondary: formatQuantity(parent.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
            }
          : {
              primary: formatQuantity(parent.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
            },
      longitude: {
        primary: formatDeg(parent.longitude),
        secondary: formatRad(parent.longitude),
      },
      r: formatHeliocentricDistance(parent.distanceAu, distanceUnit.value),
      inclination: {
        primary: formatDeg(parent.inclination),
        secondary: formatRad(parent.inclination),
      },
      anomaly: {
        primary: formatDeg(parent.meanAnomaly),
        secondary: formatRad(parent.meanAnomaly),
      },
      q: formatHeliocentricDistance(parent.a * (1 - parent.e), distanceUnit.value),
      Q: formatHeliocentricDistance(parent.a * (1 + parent.e), distanceUnit.value),
      crossings: (() => {
        const summary = crossingSummary(parent)
        return { primary: summary.primary, title: summary.title }
      })(),
    },
  })),
)

const selectedNote = computed(() => {
  const parent = props.snapshot.parents.find((item) => item.id === props.selectedParent)
  if (!parent) return null
  const showers = parent.showers.map((shower) => `${shower.name} (${shower.peak})`).join('; ')
  return `${parent.name} — ${showers}; ${crossingSummary(parent).note}. Tail points anti-sunward.`
})
</script>

<template>
  <div class="meteor-view">
    <div class="meteor-view__diagram">
      <svg
        :viewBox="viewBox"
        role="img"
        :aria-label="
          useEdge
            ? 'Meteor-shower parent bodies and Earth-crossing orbits, edge-on to the ecliptic'
            : 'Meteor-shower parent bodies and Earth-crossing orbits, viewed from ecliptic north'
        "
        :class="{ live }"
      >
        <title>Meteor showers and parent bodies</title>
        <desc>
          {{
            useEdge
              ? 'Six shower parents with debris-trail orbits and anti-sun tails, plus Mercury, Earth, and Neptune for scale. Vertical is ecliptic north. Marks sit where each parent orbit approaches Earth’s path near 1 AU.'
              : 'Six shower parents with debris-trail orbits and anti-sun tails, plus Mercury, Earth, and Neptune for scale. Earth’s perihelion is up. Marks sit where each parent orbit approaches Earth’s path near 1 AU.'
          }}
        </desc>

        <circle class="frame" :cx="cx" :cy="cy" :r="frameR" />
        <circle
          v-if="!useEdge"
          class="earth-au"
          :cx="cx"
          :cy="cy"
          :r="earthOrbitRing"
          aria-hidden="true"
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

        <g
          v-for="mark in projectedParents"
          :key="`far-${mark.parent.id}`"
          class="orbit-far parent-orbit"
          :class="{
            selected: selectedParent === mark.parent.id,
            muted: selectedParent && selectedParent !== mark.parent.id,
          }"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.far" :key="index" class="orbit orbit--debris" :d="d" />
        </g>

        <g
          v-for="mark in projectedPlanets"
          :key="`planet-far-${mark.planet.id}`"
          class="orbit-far planet-orbit"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.far" :key="index" class="orbit orbit--planet" :d="d" />
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
          v-for="mark in projectedParents"
          :key="`near-${mark.parent.id}`"
          class="orbit-near parent-orbit"
          :class="{
            selected: selectedParent === mark.parent.id,
            muted: selectedParent && selectedParent !== mark.parent.id,
          }"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.near" :key="index" class="orbit orbit--debris" :d="d" />
        </g>

        <g
          v-for="mark in projectedPlanets"
          :key="`planet-near-${mark.planet.id}`"
          class="orbit-near planet-orbit"
          aria-hidden="true"
        >
          <path v-for="(d, index) in mark.near" :key="index" class="orbit orbit--planet" :d="d" />
        </g>

        <g
          v-for="mark in projectedParents"
          :key="`cross-${mark.parent.id}`"
          class="crossings"
          :class="{
            selected: selectedParent === mark.parent.id,
            muted: selectedParent && selectedParent !== mark.parent.id,
          }"
          :style="{ '--body-color': mark.parent.color }"
          aria-hidden="true"
        >
          <g v-for="crossing in mark.crossings" :key="crossing.key">
            <title>
              {{ crossing.shower?.name ?? 'Earth-orbit approach' }} — near Earth’s orbit on
              {{ mark.parent.name }}
            </title>
            <circle class="crossing" :cx="crossing.point.x" :cy="crossing.point.y" r="0.85" />
          </g>
        </g>

        <g
          v-for="mark in projectedPlanets"
          :key="mark.planet.id"
          class="planet"
          :style="{ '--body-color': mark.planet.color }"
        >
          <title>
            {{ mark.planet.name }} — {{ formatDeg(mark.planet.longitude) }} heliocentric longitude
          </title>
          <line
            class="planet__peri"
            :x1="mark.periInner.x"
            :y1="mark.periInner.y"
            :x2="mark.periTick.x"
            :y2="mark.periTick.y"
          />
          <line
            v-if="mark.whisker?.variant === 'far'"
            class="planet__facing facing--far"
            :x1="mark.whisker.from.x"
            :y1="mark.whisker.from.y"
            :x2="mark.whisker.to.x"
            :y2="mark.whisker.to.y"
          />
          <circle class="planet__disc" :cx="mark.body.x" :cy="mark.body.y" :r="mark.radius" />
          <line
            v-if="mark.whisker && mark.whisker.variant !== 'far'"
            class="planet__facing"
            :class="{ 'facing--near': mark.whisker.variant === 'near' }"
            :x1="mark.whisker.from.x"
            :y1="mark.whisker.from.y"
            :x2="mark.whisker.to.x"
            :y2="mark.whisker.to.y"
          />
          <text class="planet__symbol" :x="mark.body.x" :y="mark.body.y">
            {{ mark.planet.symbol }}
          </text>
        </g>

        <g
          v-for="mark in projectedParentBodies"
          :key="mark.parent.id"
          class="parent"
          :class="{
            selected: selectedParent === mark.parent.id,
            muted: selectedParent && selectedParent !== mark.parent.id,
          }"
          :style="{ '--body-color': mark.parent.color, '--tail-opacity': mark.tailOpacity }"
          @click="toggle(mark.parent.id)"
        >
          <title>
            {{ mark.parent.name }} — {{ mark.showerLabel }};
            {{ formatDeg(mark.parent.longitude) }} heliocentric longitude; inclination
            {{ formatDeg(mark.parent.inclination) }}
          </title>
          <line
            class="parent__peri"
            :x1="mark.periInner.x"
            :y1="mark.periInner.y"
            :x2="mark.periTick.x"
            :y2="mark.periTick.y"
          />
          <line
            v-if="mark.tail?.variant === 'far'"
            class="parent__tail facing--far"
            :x1="mark.tail.from.x"
            :y1="mark.tail.from.y"
            :x2="mark.tail.to.x"
            :y2="mark.tail.to.y"
          />
          <circle class="parent__disc" :cx="mark.body.x" :cy="mark.body.y" :r="parentR" />
          <line
            v-if="mark.tail && mark.tail.variant !== 'far'"
            class="parent__tail"
            :class="{ 'facing--near': mark.tail.variant === 'near' }"
            :x1="mark.tail.from.x"
            :y1="mark.tail.from.y"
            :x2="mark.tail.to.x"
            :y2="mark.tail.to.y"
          />
          <text
            v-if="selectedParent === mark.parent.id"
            class="parent__label"
            :x="mark.label.x"
            :y="mark.label.y"
            :text-anchor="mark.anchor"
          >
            {{ mark.parent.name }}
            <tspan class="parent__label-shower" :x="mark.label.x" dy="1.2em">
              {{ mark.showerLabel }}
            </tspan>
          </text>
        </g>
      </svg>
    </div>

    <BodyReadout
      title="Shower parents"
      body-heading="Parent"
      :columns="COLUMNS"
      :rows="rows"
      storage-key="solestia.readoutColumns.meteors"
      :selected-id="selectedParent"
      @select="toggle"
    >
      <template #help>
        <p>
          Each row is a meteor-shower parent body. <strong>shower</strong> names the annual stream
          (or streams) linked to that orbit; Halley feeds both the η Aquariids and the Orionids.
        </p>
        <p>
          Orbits are drawn thicker than planet paths to suggest the debris trail. The whisker on
          each parent points anti-sunward and fades with heliocentric distance. Marks sit where the
          osculating ellipse approaches Earth’s path near 1 AU; parents that never reach 1 AU (such
          as 2003 EH1) mark their closest ecliptic node instead.
        </p>
        <p>
          Mercury, Earth, and Neptune are drawn for scale. Earth keeps its prime-meridian whisker;
          Mercury and Neptune do not. One smooth logarithmic scale spans the nearest perihelion and
          farthest aphelion across all of these planetary and shower-parent orbits.
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
      <template #head-orbit>
        <button
          type="button"
          class="th-toggle"
          :aria-label="
            orbitUnit === 'earth'
              ? 'Orbital period in Earth days and years. Click to lead with years.'
              : 'Orbital period in years. Click to show Earth days and years.'
          "
          @click="toggleOrbitUnit"
        >
          <span class="th-sym">P<sub>orb</sub></span>
          <span class="th-mode">{{ orbitUnit === 'earth' ? 'Earth d' : 'yr' }}</span>
        </button>
      </template>
    </BodyReadout>

    <div class="meteor-view__footnotes">
      <p class="meteor-view__note">
        Screen radius is a single logarithmic map fitted to the nearest perihelion and farthest
        aphelion of every displayed planet and shower parent. The same scale is used in both views.
        A faint ring marks 1 AU. Positions are interpolated from JPL Horizons state vectors.
        Anti-sun tails fade with distance; orbit marks sit near Earth’s path.
      </p>
      <p v-if="selectedNote" class="meteor-view__meridian">{{ selectedNote }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.meteor-view {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  width: 100%;
  min-width: 0;
}

.meteor-view__diagram {
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
}

.orbit--debris {
  stroke: color-mix(in srgb, $color-text-muted 55%, transparent);
  stroke-width: 0.42;
}

.orbit--planet {
  stroke: color-mix(in srgb, $color-text-muted 35%, transparent);
  stroke-width: 0.26;
}

.orbit-far .orbit {
  opacity: 0.65;
}

.parent-orbit.selected .orbit--debris {
  stroke: var(--accent);
  stroke-width: 0.55;
  opacity: 1;
}

.frame {
  fill: none;
  stroke: $color-border;
  stroke-width: 0.35;
}

.earth-au {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 28%, transparent);
  stroke-width: 0.3;
  stroke-dasharray: 0.9 1.1;
  pointer-events: none;
}

.axis {
  fill: $color-text-muted;
  font-size: 2.2px;
  text-anchor: middle;
  pointer-events: none;

  line {
    stroke: $color-text-muted;
    stroke-width: 0.35;
  }
}

.sun {
  cursor: pointer;

  circle {
    fill: #6c4907;
    stroke: color-mix(in srgb, #f5c56b 40%, $color-border);
    stroke-width: 0.25;
  }

  text {
    fill: color-mix(in srgb, #7a4e12 70%, $color-text);
    font-size: 3.2px;
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
}

.sun__facing,
.planet__facing,
.parent__tail {
  stroke: var(--facing-stroke, $color-text);
  stroke-width: 0.35;
  stroke-linecap: round;
  pointer-events: none;
}

.parent__tail {
  stroke: color-mix(in srgb, var(--body-color) 75%, white);
  stroke-width: 0.55;
  stroke-opacity: var(--tail-opacity, 1);
}

.facing--far {
  stroke-opacity: 0.45;
}

.facing--near {
  stroke-width: 0.45;
}

.planet,
.parent {
  cursor: pointer;
}

.planet__disc,
.parent__disc {
  fill: var(--body-color);
  stroke: color-mix(in srgb, var(--body-color) 55%, $color-border);
  stroke-width: 0.25;
}

.planet__peri,
.parent__peri {
  stroke: var(--body-color);
  stroke-width: 0.35;
  pointer-events: none;
}

.planet__symbol {
  fill: color-mix(in srgb, var(--body-color) 25%, $color-bg);
  font-size: 1.6px;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}

.parent__label {
  fill: $color-text;
  font-size: 2.4px;
  pointer-events: none;
}

.parent__label-shower {
  fill: $color-text-muted;
  font-size: 1.9px;
}

.parent.muted,
.crossings.muted,
.parent-orbit.muted {
  opacity: 0.25;
}

.parent.selected .parent__disc {
  stroke: var(--accent);
  stroke-width: 0.45;
}

.crossing {
  fill: var(--body-color);
  stroke: color-mix(in srgb, var(--body-color) 40%, $color-bg);
  stroke-width: 0.25;
  pointer-events: none;
}

.crossings.selected .crossing {
  stroke: var(--accent);
  stroke-width: 0.4;
}

.meteor-view__footnotes {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.meteor-view__note,
.meteor-view__meridian {
  margin: 0;
  font-size: 0.85rem;
  color: $color-text-muted;
  line-height: 1.35;
}

.meteor-view__meridian {
  color: $color-text;
}

.th-toggle {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.th-mode {
  font-size: 0.7em;
  color: $color-text-muted;
}

svg.live .parent__tail,
svg.live .planet__facing,
svg.live .sun__facing {
  transition:
    x1 0.4s linear,
    y1 0.4s linear,
    x2 0.4s linear,
    y2 0.4s linear,
    stroke-opacity 0.4s linear;
}
</style>
