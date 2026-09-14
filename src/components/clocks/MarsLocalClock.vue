<script setup lang="ts">
import { computed } from 'vue'
import type { MarsLocalSky, MarsMoonSky } from '../../lib/marsLocalSky.ts'

const props = defineProps<{
  sky: MarsLocalSky
}>()

const cx = 50
const cy = 50
const rimRadius = 45.5
const rimWidth = 5
const faceRadius = 36
const sectorRadius = 30
const sunHandRadius = 29
/** Phobos closer → longer hand; Deimos farther → shorter. */
const PHOBOS_HAND_RADIUS = sunHandRadius * 0.72
const DEIMOS_HAND_RADIUS = sunHandRadius * 0.55
const PHOBOS_PHASE_MID = 2.6
const PHOBOS_PHASE_SPAN = 0.55
const DEIMOS_PHASE_MID = 1.7
const DEIMOS_PHASE_SPAN = 0.35
const EMBEDDED_RING = 40
const SUN_POLAR_RADIUS = EMBEDDED_RING - 2.2
const PHOBOS_POLAR_RADIUS = EMBEDDED_RING + 1.4
const DEIMOS_POLAR_RADIUS = EMBEDDED_RING + 2.8
const POLAR_DOT_RADIUS = 1.15
const rimCircumference = 2 * Math.PI * rimRadius

/** Mars-symbol accent: ring in the face↔rim gap, shaft + arrow outside. */
const MARS_GLYPH = '#d4552a'
const SUN_TICK = '#e6b422'
const PHOBOS_TICK = '#c4a882'
const DEIMOS_TICK = '#8a8490'
const SOLSTICE_FILL = '#c9a227'
const EQUINOX_FILL = '#8a9aab'
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

const yearOffset = computed(() => rimCircumference * (1 - props.sky.yearFraction))
const yearHead = computed(() => dialPoint(rimRadius, props.sky.yearFraction))
const sunHand = computed(() => dialPoint(sunHandRadius, props.sky.dayFraction))
const phobosHand = computed(() => dialPoint(PHOBOS_HAND_RADIUS, props.sky.phobos.fraction))
const deimosHand = computed(() => dialPoint(DEIMOS_HAND_RADIUS, props.sky.deimos.fraction))

/**
 * ♂ arrow: shaft from the gap ring to the SVG’s upper-right corner; head is an
 * open chevron along the top and right edges (not a filled triangle).
 */
const marsArrow = computed(() => {
  const fraction = 0.125
  const ring = dialPoint(EMBEDDED_RING, fraction)
  // viewBox corner — shaft meets the chevron tip here.
  const corner = { x: 100, y: 0 }
  // Top edge, clear of the year rim (rim outer ≈ y = 2 at x = 50).
  const top = { x: 72, y: 0 }
  // Right edge, clear of the year rim (rim outer ≈ x = 98 at y = 50).
  const right = { x: 100, y: 28 }
  return {
    shaft: { x1: ring.x, y1: ring.y, x2: corner.x, y2: corner.y },
    head: `M ${top.x} ${top.y} L ${corner.x} ${corner.y} L ${right.x} ${right.y}`,
  }
})

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

const moonPhaseRotate = computed(() => props.sky.dayFraction * 360 - 90)

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

function phaseRadius(moon: MarsMoonSky, mid: number, span: number): number {
  return mid - span / 2 + moon.sizeFactor * span
}

const phobosPhaseRadius = computed(() =>
  phaseRadius(props.sky.phobos, PHOBOS_PHASE_MID, PHOBOS_PHASE_SPAN),
)
const deimosPhaseRadius = computed(() =>
  phaseRadius(props.sky.deimos, DEIMOS_PHASE_MID, DEIMOS_PHASE_SPAN),
)
const phobosRingStroke = computed(() => 0.7 - 0.4 * props.sky.phobos.sizeFactor)
const deimosRingStroke = computed(() => 0.65 - 0.35 * props.sky.deimos.sizeFactor)
const phobosLit = computed(() =>
  sunwardLitPath(phobosPhaseRadius.value, props.sky.phobos.illuminated),
)
const deimosLit = computed(() =>
  sunwardLitPath(deimosPhaseRadius.value, props.sky.deimos.illuminated),
)

const polarMarkers = computed(() => {
  const markers: { key: string; color: string; x: number; y: number; r: number }[] = []
  if (props.sky.sunPolar) {
    const fraction = props.sky.sunPolar === 'overhead' ? 0.5 : 0
    const point = dialPoint(SUN_POLAR_RADIUS, fraction)
    markers.push({ key: 'sun-polar', color: SUN_TICK, x: point.x, y: point.y, r: POLAR_DOT_RADIUS })
  }
  if (props.sky.phobos.polar) {
    const fraction = props.sky.phobos.polar === 'overhead' ? 0.5 : 0
    const point = dialPoint(PHOBOS_POLAR_RADIUS, fraction)
    markers.push({
      key: 'phobos-polar',
      color: PHOBOS_TICK,
      x: point.x,
      y: point.y,
      r: POLAR_DOT_RADIUS * 0.9,
    })
  }
  if (props.sky.deimos.polar) {
    const fraction = props.sky.deimos.polar === 'overhead' ? 0.5 : 0
    const point = dialPoint(DEIMOS_POLAR_RADIUS, fraction)
    markers.push({
      key: 'deimos-polar',
      color: DEIMOS_TICK,
      x: point.x,
      y: point.y,
      r: POLAR_DOT_RADIUS * 0.75,
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
  props.sky.phobos.crossings.forEach((crossing, index) => {
    const inner = dialPoint(faceRadius - 3.2, crossing.fraction)
    const outer = dialPoint(faceRadius + 2.2, crossing.fraction)
    marks.push({
      key: `phobos-${crossing.kind}-${index}`,
      color: PHOBOS_TICK,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    })
  })
  props.sky.deimos.crossings.forEach((crossing, index) => {
    const inner = dialPoint(faceRadius - 2.4, crossing.fraction)
    const outer = dialPoint(faceRadius + 3.0, crossing.fraction)
    marks.push({
      key: `deimos-${crossing.kind}-${index}`,
      color: DEIMOS_TICK,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    })
  })
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
  const parts = [`Mars local sky — ${percent(sky.yearFraction)} through its year since perihelion`]
  if (sky.solsPerYear >= 2) {
    const total = Math.round(sky.solsPerYear)
    const day = Math.min(Math.floor(sky.yearFraction * sky.solsPerYear) + 1, total)
    parts.push(`sol ${day.toLocaleString()} of ${total.toLocaleString()}`)
  }
  const sunLat = (sky.subsolarLatitude * 180) / Math.PI
  parts.push(
    `local solar time ${localTime(sky.dayFraction)}`,
    `Sun overhead at ${Math.abs(sunLat).toFixed(1)}° ${sunLat >= 0 ? 'north' : 'south'}`,
    `Phobos hour ${localTime(sky.phobos.fraction)} · ${(sky.phobos.illuminated * 100).toFixed(0)}% lit`,
    `Deimos hour ${localTime(sky.deimos.fraction)} · ${(sky.deimos.illuminated * 100).toFixed(0)}% lit`,
  )
  if (sky.sunPolar) parts.push(`Sun ${sky.sunPolar}`)
  if (sky.phobos.polar) parts.push(`Phobos ${sky.phobos.polar}`)
  if (sky.deimos.polar) parts.push(`Deimos ${sky.deimos.polar}`)
  if (sky.seasonMarks.length) {
    parts.push(
      `seasons ${sky.seasonMarks.map((m) => `${m.name}@${percent(m.yearFraction)}`).join(', ')}`,
    )
  }
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
      :d="mark.d"
      :fill="mark.fill"
    />
    <circle class="clock__year-head" :cx="yearHead.x" :cy="yearHead.y" r="2.4" />

    <circle class="clock__face" :cx="cx" :cy="cy" :r="faceRadius" />
    <line
      v-for="tick in dayTicks"
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
      :stroke="MARS_GLYPH"
      stroke-width="1.5"
    />
    <line
      class="clock__mars-shaft"
      :stroke="MARS_GLYPH"
      :x1="marsArrow.shaft.x1"
      :y1="marsArrow.shaft.y1"
      :x2="marsArrow.shaft.x2"
      :y2="marsArrow.shaft.y2"
    />
    <path
      class="clock__mars-arrow"
      fill="none"
      :stroke="MARS_GLYPH"
      :d="marsArrow.head"
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

    <line
      class="clock__moon-hand clock__moon-hand--deimos"
      :x1="cx"
      :y1="cy"
      :x2="deimosHand.x"
      :y2="deimosHand.y"
    />
    <g
      class="clock__moon-phase"
      :transform="`translate(${deimosHand.x} ${deimosHand.y}) rotate(${moonPhaseRotate})`"
    >
      <circle class="clock__moon-disk" :cx="0" :cy="0" :r="deimosPhaseRadius" />
      <path v-if="deimosLit" class="clock__moon-lit" :d="deimosLit" />
    </g>
    <circle
      class="clock__moon-ring clock__moon-ring--deimos"
      :cx="deimosHand.x"
      :cy="deimosHand.y"
      :r="deimosPhaseRadius"
      fill="none"
      :stroke-width="deimosRingStroke"
    />

    <line
      class="clock__moon-hand clock__moon-hand--phobos"
      :x1="cx"
      :y1="cy"
      :x2="phobosHand.x"
      :y2="phobosHand.y"
    />
    <g
      class="clock__moon-phase"
      :transform="`translate(${phobosHand.x} ${phobosHand.y}) rotate(${moonPhaseRotate})`"
    >
      <circle class="clock__moon-disk" :cx="0" :cy="0" :r="phobosPhaseRadius" />
      <path v-if="phobosLit" class="clock__moon-lit" :d="phobosLit" />
    </g>
    <circle
      class="clock__moon-ring clock__moon-ring--phobos"
      :cx="phobosHand.x"
      :cy="phobosHand.y"
      :r="phobosPhaseRadius"
      fill="none"
      :stroke-width="phobosRingStroke"
    />

    <circle class="clock__hub" :cx="cx" :cy="cy" r="2.2" />
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
  overflow: visible;
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

.clock__mars-shaft {
  stroke-width: 1.5;
  stroke-linecap: butt;
}

.clock__mars-arrow {
  stroke-width: 1.5;
  stroke-linecap: butt;
  stroke-linejoin: miter;
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

.clock__moon-hand--phobos {
  stroke: #b8956a;
  stroke-width: 1.35;
  stroke-linecap: round;
}

.clock__moon-hand--deimos {
  stroke: #7a7580;
  stroke-width: 1.15;
  stroke-linecap: round;
}

.clock__moon-disk {
  fill: #12141a;
}

.clock__moon-lit {
  fill: #e8e6e0;
}

.clock__moon-ring--phobos {
  stroke: #b8956a;
}

.clock__moon-ring--deimos {
  stroke: #7a7580;
}

.clock__polar-dot {
  stroke: var(--bg);
  stroke-width: 0.35;
}

.clock__hub {
  fill: var(--dial-accent);
}
</style>
