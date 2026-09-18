<script setup lang="ts">
import { computed } from 'vue'
import type { MercuryLocalSky } from '../../lib/mercuryLocalSky.ts'

const props = defineProps<{
  sky: MercuryLocalSky
}>()

// const faceCx = 50
// const faceCy = 50
const HALF_BOX = 50
const faceRadius = 32
const glyphRadius = 25
const yearSemiMajor = 46
const sectorRadius = 22
const YEAR_DIVISIONS = 12
const DAY_DIVISIONS = 24
const RIM_STROKE = 4.5
const QUARTER_PERIOD_ANOMALY_FRACTION = 0.314
const GLYPH = '#d0d4da'
const SUN_TICK = '#e6b422'
const MEAN_HAND = '#c23b22'
const SIDEREAL_HAND = '#7a8490'

const eccentricity = computed(() => props.sky.eccentricity)

const focusOffset = computed(() => yearSemiMajor * eccentricity.value)

/** Geometric center sits above the Sun focus → perihelion below, aphelion above. */
const clockFaceCenter = computed(() => ({
  x: HALF_BOX,
  y: HALF_BOX - focusOffset.value,
}))

function dialPoint(radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * Math.PI * 2
  return {
    x: clockFaceCenter.value.x + radius * Math.sin(angle),
    y: clockFaceCenter.value.y - radius * Math.cos(angle),
  }
}

const yearSemiMinor = computed(() => {
  const e = eccentricity.value
  return yearSemiMajor * Math.sqrt(1 - e * e)
})

/** Ramanujan approximation — matches SVG ellipse dash length well enough. */
const rimPerimeter = computed(() => {
  const a = yearSemiMajor
  const b = yearSemiMinor.value
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
})

/** True-anomaly polar radius from the Sun focus. */
function rimRadiusAt(fraction: number): number {
  const e = eccentricity.value
  const a = yearSemiMajor
  const nu = fraction * Math.PI * 2
  return (a * (1 - e * e)) / (1 + e * Math.cos(nu))
}

/** Perihelion at top; fraction increases clockwise. */
function rimPoint(fraction: number): { x: number; y: number } {
  const nu = fraction * Math.PI * 2
  return {
    x: HALF_BOX + yearSemiMinor.value * Math.sin(nu),
    y: HALF_BOX - yearSemiMajor * Math.cos(nu),
  }
}

/**
 * Fill ellipse is authored wide then rotated +90° around its center so the
 * stroke starts at perihelion (bottom) and runs clockwise — same
 * dasharray/offset trick as Earth/Mars, without a polyline path.
 */
const rimFillTransform = computed(() => `rotate(-90 ${HALF_BOX} ${HALF_BOX})`)

const yearOffset = computed(() => {
  return rimPerimeter.value * (1 - props.sky.trueAnomalyFraction)
})

const yearPoint = computed(() => rimPoint(props.sky.trueAnomalyFraction))

const yearTicks = computed(() =>
  Array.from({ length: YEAR_DIVISIONS }, (_, i) => {
    const fraction = i / YEAR_DIVISIONS
    const major = i % 3 === 0
    const outerR = rimRadiusAt(fraction) + RIM_STROKE / 2 + 0.5
    const innerR = rimRadiusAt(fraction) - RIM_STROKE / 2 - (major ? 2 : 0.5)
    const angle = fraction * Math.PI * 2
    const ux = -Math.sin(angle)
    const uy = Math.cos(angle)
    return {
      key: i,
      major,
      x1: clockFaceCenter.value.x - innerR * ux,
      y1: clockFaceCenter.value.y - innerR * uy,
      x2: clockFaceCenter.value.x - outerR * ux,
      y2: clockFaceCenter.value.y - outerR * uy,
    }
  }),
)

const yearFirstQuarter = computed(() => rimPoint(QUARTER_PERIOD_ANOMALY_FRACTION))
const yearLastQuarter = computed(() => rimPoint(1 - QUARTER_PERIOD_ANOMALY_FRACTION))

/**
 * ☿ bowl stays upright at the top (aphelion gap). Horns at ±1/12 turn from
 * aphelion; quadratic control is chosen so the curve midpoint sits on the
 * face ring.
 */
const bowlPath = computed(() => {
  const left = rimPoint(-1 / 12)
  const right = rimPoint(1 / 12)

  const h = clockFaceCenter.value.y - glyphRadius
  const w = (right.x - left.x) / 2
  const radius = (h * h + w * w) / (2 * h)
  return `M ${left.x} ${0} A ${radius} ${radius} 0 0 0 ${right.x} ${0}`
})

/**
 * ☿ cross hangs below the face ring — outward from the circle and from the
 * orbit center (ellipse center sits above the focus after the vertical mirror).
 * Keep it short of the perihelion rim (~a(1−e) from the focus).
 */
const glyphCross = computed(() => {
  const stemTop = clockFaceCenter.value.y + glyphRadius + 0.6
  const stemBottom = clockFaceCenter.value.y + glyphRadius + 25
  const barY = stemTop + (stemBottom - stemTop) * 0.42
  const barHalf = (stemBottom - stemTop) / 2
  return {
    stem: { x1: clockFaceCenter.value.x, y1: stemTop, x2: clockFaceCenter.value.x, y2: stemBottom },
    bar: {
      x1: clockFaceCenter.value.x - barHalf,
      y1: barY,
      x2: clockFaceCenter.value.x + barHalf,
      y2: barY,
    },
  }
})

const dayTicks = computed(() =>
  Array.from({ length: DAY_DIVISIONS }, (_, i) => {
    const fraction = i / DAY_DIVISIONS
    const major = i % 6 === 0
    const from = dialPoint(major ? faceRadius - 4.5 : faceRadius - 2.8, fraction)
    const to = dialPoint(faceRadius - 1.2, fraction)
    return { key: i, major, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  }),
)

const crossingMarks = computed(() =>
  props.sky.sunCrossings.map((crossing) => {
    const inner = dialPoint(faceRadius - 4.5, crossing.fraction)
    const outer = dialPoint(faceRadius + 1.5, crossing.fraction)
    return {
      key: `sun-${crossing.kind}`,
      color: SUN_TICK,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    }
  }),
)

/** Longer at perihelion when using the circular-rim fallback. */
const sunHandRadius = computed(() => {
  return sectorRadius - 1
})

const meanHandRadius = computed(() => sunHandRadius.value * 0.82)
const siderealHandRadius = computed(() => sunHandRadius.value * 0.7)

const sunHand = computed(() => dialPoint(sunHandRadius.value, props.sky.dayFraction))
const meanHand = computed(() => dialPoint(meanHandRadius.value, props.sky.meanDayFraction))
const siderealHand = computed(() => dialPoint(siderealHandRadius.value, props.sky.siderealFraction))

const siderealStar = computed(() => {
  const tip = siderealHand.value
  const angle = props.sky.siderealFraction * Math.PI * 2
  const tx = -Math.cos(angle)
  const ty = Math.sin(angle)
  const s = 1.6
  return {
    x1: tip.x - tx * s,
    y1: tip.y - ty * s,
    x2: tip.x + tx * s,
    y2: tip.y + ty * s,
    x3: tip.x - ty * s,
    y3: tip.y + tx * s,
    x4: tip.x + ty * s,
    y4: tip.y - tx * s,
  }
})

const daySector = computed(() => {
  const fraction = Math.min(props.sky.dayFraction, 0.9999)
  if (fraction <= 0.0001) return ''
  const start = dialPoint(sectorRadius, 0)
  const end = dialPoint(sectorRadius, fraction)
  const largeArc = fraction > 0.5 ? 1 : 0
  return [
    `M ${clockFaceCenter.value.x} ${clockFaceCenter.value.y}`,
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
  return [
    `Mercury local sky at ${sky.siteName}`,
    `${percent(sky.yearFraction)} through its year since perihelion`,
    `true solar ${localTime(sky.dayFraction)}`,
    `mean solar ${localTime(sky.meanDayFraction)}`,
    `sidereal ${localTime(sky.siderealFraction)}`,
    `true anomaly ${percent(sky.trueAnomalyFraction)}`,
  ].join(' · ')
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

    <circle class="clock__edge" :cx="HALF_BOX" :cy="HALF_BOX" :r="HALF_BOX" />

    <ellipse
      class="clock__rim-track"
      :cx="HALF_BOX"
      :cy="HALF_BOX"
      :rx="yearSemiMinor"
      :ry="yearSemiMajor"
      :stroke-width="RIM_STROKE"
    />
    <ellipse
      class="clock__rim-fill"
      :cx="HALF_BOX"
      :cy="HALF_BOX"
      :rx="yearSemiMajor"
      :ry="yearSemiMinor"
      fill="none"
      :stroke-width="RIM_STROKE"
      :stroke-dasharray="rimPerimeter"
      :stroke-dashoffset="yearOffset"
      :transform="rimFillTransform"
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

    <circle class="clock__face" :cx="clockFaceCenter.x" :cy="clockFaceCenter.y" :r="faceRadius" />
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
    <line
      class="clock__midnight"
      :x1="clockFaceCenter.x"
      :y1="clockFaceCenter.y"
      :x2="clockFaceCenter.x"
      :y2="clockFaceCenter.y - sectorRadius"
    />

    <line
      class="clock__mean-hand"
      :stroke="MEAN_HAND"
      :x1="clockFaceCenter.x"
      :y1="clockFaceCenter.y"
      :x2="meanHand.x"
      :y2="meanHand.y"
    />
    <line
      class="clock__sidereal-hand"
      :stroke="SIDEREAL_HAND"
      :x1="clockFaceCenter.x"
      :y1="clockFaceCenter.y"
      :x2="siderealHand.x"
      :y2="siderealHand.y"
    />
    <line
      class="clock__sidereal-star"
      :stroke="SIDEREAL_HAND"
      :x1="siderealStar.x1"
      :y1="siderealStar.y1"
      :x2="siderealStar.x2"
      :y2="siderealStar.y2"
    />
    <line
      class="clock__sidereal-star"
      :stroke="SIDEREAL_HAND"
      :x1="siderealStar.x3"
      :y1="siderealStar.y3"
      :x2="siderealStar.x4"
      :y2="siderealStar.y4"
    />
    <line
      class="clock__day-hand"
      :stroke="SUN_TICK"
      :x1="clockFaceCenter.x"
      :y1="clockFaceCenter.y"
      :x2="sunHand.x"
      :y2="sunHand.y"
    />

    <!-- ☿ on top of hands so ring/cross/bowl stay readable. -->
    <circle
      class="clock__glyph-ring"
      :cx="clockFaceCenter.x"
      :cy="clockFaceCenter.y"
      :r="glyphRadius"
      fill="none"
      :stroke="GLYPH"
      stroke-width="2.4"
    />
    <line
      class="clock__glyph-cross"
      :stroke="GLYPH"
      :x1="glyphCross.stem.x1"
      :y1="glyphCross.stem.y1"
      :x2="glyphCross.stem.x2"
      :y2="glyphCross.stem.y2"
    />
    <line
      class="clock__glyph-cross"
      :stroke="GLYPH"
      :x1="glyphCross.bar.x1"
      :y1="glyphCross.bar.y1"
      :x2="glyphCross.bar.x2"
      :y2="glyphCross.bar.y2"
    />
    <path class="clock__glyph-bowl" fill="none" :stroke="GLYPH" :d="bowlPath" />

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

    <circle class="clock__year-head" :cx="yearPoint.x" :cy="yearPoint.y" r="2.4" />

    <circle
      class="clock__year-halfway"
      :cx="yearFirstQuarter.x"
      :cy="yearFirstQuarter.y"
      r="0.75"
    />
    <circle class="clock__year-halfway" :cx="yearLastQuarter.x" :cy="yearLastQuarter.y" r="0.75" />

    <circle class="clock__hub" :cx="clockFaceCenter.x" :cy="clockFaceCenter.y" r="2.2" />
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
  stroke: var(--dial-body);
  stroke-linecap: butt;
  stroke-linejoin: round;
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

.clock__glyph-bowl {
  stroke-width: 2.2;
  stroke-linecap: round;
}

.clock__face {
  fill: var(--dial-face);
  stroke: none;
}

.clock__day-tick {
  stroke: color-mix(in srgb, var(--text-dim) 55%, transparent);
  stroke-width: 0.7;
}

.clock__day-tick--major {
  stroke: var(--text-dim);
  stroke-width: 1.1;
}

.clock__crossing {
  stroke-width: 1;
  stroke-linecap: round;
}

.clock__glyph-ring {
  pointer-events: none;
}

.clock__glyph-cross {
  stroke-width: 2.2;
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

.clock__mean-hand {
  stroke-width: 1.15;
  stroke-linecap: round;
  opacity: 0.85;
}

.clock__sidereal-hand {
  stroke-width: 1.2;
  stroke-linecap: round;
}

.clock__sidereal-star {
  stroke-width: 1.1;
  stroke-linecap: round;
}

.clock__day-hand {
  stroke-width: 1.8;
  stroke-linecap: round;
}

.clock__hub {
  fill: var(--dial-accent);
}
</style>
