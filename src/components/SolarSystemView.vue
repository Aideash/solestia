<script setup lang="ts">
import { computed } from 'vue'
import { orbitPoint, wrapRad, type SolarSystemSnapshot } from '../lib/kepler.ts'

const props = defineProps<{
  snapshot: SolarSystemSnapshot
}>()

const size = 100
const cx = size / 2
const cy = size / 2
const innerR = 10
const outerR = 46

const rings = computed(() => {
  const { planets } = props.snapshot
  const last = Math.max(planets.length - 1, 1)
  return planets.map((planet, i) => {
    const r = innerR + (i / last) * (outerR - innerR)
    const body = orbitPoint(cx, cy, r, planet.offsetFromEarthPerihelion)
    const periOffset = wrapRad(planet.perihelionLongitude - props.snapshot.earthPerihelionLongitude)
    const periTick = orbitPoint(cx, cy, r, periOffset)
    const periInner = orbitPoint(cx, cy, r - 1.4, periOffset)
    return { planet, r, body, periTick, periInner }
  })
})

const perihelionMark = orbitPoint(cx, cy, outerR + 2.2, 0)
const aphelionMark = orbitPoint(cx, cy, outerR + 2.2, Math.PI)

function formatDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

function formatRad(rad: number): string {
  return `${rad.toFixed(3)} rad`
}
</script>

<template>
  <div class="orrery">
    <svg
      class="orrery__svg"
      :viewBox="`0 0 ${size} ${size}`"
      role="img"
      aria-label="Solar system orrery with evenly spaced orbits, Earth perihelion at the top"
    >
      <title>Solar system now</title>
      <desc>
        Concentric rings for Mercury through Neptune. Earth's perihelion is at the top, aphelion at
        the bottom. Planets sit at their current heliocentric longitude in that frame.
      </desc>
      <line class="axis" :x1="cx" :y1="cy - outerR - 1" :x2="cx" :y2="cy + outerR + 1" />
      <text class="axis-label" :x="perihelionMark.x" :y="perihelionMark.y" text-anchor="middle">
        peri
      </text>
      <text class="axis-label" :x="aphelionMark.x" :y="aphelionMark.y + 2.2" text-anchor="middle">
        aph
      </text>
      <g v-for="ring in rings" :key="ring.planet.id">
        <circle class="orbit" :cx="cx" :cy="cy" :r="ring.r" />
        <line
          class="peri-tick"
          :x1="ring.periInner.x"
          :y1="ring.periInner.y"
          :x2="ring.periTick.x"
          :y2="ring.periTick.y"
        />
        <circle
          class="body"
          :cx="ring.body.x"
          :cy="ring.body.y"
          :r="ring.planet.id === 'earth' ? 1.7 : 1.45"
          :fill="ring.planet.color"
        >
          <title>{{ ring.planet.name }}</title>
        </circle>
      </g>
      <circle class="sun" :cx="cx" :cy="cy" r="3.1" />
    </svg>

    <table class="readout">
      <caption class="readout__caption">
        Orbit progress
      </caption>
      <thead>
        <tr>
          <th scope="col">Planet</th>
          <th scope="col">λ</th>
          <th scope="col">ν</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="planet in snapshot.planets" :key="planet.id">
          <th scope="row">
            <span class="swatch" :style="{ background: planet.color }"></span>
            {{ planet.name }}
          </th>
          <td>
            <span class="pair">{{ formatDeg(planet.longitude) }}</span>
            <span class="pair pair--dim">{{ formatRad(planet.longitude) }}</span>
          </td>
          <td>
            <span class="pair">{{ formatDeg(planet.trueAnomaly) }}</span>
            <span class="pair pair--dim">{{ formatRad(planet.trueAnomaly) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.orrery {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.orrery__svg {
  width: 100%;
  height: auto;
  display: block;
}

.orbit {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.35;
}

.axis {
  stroke: color-mix(in srgb, var(--text-dim) 45%, transparent);
  stroke-width: 0.25;
  stroke-dasharray: 1 1.2;
}

.axis-label {
  fill: var(--text-dim);
  font-size: 2.4px;
  font-family: $font-sans;
}

.peri-tick {
  stroke: color-mix(in srgb, var(--accent) 55%, transparent);
  stroke-width: 0.35;
}

.sun {
  fill: var(--accent);
}

.readout {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.readout__caption {
  caption-side: top;
  text-align: left;
  font-weight: 600;
  margin-bottom: $spacing-sm;
}

th,
td {
  padding: 0.4rem 0.35rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

thead th {
  color: $color-text-muted;
  font-weight: 500;
  font-size: 0.75rem;
}

tbody th {
  font-weight: 500;
  white-space: nowrap;
}

.swatch {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
}

.pair {
  display: block;
}

.pair--dim {
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.7rem;
}
</style>
