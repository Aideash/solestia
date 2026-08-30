<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { PlanetId } from '../data/planets.ts'
import { orbitPoint, wrapRad, type SolarSystemSnapshot } from '../lib/kepler.ts'

const props = defineProps<{
  snapshot: SolarSystemSnapshot
  selectedPlanet?: PlanetId | null
  live?: boolean
}>()

const emit = defineEmits<{ select: [id: PlanetId] }>()

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

/**
 * Whisker marking where each planet's prime meridian points. It clears the disc
 * by `facingGap`, then runs between `facingMin` and `facingMax` so a meridian
 * tipped out of the ecliptic reads as foreshortened without ever vanishing.
 * The longest whisker stays well inside the gap to the next ring.
 */
const facingGap = 0.25
const facingMin = 0.4
const facingMax = 1.45

/**
 * The same whisker for the Sun, scaled to its larger disc. It reaches at most
 * `sunR + sunFacingGap + sunFacingMax` from the center, well short of Mercury.
 */
const sunR = 3.5
const sunFacingGap = 0.35
const sunFacingMin = 0.6
const sunFacingMax = 1.6

function formatDeg(rad: number): string {
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

function formatRad(rad: number): string {
  return `${rad.toFixed(3)} rad`
}

const JULIAN_YEAR_DAYS = 365.25
const HOURS_PER_DAY = 24

type RotationKind = 'sidereal' | 'solar'
type OrbitUnit = 'earth' | 'local'

const rotationKind = ref<RotationKind>('sidereal')
const orbitUnit = ref<OrbitUnit>('earth')

const showFacing = ref(true)
const showPerihelion = ref(true)
const showSunFacing = ref(true)

const settingsOpen = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

function onSettingsDocPointer(event: PointerEvent) {
  if (!settingsOpen.value) return
  const target = event.target
  if (target instanceof Node && settingsRoot.value?.contains(target)) return
  settingsOpen.value = false
}

function onSettingsDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !settingsOpen.value) return
  settingsOpen.value = false
  event.preventDefault()
  event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('pointerdown', onSettingsDocPointer)
  document.addEventListener('keydown', onSettingsDocKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onSettingsDocPointer)
  document.removeEventListener('keydown', onSettingsDocKeydown, true)
})

/** Roughly four significant figures, so column widths stay comparable. */
function formatQuantity(value: number, unit: string): string {
  const digits = value >= 10000 ? 0 : value >= 100 ? 1 : value >= 10 ? 2 : 3
  const number = value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${number} ${unit}`
}

function toggleRotationKind() {
  rotationKind.value = rotationKind.value === 'sidereal' ? 'solar' : 'sidereal'
}

function toggleOrbitUnit() {
  orbitUnit.value = orbitUnit.value === 'earth' ? 'local' : 'earth'
}

const rings = computed(() => {
  const { planets, earthPerihelionLongitude, rotationFrame } = props.snapshot
  const last = Math.max(planets.length - 1, 1)
  return planets.map((planet, i) => {
    const r = innerR + (i / last) * (outerR - innerR)
    const body = orbitPoint(cx, cy, r, planet.offsetFromEarthPerihelion)
    const periOffset = wrapRad(planet.perihelionLongitude - earthPerihelionLongitude)
    const periTick = orbitPoint(cx, cy, r, periOffset)
    const periInner = orbitPoint(cx, cy, r - 1.4, periOffset)

    const bodyR = planet.id === 'earth' ? 1.7 : 1.45
    const facingOffset = wrapRad(planet.facing.longitude - earthPerihelionLongitude)
    const facingReach = bodyR + facingGap
    const facingFrom = orbitPoint(body.x, body.y, facingReach, facingOffset)
    const facingTo = orbitPoint(
      body.x,
      body.y,
      facingReach + facingMin + (facingMax - facingMin) * planet.facing.inPlane,
      facingOffset,
    )
    const label =
      `${planet.name} — ${rotationFrame} prime meridian faces ` +
      `${formatDeg(planet.facing.longitude)} ecliptic longitude`

    return { planet, r, bodyR, body, periTick, periInner, facingFrom, facingTo, label }
  })
})

const sunMark = computed(() => {
  const { sun, earthPerihelionLongitude } = props.snapshot
  const offset = wrapRad(sun.facing.longitude - earthPerihelionLongitude)
  const reach = sunR + sunFacingGap
  const from = orbitPoint(cx, cy, reach, offset)
  const to = orbitPoint(
    cx,
    cy,
    reach + sunFacingMin + (sunFacingMax - sunFacingMin) * sun.facing.inPlane,
    offset,
  )
  const label =
    `Sun — Carrington prime meridian faces ${formatDeg(sun.facing.longitude)} ecliptic ` +
    `longitude, one turn every ${sun.siderealRotationDays.toFixed(2)} d. ` +
    `Spin axis tilted ${formatDeg(sun.obliquity)} from ecliptic north`
  return { from, to, label }
})

/**
 * Roving tabindex: the table is a single tab stop, then the arrow keys walk the
 * rows. The dials and the orrery stay click-only so the same eight planets don't
 * turn up three times in the tab order.
 */
const focusedPlanet = ref<PlanetId | null>(null)

const tabStopPlanet = computed(
  () => focusedPlanet.value ?? props.selectedPlanet ?? props.snapshot.planets[0]?.id ?? null,
)

function focusRow(row: Element | null | undefined) {
  if (row instanceof HTMLElement) row.focus()
}

function onRowKeydown(event: KeyboardEvent, id: PlanetId) {
  const row = event.currentTarget as HTMLTableRowElement
  const body = row.parentElement
  if (!body) return

  switch (event.key) {
    case 'ArrowDown':
      focusRow(row.nextElementSibling ?? body.firstElementChild)
      break
    case 'ArrowUp':
      focusRow(row.previousElementSibling ?? body.lastElementChild)
      break
    case 'Home':
      focusRow(body.firstElementChild)
      break
    case 'End':
      focusRow(body.lastElementChild)
      break
    case 'Enter':
    case ' ':
      emit('select', id)
      break
    default:
      return
  }
  event.preventDefault()
}

const rows = computed(() =>
  props.snapshot.planets.map((planet) => {
    const rotationDays =
      rotationKind.value === 'sidereal' ? planet.siderealRotationDays : planet.solarDayDays
    const localOrbitDays = planet.siderealOrbitDays / rotationDays
    const localUnit = rotationKind.value === 'sidereal' ? 'sid. d' : 'sol. d'
    return {
      planet,
      rotation: {
        primary: formatQuantity(rotationDays * HOURS_PER_DAY, 'h'),
        secondary: formatQuantity(rotationDays, 'd'),
        spin: `Spin axis tilted ${formatDeg(planet.obliquity)} from ecliptic north${
          planet.retrograde ? ' — rotates retrograde' : ''
        }`,
      },
      orbit:
        orbitUnit.value === 'earth'
          ? {
              primary: formatQuantity(planet.siderealOrbitDays, 'd'),
              secondary: formatQuantity(planet.siderealOrbitDays / JULIAN_YEAR_DAYS, 'yr'),
            }
          : {
              primary: formatQuantity(localOrbitDays, localUnit),
              secondary: '',
            },
    }
  }),
)
</script>

<template>
  <div class="orrery">
    <div class="orrery__diagram">
      <div ref="settingsRoot" class="orrery__settings">
        <button
          type="button"
          class="orrery__settings-btn"
          :aria-expanded="settingsOpen"
          aria-controls="orrery-settings"
          aria-haspopup="true"
          aria-label="Orrery settings"
          @click="toggleSettings"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z"
            />
          </svg>
        </button>
        <Transition name="settings-menu">
          <div
            v-show="settingsOpen"
            id="orrery-settings"
            class="orrery__settings-menu"
            aria-labelledby="orrery-settings-title"
          >
            <p id="orrery-settings-title" class="orrery__settings-title">Display</p>
            <label class="orrery__settings-item">
              <input v-model="showFacing" type="checkbox" />
              Planet facing
            </label>
            <label class="orrery__settings-item">
              <input v-model="showSunFacing" type="checkbox" />
              Sun facing
            </label>
            <label class="orrery__settings-item">
              <input v-model="showPerihelion" type="checkbox" />
              Perihelion
            </label>
          </div>
        </Transition>
      </div>
      <svg
        class="orrery__svg"
        :viewBox="viewBox"
        role="img"
        aria-label="Solar system orrery with evenly spaced orbits, Earth perihelion at the top"
      >
        <title>
          {{ live ? 'Solar system now' : `Solar system at ${snapshot.at.toISOString()}` }}
        </title>
        <desc>
          Concentric rings for Mercury through Neptune. Earth's perihelion is at the top, aphelion
          at the bottom. Planets sit at their heliocentric longitude for the selected time, each
          with a short whisker showing where its prime meridian points in the selected longitude
          system. The Sun at the center carries the same whisker for its Carrington prime meridian.
        </desc>
        <line class="axis" :x1="cx" :y1="cy - outerR - 1" :x2="cx" :y2="cy + outerR + 1" />
        <text class="axis-label" :x="perihelionMark.x" :y="perihelionMark.y" text-anchor="middle">
          ⊕
          <tspan baseline-shift="sub" font-size="0.75em">peri</tspan>
          <title>Perihelion - Nearest Point to the Sun</title>
        </text>
        <text class="axis-label" :x="aphelionMark.x" :y="aphelionMark.y + 2.2" text-anchor="middle">
          ⊕
          <tspan baseline-shift="sub" font-size="0.75em">aph</tspan>
          <title>Aphelion - Farthest Point from the Sun</title>
        </text>
        <g
          v-for="ring in rings"
          :key="ring.planet.id"
          :class="{ selected: selectedPlanet === ring.planet.id }"
          @click="emit('select', ring.planet.id)"
        >
          <title>{{ ring.label }}</title>
          <circle class="orbit" :cx="cx" :cy="cy" :r="ring.r" />
          <line
            v-if="showPerihelion"
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
            :r="ring.bodyR"
            :fill="ring.planet.color"
          />
          <line
            v-if="showFacing"
            class="facing"
            :x1="ring.facingFrom.x"
            :y1="ring.facingFrom.y"
            :x2="ring.facingTo.x"
            :y2="ring.facingTo.y"
            :stroke="ring.planet.color"
          />
        </g>
        <g class="sun-mark">
          <title>{{ sunMark.label }}</title>
          <circle class="sun" :cx="cx" :cy="cy" :r="sunR" />
          <line
            v-if="showSunFacing"
            class="sun-facing"
            :x1="sunMark.from.x"
            :y1="sunMark.from.y"
            :x2="sunMark.to.x"
            :y2="sunMark.to.y"
          />
        </g>
      </svg>
    </div>

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
              <strong>P<sub>rot</sub></strong> is the rotation period in the longitude system chosen
              at the top of the page (IAU cartographic W, magnetic System III, or cloud features).
              Inner planets have only the IAU frame, so magnetic and cloud leave them unchanged.
              Click the heading to switch between a sidereal day (one spin relative to the stars)
              and a solar day (noon to noon). Hover a value for that planet’s axial tilt. The
              whisker on each planet above points where that meridian faces; it shortens as the
              meridian tips out of the ecliptic plane and away from the viewer. The Sun carries one
              too, on the Carrington rate of 25.38 days — a convention rather than a rigid period,
              since the photosphere spins faster at the equator than near the poles.
            </p>
            <p>
              <strong>P<sub>orb</sub></strong> is the sidereal orbital period — one revolution
              around the Sun relative to the stars. Click the heading to express it in Earth days
              and years, or in that planet’s own days (sidereal or solar, matching P<sub>rot</sub>).
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
            <button
              type="button"
              class="th-toggle"
              :aria-label="
                rotationKind === 'sidereal'
                  ? 'Rotation period, sidereal. Click to show solar day.'
                  : 'Rotation period, solar. Click to show sidereal day.'
              "
              @click="toggleRotationKind"
            >
              <span class="th-sym">P<sub>rot</sub></span>
              <span class="th-mode">{{ rotationKind }}</span>
            </button>
          </th>
          <th scope="col">
            <button
              type="button"
              class="th-toggle"
              :aria-label="
                orbitUnit === 'earth'
                  ? 'Orbital period in Earth days and years. Click to show the planet’s own days.'
                  : 'Orbital period in the planet’s own days. Click to show Earth days and years.'
              "
              @click="toggleOrbitUnit"
            >
              <span class="th-sym">P<sub>orb</sub></span>
              <span class="th-mode">{{ orbitUnit === 'earth' ? 'Earth d' : 'own days' }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.planet.id"
          :class="{ selected: selectedPlanet === row.planet.id }"
          :tabindex="tabStopPlanet === row.planet.id ? 0 : -1"
          :aria-current="selectedPlanet === row.planet.id ? 'true' : undefined"
          @click="emit('select', row.planet.id)"
          @focus="focusedPlanet = row.planet.id"
          @keydown="onRowKeydown($event, row.planet.id)"
        >
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
            <span v-if="row.orbit.secondary" class="pair pair--dim">{{ row.orbit.secondary }}</span>
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

.orrery__diagram {
  position: relative;
}

.orrery__settings {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
}

.orrery__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-raised) 85%, transparent);
  color: $color-text-muted;
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease;
}

.orrery__settings-btn svg {
  width: 0.95rem;
  height: 0.95rem;
  transition: transform 250ms ease;
}

.orrery__settings-btn:hover,
.orrery__settings-btn:focus-visible,
.orrery__settings-btn[aria-expanded='true'] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  outline: none;
}

.orrery__settings-btn:hover svg,
.orrery__settings-btn[aria-expanded='true'] svg {
  transform: rotate(45deg);
}

.orrery__settings-menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  min-width: 10.5rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: $radius-md;
  background: color-mix(in srgb, var(--bg-raised) 94%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 45%);
  transform-origin: top right;
}

.orrery__settings-title {
  margin: 0;
  padding: 0.25rem 0.5rem 0.35rem;
  color: $color-text-muted;
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.orrery__settings-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: $radius-sm;
  color: $color-text-muted;
  font-size: 0.75rem;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.orrery__settings-item:hover,
.orrery__settings-item:focus-within {
  background: color-mix(in srgb, var(--border) 40%, transparent);
  color: var(--text);
}

.orrery__settings-item:has(input:checked) {
  color: var(--text);
}

.orrery__settings-item input {
  appearance: none;
  display: grid;
  place-content: center;
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  margin: 0;
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease;
}

// Checkmark scaled to nothing while unchecked, so only the transform animates.
.orrery__settings-item input::after {
  content: '';
  width: 0.55rem;
  height: 0.55rem;
  background: var(--bg);
  clip-path: polygon(14% 44%, 0 65%, 40% 100%, 100% 16%, 84% 0%, 38% 68%);
  transform: scale(0);
  transition: transform 120ms ease;
}

.orrery__settings-item input:checked {
  border-color: var(--accent);
  background: var(--accent);
}

.orrery__settings-item input:checked::after {
  transform: scale(1);
}

.orrery__settings-item input:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
}

.settings-menu-enter-active,
.settings-menu-leave-active {
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-0.15rem);
}

@media (prefers-reduced-motion: reduce) {
  .orrery__settings-btn svg,
  .orrery__settings-item input,
  .orrery__settings-item input::after,
  .settings-menu-enter-active,
  .settings-menu-leave-active {
    transition: none;
  }

  .orrery__settings-btn:hover svg,
  .orrery__settings-btn[aria-expanded='true'] svg {
    transform: none;
  }
}

.orrery__svg {
  width: 100%;
  height: auto;
  display: block;

  // The Sun is the frame of reference, not a selectable body, so it neither
  // offers a pointer nor dims behind a selection.
  g:not(.sun-mark) {
    cursor: pointer;

    &:hover {
      opacity: 0.6;
    }

    &.selected:hover {
      opacity: 0.8;
    }
  }

  &:has(g.selected) {
    g:not(.selected):not(:hover):not(.sun-mark) {
      opacity: 0.4;
    }
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

.facing {
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.55;

  g.selected & {
    opacity: 0.95;
  }
}

.sun {
  fill: var(--accent);
}

.sun-facing {
  stroke: var(--accent);
  stroke-width: 0.32;
  stroke-linecap: round;
  opacity: 0.7;
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

.th-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.th-toggle:hover .th-mode,
.th-toggle:focus-visible {
  color: var(--text);
}

.th-toggle:focus-visible {
  outline: none;
}

.th-mode {
  font-size: 0.65rem;
  font-weight: 400;
  letter-spacing: 0.01em;
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

tbody tr {
  cursor: pointer;

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: -1px;
  }

  &:hover {
    box-shadow: 0px 0px 20px 0px var(--border) inset;
  }

  &.selected {
    box-shadow: 0px 0px 25px 0px var(--border-strong) inset;
  }

  &.selected:hover {
    box-shadow:
      0px 0px 15px -3px var(--border-strong),
      0px 0px 30px 0px var(--border-strong) inset;
  }
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
