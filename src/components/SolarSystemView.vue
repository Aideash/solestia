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
// Vertical breathing room so the peri/aph labels outside the outer ring aren't clipped.
const padY = 3
const viewBox = `0 ${-padY} ${size} ${size + padY * 2}`

const perihelionMark = orbitPoint(cx, cy, outerR + 2.2, 0)
const aphelionMark = orbitPoint(cx, cy, outerR + 2.2, Math.PI)

function formatDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

function formatRad(rad: number): string {
  return `${rad.toFixed(3)} rad`
}

const JULIAN_YEAR_DAYS = 365.25
const HOURS_PER_DAY = 24

/** Roughly four significant figures, so column widths stay comparable. */
function formatQuantity(value: number, unit: string): string {
  const digits = value >= 10000 ? 0 : value >= 100 ? 1 : value >= 10 ? 2 : 3
  const number = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${number} ${unit}`
}

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

const rows = computed(() =>
  props.snapshot.planets.map((planet) => ({
    planet,
    rotation: {
      primary: formatQuantity(planet.siderealRotationDays * HOURS_PER_DAY, 'h'),
      secondary: formatQuantity(planet.siderealRotationDays, 'd'),
      spin: `Spin axis tilted ${formatDeg(planet.obliquity)} from ecliptic north${
        planet.retrograde ? ' — rotates retrograde' : ''
      }`,
    },
    orbit: {
      primary: formatQuantity(planet.siderealOrbitDays, 'd'),
      secondary: formatQuantity(planet.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
    },
  })),
)
</script>

<template>
  <div class="orrery">
    <svg
      class="orrery__svg"
      :viewBox="viewBox"
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
        <title>Aphelion - Nearest Point to the Sun</title>
      </text>
      <text class="axis-label" :x="aphelionMark.x" :y="aphelionMark.y + 2.2" text-anchor="middle">
        aph
        <title>Aphelion - Farthest Point from the Sun</title>
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
        <span class="help">
          <button
            type="button"
            class="help__btn"
            aria-describedby="orbit-help"
            aria-label="About table symbols"
          >
            i
          </button>
          <div id="orbit-help" role="tooltip" class="help__panel">
            <p>
              <strong>λ</strong> (lambda) is heliocentric ecliptic longitude — the planet’s angular
              position around the Sun, measured along the ecliptic from the J2000 vernal equinox.
            </p>
            <p>
              <strong>ν</strong> (nu) is the true anomaly — the angle at the Sun between the planet
              and its perihelion.
            </p>
            <p>
              <strong>P<sub>rot</sub></strong> is the sidereal rotation period — one spin relative
              to the stars. Hover a value for that planet’s axial tilt.
            </p>
            <p>
              <strong>P<sub>orb</sub></strong> is the sidereal orbital period — one revolution
              around the Sun relative to the stars.
            </p>
          </div>
        </span>
      </caption>
      <thead>
        <tr>
          <th scope="col">Planet</th>
          <th scope="col">λ</th>
          <th scope="col">ν</th>
          <th scope="col">
            <span class="th-sym">P<sub>rot</sub></span>
          </th>
          <th scope="col">
            <span class="th-sym">P<sub>orb</sub></span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.planet.id">
          <th scope="row">
            <span class="swatch" :style="{ background: row.planet.color }"></span>
            {{ row.planet.name }}
          </th>
          <td>
            <span class="pair">{{ formatDeg(row.planet.longitude) }}</span>
            <span class="pair pair--dim">{{ formatRad(row.planet.longitude) }}</span>
          </td>
          <td>
            <span class="pair">{{ formatDeg(row.planet.trueAnomaly) }}</span>
            <span class="pair pair--dim">{{ formatRad(row.planet.trueAnomaly) }}</span>
          </td>
          <td :title="row.rotation.spin">
            <span class="pair">{{ row.rotation.primary }}</span>
            <span class="pair pair--dim">{{ row.rotation.secondary }}</span>
          </td>
          <td>
            <span class="pair">{{ row.orbit.primary }}</span>
            <span class="pair pair--dim">{{ row.orbit.secondary }}</span>
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

  g:hover {
    opacity: 0.5;
  }
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
  overflow: visible;
}

.readout__caption {
  caption-side: top;
  text-align: left;
  font-weight: 600;
  margin-bottom: $spacing-sm;
}

.help {
  position: relative;
  display: inline-block;
  margin-left: 0.35rem;
  font-weight: 400;
  vertical-align: middle;
}

.help__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: transparent;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.7rem;
  font-style: italic;
  line-height: 1;
  cursor: help;
}

.help__btn:hover,
.help__btn:focus-visible {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  outline: none;
}

.help__panel {
  display: none;
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  width: min(18.5rem, 70vw);
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: var(--bg-raised);
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 35%);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
}

.help__panel p {
  margin: 0 0 0.55rem;
}

.help__panel p:last-child {
  margin-bottom: 0;
}

.help:hover .help__panel,
.help:focus-within .help__panel {
  display: block;
}

.th-sym sub {
  font-size: 0.65em;
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
