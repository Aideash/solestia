<script setup lang="ts">
import { computed, useId } from 'vue'
import { PLANET_SYSTEMS } from '../data/planetSystems.ts'
import type { PlanetState, SatelliteState } from '../lib/kepler.ts'

type ClockBody = Pick<
  PlanetState,
  | 'name'
  | 'color'
  | 'symbol'
  | 'yearFraction'
  | 'retrograde'
  | 'dayFraction'
  | 'solsPerYear'
  | 'subsolarLatitude'
> & {
  number?: number
}

const props = withDefaults(
  defineProps<{
    planet: ClockBody | SatelliteState
    parentSystem?: keyof typeof PLANET_SYSTEMS
    mirroredLabel?: boolean
    selected?: boolean
    /** Hide the day face for bodies without a meaningful spin dial (comets). */
    face?: 'day' | 'none'
  }>(),
  { face: 'day' },
)

const emit = defineEmits<{ select: [] }>()

const centerClipId = `clock-center-${useId()}`
const showFace = computed(() => props.face !== 'none')
const isSatellite = computed(() => 'parentFraction' in props.planet)
const clockMark = computed(() => {
  if (props.planet.symbol) return props.planet.symbol
  return 'number' in props.planet && props.planet.number ? `${props.planet.number}` : null
})
const parent = computed(() => (props.parentSystem ? PLANET_SYSTEMS[props.parentSystem] : null))
const orbitReversed = computed(
  () => 'orbitRetrograde' in props.planet && props.planet.orbitRetrograde,
)
const dayReversed = computed(() => props.planet.retrograde)
const isSynchronous = computed(
  () => 'parentDayDays' in props.planet && !Number.isFinite(props.planet.parentDayDays),
)

const cx = 50
const cy = 50
const rimRadius = 45.5
const rimWidth = 5
const faceRadius = 36
const sectorRadius = 30
const handRadius = 29
const rimCircumference = 2 * Math.PI * rimRadius

const YEAR_DIVISIONS = 12
const DAY_DIVISIONS = 24

/** Clockwise from the top; callers negate physical retrograde progress. */
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
    return { key: i, major, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  })
}

/** Notches cut across the year rim, so the band reads as segments. */
const yearTicks = tickMarks(
  YEAR_DIVISIONS,
  rimRadius - rimWidth / 2 - 0.5,
  rimRadius + rimWidth / 2 + 0.5,
  3,
)
const dayTicks = tickMarks(DAY_DIVISIONS, faceRadius - 3, faceRadius, 6)

const yearOffset = computed(
  () => rimCircumference * (1 - props.planet.yearFraction) * (orbitReversed.value ? -1 : 1),
)
const yearHead = computed(() =>
  dialPoint(rimRadius, props.planet.yearFraction * (orbitReversed.value ? -1 : 1)),
)
const dayHand = computed(() =>
  dialPoint(handRadius, props.planet.dayFraction * (dayReversed.value ? -1 : 1)),
)
const parentMark = computed(() => {
  if (!('parentFraction' in props.planet)) return null
  return dialPoint(handRadius * 0.72, props.planet.parentFraction * (dayReversed.value ? -1 : 1))
})

/** Pie slice from local midnight, following the body's physical spin direction. */
const daySector = computed(() => {
  if (isSatellite.value && !isSynchronous.value) return ''
  const fraction = Math.min(props.planet.dayFraction, 0.9999)
  if (fraction <= 0.0001) return ''
  const start = dialPoint(sectorRadius, 0)
  const end = dialPoint(sectorRadius, fraction * (dayReversed.value ? -1 : 1))
  const largeArc = fraction > 0.5 ? 1 : 0
  const sweep = dayReversed.value ? 0 : 1
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${sectorRadius} ${sectorRadius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
})

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** Time of day in that planet's own hours, its solar day split into 24. */
function localTime(fraction: number): string {
  const totalMinutes = Math.round(fraction * 24 * 60)
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const label = computed(() => {
  const planet = props.planet
  const orbitWord = isSatellite.value
    ? `month since ${parent.value?.periapsisName ?? 'periapsis'}`
    : 'year since perihelion'
  const parts = [`${planet.name} — ${percent(planet.yearFraction)} through its ${orbitWord}`]
  if (!showFace.value) return parts.join(' · ')
  if (planet.solsPerYear >= 2) {
    const total = Math.round(planet.solsPerYear)
    const day = Math.min(Math.floor(planet.yearFraction * planet.solsPerYear) + 1, total)
    parts.push(`solar day ${day.toLocaleString()} of ${total.toLocaleString()}`)
  }
  const latitude = (planet.subsolarLatitude * 180) / Math.PI
  parts.push(
    `local solar time ${localTime(planet.dayFraction)}`,
    `Sun overhead at ${Math.abs(latitude).toFixed(1)}° ${latitude >= 0 ? 'north' : 'south'}`,
  )
  if ('parentFraction' in planet && parent.value) {
    const hour = localTime(planet.parentFraction)
    parts.push(
      isSynchronous.value
        ? `${parent.value.name} transits the prime meridian near ${hour} (1:1 lock, with libration)`
        : `${parent.value.name} transits the prime meridian near ${hour}; the parent day is ${planet.parentDayDays.toFixed(3)} Earth days`,
    )
  }
  return parts.join(' · ')
})
</script>

<template>
  <svg
    class="clock"
    :class="{ selected, 'clock--rim-only': !showFace }"
    viewBox="0 0 100 100"
    role="img"
    :aria-label="label"
    :style="{ '--dial-body': planet.color }"
    @click="emit('select')"
  >
    <title>{{ label }}</title>

    <text
      v-if="clockMark"
      class="clock__symbol"
      :x="mirroredLabel ? 100 : 0"
      y="1em"
      :text-anchor="mirroredLabel ? 'end' : 'start'"
      fill="currentColor"
    >
      {{ clockMark }}
    </text>

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
    <circle class="clock__year-head" :cx="yearHead.x" :cy="yearHead.y" r="2.4" />

    <g v-if="!showFace" class="clock__center">
      <defs>
        <clipPath :id="centerClipId">
          <circle :cx="cx" :cy="cy" :r="faceRadius" />
        </clipPath>
      </defs>
      <g :clip-path="`url(#${centerClipId})`">
        <slot name="center" />
      </g>
    </g>

    <template v-if="showFace">
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
      <path v-if="daySector" class="clock__day-sector" :d="daySector" />
      <line class="clock__midnight" :x1="cx" :y1="cy" :x2="cx" :y2="cy - sectorRadius" />
      <line class="clock__day-hand" :x1="cx" :y1="cy" :x2="dayHand.x" :y2="dayHand.y" />
      <text
        v-if="parentMark"
        class="clock__parent"
        :x="parentMark.x"
        :y="parentMark.y"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ parent?.symbol }}
      </text>
      <circle class="clock__hub" :cx="cx" :cy="cy" r="2.2" />
    </template>
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
  cursor: pointer;
}

.clock:hover {
  filter: drop-shadow(0px 0px 4px var(--accent));
}

.clock.selected {
  filter: drop-shadow(0px 0px 7px var(--accent));
}

.clock.selected:hover {
  filter: drop-shadow(0px 0px 7px color-mix(in srgb, var(--accent), var(--text)));
}

/*
 * A lighter, more saturated sibling of the planet color: enough separation for
 * the day dial to read against the rim, and it lifts the darker bodies such as
 * Earth's green off the dark background.
 */
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

.clock__day-sector {
  fill: color-mix(in srgb, var(--dial-accent) 30%, transparent);
  stroke: color-mix(in srgb, var(--dial-accent) 45%, transparent);
  stroke-width: 0.4;
}

.clock__midnight {
  stroke: color-mix(in srgb, var(--text-dim) 70%, var(--bg));
  stroke-width: 1.2;
}

.clock__day-hand {
  stroke: var(--dial-accent);
  stroke-width: 1.8;
  stroke-linecap: round;
}

.clock__hub {
  fill: var(--dial-accent);
}

.clock__symbol {
  font-size: 0.9em;
}

.clock__parent {
  font-size: 7px;
  fill: var(--text-dim);
  pointer-events: none;
}
</style>
