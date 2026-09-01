<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ViewPlane } from '../data/planetSystems.ts'
import { primeMeridianLabel } from '../data/selectionNotes.ts'
import {
  formatDayClock,
  formatDeg,
  formatEcc,
  formatHeliocentricDistance,
  formatQuantity,
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
import {
  kuiperObjectOrbitPositions,
  type KuiperBeltSnapshot,
  type KuiperObjectState,
} from '../lib/kuiperEphemeris.ts'
import type { ReadoutColumn, ReadoutRow } from '../lib/readout.ts'
import BodyReadout from './BodyReadout.vue'

const props = defineProps<{
  snapshot: KuiperBeltSnapshot
  selectedObject?: string | null
  viewPlane?: ViewPlane
  live?: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

const cx = 50
const cy = 50
const frameR = 46
const orbitR = 42
const bodyR = 1.55
const sunR = 3.3
const facingGap = 0.2
const facingMin = 0.35
const facingMax = 1.2
/** The same whisker for the Sun, scaled to its larger disc. */
const sunFacingGap = 0.35
const sunFacingMin = 0.6
const sunFacingMax = 1.6
const viewBox = '-6 -6 112 112'
/**
 * orbitRadius is the semi-major axis on screen, not the aphelion distance: the
 * inset centers the ellipse rather than the Sun, so a is the reach from the
 * middle of the frame. The margin to `radius` leaves room for Sedna's disc and
 * facing whisker when it sits at either apse.
 */
const inset = { cx: 19, cy: 82, radius: 12, orbitRadius: 9.2, bodyR: 1.25, sunR: 0.8 }
const useEdge = computed(() => props.viewPlane === 'edge')
const mainObjects = computed(() => props.snapshot.objects.filter((object) => object.id !== 'sedna'))
const sedna = computed(() => props.snapshot.objects.find((object) => object.id === 'sedna'))

type Point = { x: number; y: number }
type ViewWhisker = { from: Point; to: Point; variant: 'flat' | 'near' | 'far' }

function whiskerFor(
  center: Point,
  facing: Facing,
  origin: number,
  radius: number,
  gap = facingGap,
  min = facingMin,
  max = facingMax,
): ViewWhisker | null {
  if (useEdge.value) {
    const edge = edgeOnWhisker(center, radius, facing, origin, min, max)
    return edge && { from: edge.from, to: edge.to, variant: edge.far ? 'far' : 'near' }
  }
  const offset = facing.longitude - origin
  const reach = radius + gap
  return {
    from: orbitPoint(center.x, center.y, reach, offset),
    to: orbitPoint(center.x, center.y, reach + min + (max - min) * facing.inPlane, offset),
    variant: 'flat',
  }
}

const mainOuterAu = computed(() =>
  Math.max(...mainObjects.value.map((object) => object.a * (1 + object.e))),
)
const mainScale = (distance: number) => (distance * orbitR) / mainOuterAu.value
const sednaScale = (distance: number) => {
  const object = sedna.value
  return object ? (distance * inset.orbitRadius) / object.a : 0
}

const beltField = computed(() => {
  const inner = mainScale(30)
  const outer = mainScale(50)
  return { inner, radius: (inner + outer) / 2, width: outer - inner }
})

function projectedMark(
  object: KuiperObjectState,
  centerX: number,
  centerY: number,
  scale: (distance: number) => number,
  radius: number,
) {
  const project = useEdge.value ? projectEdgeOn : projectEclipticTopDown
  const origin = props.snapshot.earthPerihelionLongitude
  const projected = project(centerX, centerY, object.position, origin, scale)
  const samples = kuiperObjectOrbitPositions(object.id, props.snapshot.at)
  const points = samples.map((sample) => project(centerX, centerY, sample, origin, scale))
  const { far, near } = splitClosedByDepth(points, useEdge.value ? 'positive' : 'negative')
  const peri = points[0] ?? projected
  const periOffset = { x: peri.x - centerX, y: peri.y - centerY }
  const periLength = Math.hypot(periOffset.x, periOffset.y)
  const periInner =
    periLength > 1e-6
      ? {
          x: peri.x - (periOffset.x / periLength) * 1.2,
          y: peri.y - (periOffset.y / periLength) * 1.2,
        }
      : peri
  const body = { x: projected.x, y: projected.y }
  const offset = { x: body.x - centerX, y: body.y - centerY }
  const length = Math.hypot(offset.x, offset.y)
  const label =
    length > 1e-6
      ? { x: body.x + (offset.x / length) * 3, y: body.y + (offset.y / length) * 3 }
      : { x: body.x, y: body.y - 3 }
  return {
    object,
    body,
    depth: projected.depth,
    far,
    near,
    points,
    peri,
    periInner,
    whisker: whiskerFor(body, object.facing, origin, radius),
    label,
    anchor: Math.abs(label.x - centerX) < 3 ? 'middle' : label.x < centerX ? 'end' : 'start',
  }
}

const projectedMarks = computed(() =>
  mainObjects.value.map((object) => projectedMark(object, cx, cy, mainScale, bodyR)),
)
const projectedBodies = computed(() =>
  [...projectedMarks.value].sort((a, b) => (useEdge.value ? b.depth - a.depth : a.depth - b.depth)),
)
/**
 * Sedna also rides the main scale, clipped to the frame. Its perihelion of
 * 76 AU sits inside the belt while its aphelion is ten times past the frame, so
 * it drifts into view as it falls inward — crossing the frame in 1951 on the
 * way to the 2076 perihelion — rather than distorting a scale everything shares.
 */
const sednaMainMark = computed(() => {
  const object = sedna.value
  return object ? projectedMark(object, cx, cy, mainScale, bodyR) : null
})

/**
 * Centering the ellipse instead of the Sun nearly doubles it on screen: the Sun
 * sits at a focus, so a Sun-centered inset spends most of its radius on the
 * empty space opposite perihelion. Orthographic projection is affine, so the
 * ellipse center is just the midpoint of the projected apsides, and shifting
 * the Sun there by the same amount recenters the whole path.
 */
const sednaInset = computed(() => {
  const object = sedna.value
  if (!object) return null
  const centered = projectedMark(object, inset.cx, inset.cy, sednaScale, inset.bodyR)
  const perihelion = centered.points[0]
  const aphelion = centered.points[centered.points.length >> 1]
  const sun = {
    x: 2 * inset.cx - (perihelion.x + aphelion.x) / 2,
    y: 2 * inset.cy - (aphelion.y + perihelion.y) / 2,
  }
  return { sun, mark: projectedMark(object, sun.x, sun.y, sednaScale, inset.bodyR) }
})

/**
 * Where the Carrington prime meridian points. The Sun's axis is tilted only 7°
 * from ecliptic north, so edge-on this whisker stays close to the horizontal
 * while it sweeps in and out across the disc.
 */
const sunFacing = computed(() =>
  whiskerFor(
    { x: cx, y: cy },
    props.snapshot.sun.facing,
    props.snapshot.earthPerihelionLongitude,
    sunR,
    sunFacingGap,
    sunFacingMin,
    sunFacingMax,
  ),
)

/**
 * Neptune sits at the inner edge of the belt rather than out at the frame: at
 * 30 AU it is inside or crossing every orbit here, so a marker on the rim would
 * put the body that shapes these orbits outside all of them.
 */
const projectedNeptune = computed(() => {
  const project = useEdge.value ? projectEdgeOn : projectEclipticTopDown
  const ring = beltField.value.inner
  const projected = project(
    cx,
    cy,
    props.snapshot.neptunePosition,
    props.snapshot.earthPerihelionLongitude,
    () => ring,
  )
  const dx = projected.x - cx
  const dy = projected.y - cy
  const length = Math.hypot(dx, dy) || 1
  const at = (radius: number) => ({
    x: cx + (dx / length) * radius,
    y: cy + (dy / length) * radius,
  })
  /* The inner end clears the Sun's whisker, which reaches sunR + 1.95 at most. */
  return { inner: at(sunR + 2.2), edge: at(ring - 2.6), label: at(ring) }
})

type RotationKind = 'sidereal' | 'solar'
const rotationKind = ref<RotationKind>('sidereal')
const distanceUnit = ref<DistanceUnit>('AU')
const columns: ReadoutColumn[] = [
  { id: 'diameter', heading: 'D', label: 'Effective diameter (D)', onByDefault: true },
  { id: 'a', heading: 'a', label: 'Semi-major axis (a)', onByDefault: true },
  { id: 'e', heading: 'e', label: 'Eccentricity (e)', onByDefault: true },
  { id: 'rotation', heading: 'P_rot', label: 'Rotation period', onByDefault: true },
  { id: 'orbit', heading: 'P_orb', label: 'Orbital period', onByDefault: true },
  { id: 'r', heading: 'r', label: 'Current distance (r)', onByDefault: true },
  { id: 'longitude', heading: 'λ', label: 'Longitude (λ)', onByDefault: false },
  { id: 'inclination', heading: 'i', label: 'Inclination (i)', onByDefault: false },
  { id: 'q', heading: 'q', label: 'Perihelion (q)', onByDefault: false },
  { id: 'Q', heading: 'Q', label: 'Aphelion (Q)', onByDefault: false },
  { id: 'day', heading: 'rot', label: 'Rotation progress', onByDefault: false },
  { id: 'w0', heading: 'W₀', label: 'Prime meridian (W₀)', onByDefault: false },
]

const rows = computed((): ReadoutRow[] =>
  props.snapshot.objects.map((object) => {
    const rotationDays =
      rotationKind.value === 'sidereal' ? object.siderealRotationDays : object.solarDayDays
    const meridian = primeMeridianLabel(object.id, 'iau')
    return {
      id: object.id,
      name: object.name,
      color: object.color,
      detail: `(${object.number})`,
      cells: {
        diameter: { primary: formatQuantity(object.diameterKm, 'km') },
        a: formatHeliocentricDistance(object.a, distanceUnit.value),
        e: { primary: formatEcc(object.e) },
        rotation: {
          primary: formatQuantity(rotationDays * HOURS_PER_DAY, 'h'),
          secondary: formatQuantity(rotationDays, 'd'),
          title:
            object.poleSource === 'iau'
              ? 'IAU cartographic rotation'
              : 'Measured period; orbit-normal pole and J2000 phase assumed',
        },
        orbit: {
          primary: formatQuantity(object.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
          secondary: formatQuantity(object.siderealOrbitDays, 'd'),
        },
        r: formatHeliocentricDistance(object.distanceAu, distanceUnit.value),
        longitude: { primary: formatDeg(object.longitude) },
        inclination: { primary: formatDeg(object.inclination) },
        q: formatHeliocentricDistance(object.a * (1 - object.e), distanceUnit.value),
        Q: formatHeliocentricDistance(object.a * (1 + object.e), distanceUnit.value),
        day: {
          primary: `${(object.dayFraction * 100).toFixed(1)}%`,
          secondary: formatDayClock(object.dayFraction),
        },
        w0: object.primeMeridianDefined
          ? { primary: formatDeg(object.w0), title: meridian }
          : { primary: 'none', title: meridian },
      },
    }
  }),
)
</script>

<template>
  <div class="kuiper-view">
    <div class="kuiper-view__diagram">
      <svg
        :viewBox="viewBox"
        role="img"
        :aria-label="`Kuiper dwarf planets viewed ${useEdge ? 'edge-on' : 'from ecliptic north'}`"
        :class="{ live }"
      >
        <title>Kuiper dwarf planets and candidates</title>
        <desc>
          Nine bodies share one proportional scale, with Sedna clipped to the frame so it appears
          only while its distance fits. A labeled inset carries Sedna’s whole orbit at its own
          scale. Neptune’s symbol marks its current direction, drawn at the belt’s 30 AU inner edge
          because it orbits inside every body shown here. The whisker on the Sun points where its
          Carrington prime meridian faces; edge-on it stands on the surface, painting across the
          disc while the meridian faces the camera and hidden behind it while it faces away.
        </desc>
        <defs>
          <clipPath id="kuiper-frame">
            <circle :cx="cx" :cy="cy" :r="frameR" />
          </clipPath>
        </defs>
        <circle class="frame" :cx="cx" :cy="cy" :r="frameR" />
        <circle
          v-if="!useEdge"
          class="belt-field"
          :cx="cx"
          :cy="cy"
          :r="beltField.radius"
          :stroke-width="beltField.width"
        />
        <line v-else class="ecliptic" :x1="cx - frameR" :x2="cx + frameR" :y1="cy" :y2="cy" />

        <g class="neptune-mark" aria-hidden="true">
          <title>Neptune</title>
          <line
            :x1="projectedNeptune.inner.x"
            :y1="projectedNeptune.inner.y"
            :x2="projectedNeptune.edge.x"
            :y2="projectedNeptune.edge.y"
          />
          <text :x="projectedNeptune.label.x" :y="projectedNeptune.label.y">♆</text>
        </g>

        <g
          v-for="mark in projectedMarks"
          :key="`far-${mark.object.id}`"
          class="orbit-far"
          :class="{ selected: selectedObject === mark.object.id }"
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
          :key="`near-${mark.object.id}`"
          class="orbit-near"
          :class="{ selected: selectedObject === mark.object.id }"
        >
          <path v-for="(d, index) in mark.near" :key="index" class="orbit" :d="d" />
        </g>

        <g
          v-for="mark in projectedBodies"
          :key="mark.object.id"
          class="object"
          :class="{
            selected: selectedObject === mark.object.id,
            muted: selectedObject && selectedObject !== mark.object.id,
          }"
          :style="{ '--body-color': mark.object.color }"
          @click="emit('select', mark.object.id)"
        >
          <title>
            {{ mark.object.name }} — {{ formatDeg(mark.object.longitude) }} longitude,
            {{ formatQuantity(mark.object.distanceAu, 'AU') }} from the Sun
          </title>
          <line
            class="object__peri"
            :x1="mark.periInner.x"
            :y1="mark.periInner.y"
            :x2="mark.peri.x"
            :y2="mark.peri.y"
          />
          <line
            v-if="mark.whisker"
            class="object__facing"
            :class="{ 'facing--far': mark.whisker.variant === 'far' }"
            :x1="mark.whisker.from.x"
            :y1="mark.whisker.from.y"
            :x2="mark.whisker.to.x"
            :y2="mark.whisker.to.y"
          />
          <circle :cx="mark.body.x" :cy="mark.body.y" :r="bodyR" />
          <text :x="mark.body.x" :y="mark.body.y">
            {{ mark.object.symbol ?? mark.object.number }}
          </text>
          <text
            v-if="selectedObject === mark.object.id"
            class="object__label"
            :x="mark.label.x"
            :y="mark.label.y"
            :text-anchor="mark.anchor"
          >
            {{ mark.object.name }}
          </text>
        </g>

        <g v-if="sednaMainMark" class="sedna-main" clip-path="url(#kuiper-frame)">
          <g class="orbit-far" :class="{ selected: selectedObject === 'sedna' }">
            <path
              v-for="(d, index) in sednaMainMark.far"
              :key="`mf-${index}`"
              class="orbit"
              :d="d"
            />
          </g>
          <g class="orbit-near" :class="{ selected: selectedObject === 'sedna' }">
            <path
              v-for="(d, index) in sednaMainMark.near"
              :key="`mn-${index}`"
              class="orbit"
              :d="d"
            />
          </g>
          <g
            class="object"
            :class="{
              selected: selectedObject === 'sedna',
              muted: selectedObject && selectedObject !== 'sedna',
            }"
            :style="{ '--body-color': sednaMainMark.object.color }"
            @click="emit('select', 'sedna')"
          >
            <title>
              {{ sednaMainMark.object.name }} —
              {{ formatDeg(sednaMainMark.object.longitude) }} longitude,
              {{ formatQuantity(sednaMainMark.object.distanceAu, 'AU') }} from the Sun
            </title>
            <line
              class="object__peri"
              :x1="sednaMainMark.periInner.x"
              :y1="sednaMainMark.periInner.y"
              :x2="sednaMainMark.peri.x"
              :y2="sednaMainMark.peri.y"
            />
            <line
              v-if="sednaMainMark.whisker"
              class="object__facing"
              :class="{ 'facing--far': sednaMainMark.whisker.variant === 'far' }"
              :x1="sednaMainMark.whisker.from.x"
              :y1="sednaMainMark.whisker.from.y"
              :x2="sednaMainMark.whisker.to.x"
              :y2="sednaMainMark.whisker.to.y"
            />
            <circle :cx="sednaMainMark.body.x" :cy="sednaMainMark.body.y" :r="bodyR" />
            <text :x="sednaMainMark.body.x" :y="sednaMainMark.body.y">
              {{ sednaMainMark.object.symbol ?? sednaMainMark.object.number }}
            </text>
            <text
              v-if="selectedObject === 'sedna'"
              class="object__label"
              :x="sednaMainMark.label.x"
              :y="sednaMainMark.label.y"
              :text-anchor="sednaMainMark.anchor"
            >
              {{ sednaMainMark.object.name }}
            </text>
          </g>
        </g>

        <g v-if="sednaInset" class="sedna-inset">
          <circle class="sedna-inset__frame" :cx="inset.cx" :cy="inset.cy" :r="inset.radius" />
          <text :x="inset.cx" :y="inset.cy - inset.radius - 1.2">Sedna · whole orbit</text>
          <path
            v-for="(d, index) in sednaInset.mark.far"
            :key="`sf-${index}`"
            class="orbit"
            :d="d"
          />
          <path
            v-for="(d, index) in sednaInset.mark.near"
            :key="`sn-${index}`"
            class="orbit"
            :d="d"
          />
          <g
            class="object"
            :class="{ selected: selectedObject === 'sedna' }"
            :style="{ '--body-color': sednaInset.mark.object.color }"
            @click="emit('select', 'sedna')"
          >
            <line
              class="object__peri"
              :x1="sednaInset.mark.periInner.x"
              :y1="sednaInset.mark.periInner.y"
              :x2="sednaInset.mark.peri.x"
              :y2="sednaInset.mark.peri.y"
            />
            <line
              v-if="sednaInset.mark.whisker"
              class="object__facing"
              :class="{ 'facing--far': sednaInset.mark.whisker.variant === 'far' }"
              :x1="sednaInset.mark.whisker.from.x"
              :y1="sednaInset.mark.whisker.from.y"
              :x2="sednaInset.mark.whisker.to.x"
              :y2="sednaInset.mark.whisker.to.y"
            />
            <circle :cx="sednaInset.mark.body.x" :cy="sednaInset.mark.body.y" :r="inset.bodyR" />
            <text :x="sednaInset.mark.body.x" :y="sednaInset.mark.body.y">90377</text>
          </g>
          <circle
            class="sedna-inset__sun"
            :cx="sednaInset.sun.x"
            :cy="sednaInset.sun.y"
            :r="inset.sunR"
          />
          <text :x="inset.cx" :y="inset.cy + inset.radius + 2">
            {{ Math.round(sednaInset.mark.object.a * (1 - sednaInset.mark.object.e)) }}–{{
              Math.round(sednaInset.mark.object.a * (1 + sednaInset.mark.object.e))
            }}
            AU
          </text>
        </g>
      </svg>
    </div>

    <BodyReadout
      title="Kuiper data"
      body-heading="Object"
      :columns="columns"
      :rows="rows"
      storage-key="solestia.readoutColumns.kuiper"
      :selected-id="selectedObject"
      @select="emit('select', $event)"
    >
      <template #head-a>
        <button type="button" @click="distanceUnit = distanceUnit === 'AU' ? 'km' : 'AU'">a</button>
      </template>
      <template #head-rotation>
        <button
          type="button"
          @click="rotationKind = rotationKind === 'sidereal' ? 'solar' : 'sidereal'"
        >
          P<sub>{{ rotationKind === 'sidereal' ? 'rot' : 'sol' }}</sub>
        </button>
      </template>
      <template #help>
        <p>
          <strong>Distances here are measured from the solar-system barycenter, not the Sun</strong>
          — so <strong>r</strong>, <strong>a</strong>, <strong>q</strong> and <strong>Q</strong> all
          refer to that point rather than to the disc drawn at the center. The two differ by at most
          about 0.01 AU, which is under a part in three thousand at these distances and far too
          small to see, but it is the frame the numbers are in. The asteroid belt keeps Sun-centered
          distances, because bodies there really do orbit the Sun with Jupiter outside them.
        </p>
        <p>
          The barycenter is the right reference out here for a concrete reason. Every planet is
          interior to these orbits, so Jupiter pulls the Sun and a Kuiper object by nearly the same
          amount. Measured from the Sun, that shared motion has nowhere to go and instead shows up
          as a false 11.9-year swing in each derived orbit — worst for Quaoar, whose small
          eccentricity of 0.035 magnified it into 23 degrees of perihelion rotation. Measured from
          the barycenter the same figure is 0.018 degrees.
        </p>
        <p>
          Distances and orbit traces use a proportional AU scale, so the eccentricity is not
          compressed. The shaded annulus is the classical 30–50 AU Kuiper belt; scattered objects
          can travel well outside it.
        </p>
        <p>
          Sedna is detached, with a perihelion of 76 AU and an aphelion past 1,000 AU, so it is
          drawn twice. On the main scale it is clipped to the frame, which means it is simply absent
          for most of history and slides into view as it falls inward — it crossed the frame edge in
          1951, passed inside the outermost orbit here in 1974, and reaches perihelion near 2076.
          The inset carries the whole ellipse at its own scale, centered on the ellipse rather than
          on the Sun so the path is not crowded into one side; the Sun is the small filled disc at
          the near focus. Both are the same Horizons model behind every other body.
        </p>
        <p>
          Positions interpolate JPL Horizons vectors. Pluto uses the IAU cartographic frame. For the
          other bodies, rotation periods are measured but the clocks use an explicitly assumed
          prograde orbit-normal pole and arbitrary J2000 phase because no standard prime meridian
          exists. The whisker on the Sun points where the Carrington prime meridian faces, on a
          25.38-day rate that is a convention rather than a rigid period, since the photosphere
          spins faster at the equator than near the poles.
        </p>
      </template>
    </BodyReadout>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.kuiper-view {
  min-width: 0;
}

.kuiper-view__diagram {
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
  stroke: var(--border);
  stroke-width: 0.35;
}

.belt-field {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 8%, transparent);
}

.ecliptic {
  stroke: color-mix(in srgb, $color-text-muted 35%, transparent);
  stroke-width: 0.35;
}

.orbit {
  fill: none;
  stroke: color-mix(in srgb, $color-text-muted 33%, transparent);
  stroke-width: 0.28;
}

.orbit-far .orbit {
  stroke-dasharray: 0.8 0.8;
  opacity: 0.55;
}

.orbit-far.selected .orbit,
.orbit-near.selected .orbit {
  stroke: var(--accent);
  stroke-width: 0.55;
  opacity: 1;
}

.sun circle {
  fill: color-mix(in srgb, var(--accent) 28%, var(--bg-raised));
  stroke: var(--accent);
  stroke-width: 0.45;
}

.sun text,
.neptune-mark text,
.object text {
  dominant-baseline: central;
  text-anchor: middle;
  pointer-events: none;
}

.sun text {
  fill: $color-text;
  font-size: 4.5px;
}

.sun__facing {
  stroke: var(--accent);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
  pointer-events: none;
}

.neptune-mark {
  fill: $color-text-muted;
  font-size: 4px;
}

.neptune-mark line {
  stroke: $color-text-muted;
  stroke-width: 0.35;
  stroke-dasharray: 1 1.2;
}

.object {
  cursor: pointer;
  transition: opacity 160ms ease;
}

.object.muted {
  opacity: 0.3;
}

.object circle {
  fill: var(--background);
  stroke: var(--body-color);
  stroke-width: 0.65;
}

.object.selected circle {
  fill: color-mix(in srgb, var(--body-color) 28%, var(--background));
  stroke-width: 1;
}

.object text {
  fill: var(--body-color);
  font-family: $font-mono;
  font-size: 1.55px;
}

.object__label {
  font-size: 2.2px !important;
}

.object__peri,
.object__facing {
  stroke: var(--body-color);
  stroke-width: 0.4;
}

.facing--far {
  stroke-dasharray: 0.5 0.55;
  opacity: 0.65;
}

/**
 * Edge-on a whisker stands on the body's surface, so it paints across the disc
 * while the meridian faces the camera. Darkened to read against the fill.
 */
.sun__facing.facing--near {
  stroke: color-mix(in srgb, var(--accent) 45%, white);
}

.sedna-inset {
  font-family: $font-mono;
  font-size: 1.45px;
  text-anchor: middle;
  fill: $color-text-muted;
}

/* Opaque, so the inset reads as its own frame over the main diagram. */
.sedna-inset__frame {
  fill: var(--bg-raised);
  stroke: var(--border);
  stroke-width: 0.35;
}

.sedna-inset .orbit {
  stroke: color-mix(in srgb, #a84d3e 65%, transparent);
  stroke-width: 0.3;
}

/* Drawn last and filled: Sedna is near perihelion, so it sits over the focus. */
.sedna-inset__sun {
  fill: var(--accent);
  stroke: color-mix(in srgb, $color-text 45%, transparent);
  stroke-width: 0.2;
}

:deep(th button) {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .object {
    transition: none;
  }
}
</style>
