<script setup lang="ts">
import { computed } from 'vue'
import type { EarthLocalSky } from '../lib/earthLocalSky.ts'

const props = defineProps<{
  sky: EarthLocalSky
}>()

const cx = 50
const cy = 50
const rimRadius = 45.5
const rimWidth = 5
const faceRadius = 36
const sectorRadius = 30
const sunHandRadius = 29
const moonHandRadius = sunHandRadius * 0.65
/** Mid-range phase disk; scaled by lunar distance toward perigee/apogee. */
const MOON_PHASE_RADIUS_MID = 2.8
const MOON_PHASE_RADIUS_SPAN = 0.7
const EMBEDDED_RING = 40
const SUN_POLAR_RADIUS = EMBEDDED_RING - 2.2
const MOON_POLAR_RADIUS = EMBEDDED_RING + 2.2
const POLAR_DOT_RADIUS = 1.15
const rimCircumference = 2 * Math.PI * rimRadius
const EMBEDDED_BLUE = '#4292c6'
const SUN_TICK = '#e6b422'
const MOON_TICK = '#b4ae9e'
const SOLSTICE_FILL = '#c9a227'
const EQUINOX_FILL = '#8a9aab'
/** Half-diagonals of the season diamonds on the year rim. */
const SEASON_RADIAL = 2.1
const SEASON_TANGENT = 1.35

const YEAR_DIVISIONS = 12
const DAY_DIVISIONS = 24

/** Clockwise from the top. */
function dialPoint(radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * Math.PI * 2
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  }
}

function tickMarks(count: number, inner: number, outer: number, majorEvery: number) {
  return Array.from({ length: count }, (_, i) => {
    const fraction = i / count
    const major = i % majorEvery === 0
    const from = dialPoint(major ? inner - 2 : inner, fraction)
    const to = dialPoint(outer, fraction)
    return {
      key: i,
      major,
      cardinal: i % (count / 4) === 0,
      fraction,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    }
  })
}

const yearTicks = tickMarks(
  YEAR_DIVISIONS,
  rimRadius - rimWidth / 2 - 0.5,
  rimRadius + rimWidth / 2 + 0.5,
  3,
)
const dayTicks = tickMarks(DAY_DIVISIONS, faceRadius - 3, faceRadius, 6)
const faceDayTicks = dayTicks.filter((tick) => !tick.cardinal)

/** Cardinals extend to the hub; painted in the embedded Earth blue. */
const cardinalTicks = [0, 0.25, 0.5, 0.75].map((fraction, key) => {
  const tip = dialPoint(faceRadius, fraction)
  return { key, x1: tip.x, y1: tip.y, x2: cx, y2: cy }
})

const yearOffset = computed(() => rimCircumference * (1 - props.sky.yearFraction))
const yearHead = computed(() => dialPoint(rimRadius, props.sky.yearFraction))
const sunHand = computed(() => dialPoint(sunHandRadius, props.sky.dayFraction))
const moonHand = computed(() => dialPoint(moonHandRadius, props.sky.moonFraction))

/** Short radial diamond centered on the year rim. */
function seasonDiamondPath(fraction: number): string {
  const angle = fraction * Math.PI * 2
  const rx = Math.sin(angle)
  const ry = -Math.cos(angle)
  const tx = Math.cos(angle)
  const ty = Math.sin(angle)
  const mid = dialPoint(rimRadius, fraction)
  const outer = { x: mid.x + rx * SEASON_RADIAL, y: mid.y + ry * SEASON_RADIAL }
  const inner = { x: mid.x - rx * SEASON_RADIAL, y: mid.y - ry * SEASON_RADIAL }
  const left = { x: mid.x - tx * SEASON_TANGENT, y: mid.y - ty * SEASON_TANGENT }
  const right = { x: mid.x + tx * SEASON_TANGENT, y: mid.y + ty * SEASON_TANGENT }
  return `M ${outer.x} ${outer.y} L ${right.x} ${right.y} L ${inner.x} ${inner.y} L ${left.x} ${left.y} Z`
}

const seasonDiamonds = computed(() =>
  props.sky.seasonMarks.map((mark) => ({
    key: mark.name,
    kind: mark.kind,
    d: seasonDiamondPath(mark.yearFraction),
    fill: mark.kind === 'solstice' ? SOLSTICE_FILL : EQUINOX_FILL,
  })),
)

/** Align local +x (sunward bright limb) with the sun-hand direction. */
const moonPhaseRotate = computed(() => {
  const θ = props.sky.dayFraction * 360
  return θ - 90
})

/**
 * Lit moon region in local coords: +x faces the Sun. `illuminated` 0 = new, 1 = full.
 */
function sunwardLitPath(r: number, illuminated: number): string {
  const f = Math.min(1, Math.max(0, illuminated))
  if (f <= 0.001) return ''
  if (f >= 0.999) {
    return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0`
  }
  const width = Math.abs(1 - 2 * f) * r
  if (Math.abs(width) < 1e-6) {
    return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`
  }
  if (f < 0.5) {
    return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${width} ${r} 0 0 0 0 ${-r} Z`
  }
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${width} ${r} 0 0 1 0 ${-r} Z`
}

const moonPhaseRadius = computed(() => {
  // Perigee (1) → larger disk; apogee (0) → smaller.
  return (
    MOON_PHASE_RADIUS_MID -
    MOON_PHASE_RADIUS_SPAN / 2 +
    props.sky.moonPerigee * MOON_PHASE_RADIUS_SPAN
  )
})

/** Inverse of size: ~0.25 at perigee, ~0.75 at apogee. */
const moonRingStroke = computed(() => 0.75 - 0.5 * props.sky.moonPerigee)

const moonLit = computed(() => sunwardLitPath(moonPhaseRadius.value, props.sky.illuminated))

const polarMarkers = computed(() => {
  const markers: { key: string; color: string; x: number; y: number; r: number }[] = []
  if (props.sky.sunPolar) {
    const fraction = props.sky.sunPolar === 'overhead' ? 0.5 : 0
    const point = dialPoint(SUN_POLAR_RADIUS, fraction)
    markers.push({ key: 'sun-polar', color: SUN_TICK, x: point.x, y: point.y, r: POLAR_DOT_RADIUS })
  }
  if (props.sky.moonPolar) {
    const fraction = props.sky.moonPolar === 'overhead' ? 0.5 : 0
    const point = dialPoint(MOON_POLAR_RADIUS, fraction)
    markers.push({
      key: 'moon-polar',
      color: MOON_TICK,
      x: point.x,
      y: point.y,
      r: POLAR_DOT_RADIUS,
    })
  }
  return markers
})

const crossingMarks = computed(() => {
  const marks: {
    key: string
    color: string
    x1: number
    y1: number
    x2: number
    y2: number
  }[] = []
  for (const crossing of props.sky.sunCrossings) {
    const inner = dialPoint(faceRadius - 4.5, crossing.fraction)
    const outer = dialPoint(faceRadius + 1.5, crossing.fraction)
    marks.push({
      key: `sun-${crossing.kind}`,
      color: SUN_TICK,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    })
  }
  for (const crossing of props.sky.moonCrossings) {
    const inner = dialPoint(faceRadius - 3.5, crossing.fraction)
    const outer = dialPoint(faceRadius + 2.5, crossing.fraction)
    marks.push({
      key: `moon-${crossing.kind}`,
      color: MOON_TICK,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    })
  }
  return marks
})

const daySector = computed(() => {
  const fraction = Math.min(props.sky.dayFraction, 0.9999)
  if (fraction <= 0.0001) return ''
  const start = dialPoint(sectorRadius, 0)
  const end = dialPoint(sectorRadius, fraction)
  const largeArc = fraction > 0.5 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${sectorRadius} ${sectorRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
})

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

function localTime(fraction: number): string {
  const totalMinutes = Math.round(fraction * 24 * 60)
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const label = computed(() => {
  const sky = props.sky
  const parts = [`Earth local sky — ${percent(sky.yearFraction)} through its year since perihelion`]
  if (sky.solsPerYear >= 2) {
    const total = Math.round(sky.solsPerYear)
    const day = Math.min(Math.floor(sky.yearFraction * sky.solsPerYear) + 1, total)
    parts.push(`solar day ${day.toLocaleString()} of ${total.toLocaleString()}`)
  }
  const sunLat = (sky.subsolarLatitude * 180) / Math.PI
  const moonLat = (sky.sublunarLatitude * 180) / Math.PI
  parts.push(
    `local solar time ${localTime(sky.dayFraction)}`,
    `Sun overhead at ${Math.abs(sunLat).toFixed(1)}° ${sunLat >= 0 ? 'north' : 'south'}`,
    `Moon hour ${localTime(sky.moonFraction)}`,
    `Moon ${Math.abs(moonLat).toFixed(1)}° ${moonLat >= 0 ? 'N' : 'S'}`,
    `illumination ${(sky.illuminated * 100).toFixed(0)}%`,
    `Moon distance ${percent(sky.moonPerigee)} toward perigee`,
  )
  if (sky.sunPolar) parts.push(`Sun ${sky.sunPolar}`)
  if (sky.moonPolar) parts.push(`Moon ${sky.moonPolar}`)
  if (sky.seasonMarks.length) {
    parts.push(
      `seasons ${sky.seasonMarks.map((m) => `${m.name}@${percent(m.yearFraction)}`).join(', ')}`,
    )
  }
  if (sky.inEclipseSeason) parts.push('eclipse season')
  return parts.join(' · ')
})
</script>

<template>
  <svg
    class="clock"
    viewBox="0 0 100 100"
    role="img"
    :aria-label="label"
    :style="{ '--dial-body': sky.color }"
  >
    <title>{{ label }}</title>

    <circle class="clock__edge" :cx="cx" :cy="cy" :r="rimRadius + rimWidth / 2 + 2" />
    <circle class="clock__rim-track" :cx="cx" :cy="cy" :r="rimRadius" :stroke-width="rimWidth" />
    <circle
      class="clock__rim-fill"
      :cx="cx"
      :cy="cy"
      :r="rimRadius"
      :stroke-width="rimWidth"
      :stroke-dasharray="rimCircumference"
      :stroke-dashoffset="yearOffset"
      :transform="`rotate(-90 ${cx} ${cy})`"
    />
    <line
      v-for="tick in yearTicks"
      :key="`year-${tick.key}`"
      class="clock__rim-notch"
      :class="{ 'clock__rim-notch--major': tick.major }"
      :x1="tick.x1"
      :y1="tick.y1"
      :x2="tick.x2"
      :y2="tick.y2"
    />
    <path
      v-for="mark in seasonDiamonds"
      :key="mark.key"
      class="clock__season"
      :class="mark.kind === 'solstice' ? 'clock__season--solstice' : 'clock__season--equinox'"
      :d="mark.d"
      :fill="mark.fill"
    />
    <circle class="clock__year-head" :cx="yearHead.x" :cy="yearHead.y" r="2.4" />

    <circle class="clock__face" :cx="cx" :cy="cy" :r="faceRadius" />
    <line
      v-for="tick in faceDayTicks"
      :key="`day-${tick.key}`"
      class="clock__day-tick"
      :class="{ 'clock__day-tick--major': tick.major }"
      :x1="tick.x1"
      :y1="tick.y1"
      :x2="tick.x2"
      :y2="tick.y2"
    />
    <circle
      class="clock__embedded-ring"
      :cx="cx"
      :cy="cy"
      :r="EMBEDDED_RING"
      fill="none"
      :stroke="EMBEDDED_BLUE"
      stroke-width="1.5"
    />
    <circle
      v-for="marker in polarMarkers"
      :key="marker.key"
      class="clock__polar-dot"
      :cx="marker.x"
      :cy="marker.y"
      :r="marker.r"
      :fill="marker.color"
    />
    <line
      v-for="tick in cardinalTicks"
      :key="`cardinal-${tick.key}`"
      class="clock__cardinal"
      :stroke="EMBEDDED_BLUE"
      :x1="tick.x1"
      :y1="tick.y1"
      :x2="tick.x2"
      :y2="tick.y2"
    />
    <line
      v-for="mark in crossingMarks"
      :key="mark.key"
      class="clock__crossing"
      :stroke="mark.color"
      :x1="mark.x1"
      :y1="mark.y1"
      :x2="mark.x2"
      :y2="mark.y2"
    />
    <path v-if="daySector" class="clock__day-sector" :d="daySector" />
    <line class="clock__midnight" :x1="cx" :y1="cy" :x2="cx" :y2="cy - sectorRadius" />
    <line class="clock__day-hand" :x1="cx" :y1="cy" :x2="sunHand.x" :y2="sunHand.y" />
    <line class="clock__moon-hand" :x1="cx" :y1="cy" :x2="moonHand.x" :y2="moonHand.y" />
    <g
      class="clock__moon-phase"
      :transform="`translate(${moonHand.x} ${moonHand.y}) rotate(${moonPhaseRotate})`"
    >
      <circle class="clock__moon-disk" :cx="0" :cy="0" :r="moonPhaseRadius" />
      <path v-if="moonLit" class="clock__moon-lit" :d="moonLit" />
    </g>
    <circle
      class="clock__moon-ring"
      :cx="moonHand.x"
      :cy="moonHand.y"
      :r="moonPhaseRadius"
      fill="none"
      :stroke-width="moonRingStroke"
    />
    <circle
      class="clock__hub"
      :class="{ 'clock__hub--eclipse': sky.inEclipseSeason }"
      :cx="cx"
      :cy="cy"
      r="2.2"
    />
  </svg>
</template>

<style scoped lang="scss">
.clock {
  --dial-accent: var(--dial-body);
  --dial-track: color-mix(in srgb, var(--dial-body) 20%, transparent);
  --dial-face: color-mix(in srgb, var(--dial-body) 7%, var(--bg-raised));

  display: block;
  width: 100%;
  height: auto;
}

@supports (color: #{'oklch(from red l c h)'}) {
  .clock {
    --dial-accent: #{'oklch(from var(--dial-body) clamp(0.62, calc(l + 0.1), 0.9) calc(c * 1.4 + 0.02) calc(h + 22))'};
  }
}

.clock__edge {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.4;
}

.clock__rim-track {
  fill: none;
  stroke: var(--dial-track);
}

.clock__rim-fill {
  fill: none;
  stroke: var(--dial-body);
  stroke-linecap: butt;
}

.clock__rim-notch {
  stroke: var(--bg);
  stroke-width: 0.7;
}

.clock__rim-notch--major {
  stroke-width: 1.4;
}

.clock__season {
  stroke: var(--bg);
  stroke-width: 0.45;
}

.clock__year-head {
  fill: var(--dial-accent);
  stroke: var(--bg);
  stroke-width: 0.6;
}

.clock__face {
  fill: var(--dial-face);
  stroke: var(--border);
  stroke-width: 0.4;
}

.clock__day-tick {
  stroke: color-mix(in srgb, var(--text-dim) 55%, transparent);
  stroke-width: 0.7;
}

.clock__day-tick--major {
  stroke: var(--text-dim);
  stroke-width: 1.1;
}

.clock__cardinal {
  stroke-width: 2.5;
  stroke-linecap: round;
}

.clock__crossing {
  stroke-width: 1;
  stroke-linecap: round;
}

.clock__day-sector {
  fill: color-mix(in srgb, var(--dial-accent) 30%, transparent);
  stroke: color-mix(in srgb, var(--dial-accent) 45%, transparent);
  stroke-width: 0.4;
}

.clock__midnight {
  stroke: #000;
  stroke-width: 0.3;
}

.clock__day-hand {
  stroke: var(--dial-accent);
  stroke-width: 1.8;
  stroke-linecap: round;
}

.clock__moon-hand {
  stroke: color-mix(in srgb, var(--text-dim) 80%, #c8c8d0);
  stroke-width: 1.3;
  stroke-linecap: round;
}

.clock__moon-disk {
  fill: #12141a;
}

.clock__moon-lit {
  fill: #e8e6e0;
}

.clock__moon-ring {
  stroke: color-mix(in srgb, var(--text-dim) 70%, #c8c8d0);
}

.clock__polar-dot {
  stroke: var(--bg);
  stroke-width: 0.35;
}

.clock__hub {
  fill: var(--dial-accent);
}

.clock__hub--eclipse {
  fill: #000;
  stroke: #fff;
  stroke-width: 0.3;
}
</style>
