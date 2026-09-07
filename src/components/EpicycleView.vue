<script setup lang="ts">
import { computed, ref } from 'vue'
import { EPICYCLE_PLANET_IDS } from '../data/generated/epicycleFits.ts'
import { PLANETS } from '../data/planets.ts'
import {
  angleErrorRad,
  circlePeriodDays,
  distanceComparisonAt,
  epicycleDisplayShells,
  epicycleModelAt,
  geocentricBodyAt,
  type DistanceCalibration,
  type EpicycleDepth,
  type EpicycleModelState,
  type EpicyclePlanetId,
  type Point2,
} from '../lib/epicycles.ts'

const props = defineProps<{ at: Date }>()

type HoveredCircle = {
  planet: string
  index: number
  radius: number
  periodDays: number
  retrograde: boolean
}

const depth = ref<EpicycleDepth>(2)
const calibration = ref<DistanceCalibration>('modern-mean')
const showTracks = ref(true)
const showArmature = ref(true)
const selectedId = ref<EpicyclePlanetId | null>(null)
const hoveredCircle = ref<HoveredCircle | null>(null)
const hoveredPlanetId = ref<EpicyclePlanetId | null>(null)

const planetCatalog = new Map(PLANETS.map((planet) => [planet.id, planet]))
function planetMeta(id: 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn') {
  const planet = planetCatalog.get(id)
  if (!planet?.symbol) throw new Error(`Missing metadata for ${id}`)
  return { name: planet.name, symbol: planet.symbol, color: planet.color }
}

const bodyCatalog: Record<EpicyclePlanetId, { name: string; symbol: string; color: string }> = {
  moon: { name: 'Moon', symbol: '☾', color: '#cbd2df' },
  mercury: planetMeta('mercury'),
  venus: planetMeta('venus'),
  sun: { name: 'Sun', symbol: '☉', color: '#f5c542' },
  mars: planetMeta('mars'),
  jupiter: planetMeta('jupiter'),
  saturn: planetMeta('saturn'),
}

const viewScale = 42
const center = 50

function screenPoint(point: Point2): Point2 {
  return { x: center + point.x * viewScale, y: center - point.y * viewScale }
}

function polarPoint(radius: number, angle: number): Point2 {
  return {
    x: center + radius * Math.cos(angle),
    y: center - radius * Math.sin(angle),
  }
}

function errorArc(actual: number, error: number, radius: number): string {
  const start = polarPoint(radius, actual)
  const finish = polarPoint(radius, actual + error)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${error < 0 ? 1 : 0} ${finish.x} ${finish.y}`
}

type DisplayArm = {
  center: Point2
  endpoint: Point2
  radius: number
  circle: EpicycleModelState['arms'][number]['circle']
}

type DisplayConstruction = {
  arms: DisplayArm[]
  deferentCenter: Point2
  equantPoint: Point2
}

function rotatePoint(point: Point2, angle: number): Point2 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

function displayConstruction(
  model: EpicycleModelState,
  shell: { inner: number; outer: number },
): DisplayConstruction {
  const radii =
    model.arms.length === 1
      ? [shell.outer]
      : (() => {
          const primary = (shell.inner + shell.outer) / 2
          const childBudget = (shell.outer - shell.inner) / 2
          const fittedChildTotal = model.arms
            .slice(1)
            .reduce((sum, arm) => sum + arm.circle.radius, 0)
          if (fittedChildTotal < 1e-12) {
            return [shell.outer, ...model.arms.slice(1).map(() => 0)]
          }
          return [
            primary,
            ...model.arms
              .slice(1)
              .map((arm) => childBudget * (arm.circle.radius / fittedChildTotal)),
          ]
        })()

  const apsisAngle = Math.atan2(model.deferentCenter.y, model.deferentCenter.x)
  const rawDeferentCenter = {
    x: model.fit.eccentricity * radii[0] * Math.cos(apsisAngle),
    y: model.fit.eccentricity * radii[0] * Math.sin(apsisAngle),
  }
  const rawEquantPoint = { x: rawDeferentCenter.x * 2, y: rawDeferentCenter.y * 2 }
  let point: Point2 = rawDeferentCenter
  const rawArms = radii.map((radius, index) => {
    const centerPoint = point
    const angle = model.arms[index].angleRad
    const endpoint = {
      x: centerPoint.x + radius * Math.cos(angle),
      y: centerPoint.y + radius * Math.sin(angle),
    }
    point = endpoint
    return { center: centerPoint, endpoint, radius, circle: model.arms[index].circle }
  })
  const correction = model.longitudeRad - Math.atan2(point.y, point.x)
  return {
    arms: rawArms.map((arm) => ({
      ...arm,
      center: rotatePoint(arm.center, correction),
      endpoint: rotatePoint(arm.endpoint, correction),
    })),
    deferentCenter: rotatePoint(rawDeferentCenter, correction),
    equantPoint: rotatePoint(rawEquantPoint, correction),
  }
}

const scenes = computed(() =>
  EPICYCLE_PLANET_IDS.map((id) => {
    const body = bodyCatalog[id]
    const model = epicycleModelAt(id, props.at, depth.value)
    const actual = geocentricBodyAt(id, props.at)
    const error = angleErrorRad(model.longitudeRad, actual.longitudeRad)
    const distance = distanceComparisonAt(id, props.at, depth.value, calibration.value)
    const packedShell = epicycleDisplayShells(depth.value)[id]
    const shell = selectedId.value
      ? depth.value === 1
        ? { inner: 0.86, outer: 0.86 }
        : { inner: 0.14, outer: 0.96 }
      : packedShell
    const construction = displayConstruction(model, shell)
    const arms = construction.arms
    const displayPosition = arms.at(-1)!.endpoint
    const displayDistance = Math.hypot(displayPosition.x, displayPosition.y)
    const endpoint = screenPoint(displayPosition)
    const actualEndpoint = polarPoint(displayDistance * viewScale, actual.longitudeRad)
    const symbolPoint =
      depth.value === 1 ? { x: endpoint.x + 2.2, y: endpoint.y + 3.2 } : screenPoint(arms[1].center)
    return {
      id,
      name: body.name,
      symbol: body.symbol ?? body.name[0],
      color: body.color,
      model,
      actual,
      error,
      distance,
      arms,
      deferentCenter: construction.deferentCenter,
      equantPoint: construction.equantPoint,
      endpoint,
      actualEndpoint,
      symbolPoint,
      arcPath: errorArc(actual.longitudeRad, error, Math.max(7, displayDistance * viewScale)),
    }
  }),
)

const visibleScenes = computed(() =>
  selectedId.value ? scenes.value.filter((scene) => scene.id === selectedId.value) : scenes.value,
)
const selectedScene = computed(() =>
  selectedId.value ? scenes.value.find((scene) => scene.id === selectedId.value) : undefined,
)
const hoveredPlanet = computed(() =>
  hoveredPlanetId.value
    ? scenes.value.find((scene) => scene.id === hoveredPlanetId.value)
    : undefined,
)

function toggleSelection(id: EpicyclePlanetId) {
  selectedId.value = selectedId.value === id ? null : id
  hoveredCircle.value = null
  hoveredPlanetId.value = null
}

function setDepth(value: number) {
  if (value >= 1 && value <= 4) depth.value = value as EpicycleDepth
  hoveredCircle.value = null
  hoveredPlanetId.value = null
}

function hoverCircle(scene: (typeof scenes.value)[number], index: number) {
  hoveredPlanetId.value = null
  const circle = scene.arms[index].circle
  hoveredCircle.value = {
    planet: scene.name,
    index,
    radius: circle.radius,
    periodDays: circlePeriodDays(circle),
    retrograde: circle.rateRadPerDay < 0,
  }
}

function hoverPlanet(id: EpicyclePlanetId) {
  hoveredCircle.value = null
  hoveredPlanetId.value = id
}

function clearPlanetHover(id: EpicyclePlanetId) {
  if (hoveredPlanetId.value === id) hoveredPlanetId.value = null
}

function clearCircleHover(scene: (typeof scenes.value)[number], index: number) {
  if (hoveredCircle.value?.planet === scene.name && hoveredCircle.value.index === index) {
    hoveredCircle.value = null
  }
}

function formatLongitude(radians: number): string {
  return `${((radians * 180) / Math.PI).toFixed(1)}°`
}

function formatError(radians: number): string {
  const degrees = (radians * 180) / Math.PI
  return `${degrees >= 0 ? '+' : '−'}${Math.abs(degrees).toFixed(2)}°`
}

function formatDistance(value: number, unit: string): string {
  const digits = unit === 'AU' ? 3 : value >= 10_000 ? 0 : 1
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`
}

function formatPeriod(days: number): string {
  if (days < 730) return `${days.toFixed(days < 100 ? 1 : 0)} d`
  return `${(days / 365.25).toFixed(2)} yr`
}

function formatRadius(radius: number): string {
  return radius < 0.001 ? radius.toPrecision(2) : radius.toFixed(3)
}
</script>

<template>
  <section class="epicycle-studio" aria-label="Geocentric epicycle model">
    <div class="toolbar">
      <div class="control-group" aria-label="Circle depth">
        <span class="control-label">circles</span>
        <button
          v-for="value in 4"
          :key="value"
          type="button"
          :class="{ active: depth === value }"
          :aria-pressed="depth === value"
          @click="setDepth(value)"
        >
          {{ value }}
        </button>
      </div>

      <div class="control-group" aria-label="Distance calibration">
        <span class="control-label">distance</span>
        <button
          type="button"
          :class="{ active: calibration === 'modern-mean' }"
          :aria-pressed="calibration === 'modern-mean'"
          @click="calibration = 'modern-mean'"
        >
          modern mean
        </button>
        <button
          type="button"
          :class="{ active: calibration === 'ptolemaic' }"
          :aria-pressed="calibration === 'ptolemaic'"
          @click="calibration = 'ptolemaic'"
        >
          Ptolemaic
        </button>
      </div>

      <label class="visibility-toggle">
        <input v-model="showTracks" type="checkbox" />
        tracks
      </label>
      <label class="visibility-toggle">
        <input v-model="showArmature" type="checkbox" />
        armature
      </label>
    </div>

    <div class="stage" :class="{ 'stage--focused': selectedId }">
      <svg
        class="orrery"
        viewBox="0 0 100 100"
        role="img"
        :aria-label="
          selectedScene
            ? `${selectedScene.name} epicycle construction`
            : 'Seven-body geocentric epicycle overview'
        "
      >
        <circle class="reference-ring" cx="50" cy="50" r="40.5" />
        <path class="cardinal" d="M 50 6 V 94 M 6 50 H 94" />

        <g
          v-for="scene in visibleScenes"
          :key="scene.id"
          class="planet-chain"
          :class="{ selected: selectedId === scene.id }"
          :style="{ '--planet-color': scene.color }"
        >
          <g v-if="selectedId === scene.id && showArmature" class="equant-construction">
            <line
              class="apsidal-line"
              x1="50"
              y1="50"
              :x2="screenPoint(scene.equantPoint).x"
              :y2="screenPoint(scene.equantPoint).y"
            />
            <line
              class="equant-ray"
              :x1="screenPoint(scene.equantPoint).x"
              :y1="screenPoint(scene.equantPoint).y"
              :x2="screenPoint(scene.arms[0].endpoint).x"
              :y2="screenPoint(scene.arms[0].endpoint).y"
            />
            <circle
              class="deferent-center"
              :cx="screenPoint(scene.deferentCenter).x"
              :cy="screenPoint(scene.deferentCenter).y"
              r="0.65"
            />
            <circle
              class="equant-point"
              :cx="screenPoint(scene.equantPoint).x"
              :cy="screenPoint(scene.equantPoint).y"
              r="0.65"
            />
          </g>
          <g v-for="(arm, index) in scene.arms" :key="index">
            <circle
              v-if="showTracks"
              class="orbit-track"
              :cx="screenPoint(arm.center).x"
              :cy="screenPoint(arm.center).y"
              :r="arm.radius * viewScale"
            />
            <line
              v-if="showArmature"
              class="armature"
              :x1="screenPoint(arm.center).x"
              :y1="screenPoint(arm.center).y"
              :x2="screenPoint(arm.endpoint).x"
              :y2="screenPoint(arm.endpoint).y"
            />
            <circle
              class="circle-target"
              :cx="screenPoint(arm.center).x"
              :cy="screenPoint(arm.center).y"
              :r="arm.radius * viewScale"
              tabindex="0"
              :aria-label="`${scene.name} circle ${index + 1}, radius ${formatRadius(arm.circle.radius)} relative units, period ${formatPeriod(circlePeriodDays(arm.circle))}`"
              @mouseenter="hoverCircle(scene, index)"
              @mouseleave="clearCircleHover(scene, index)"
              @focus="hoverCircle(scene, index)"
              @blur="clearCircleHover(scene, index)"
            />
          </g>

          <line
            class="actual-ray"
            x1="50"
            y1="50"
            :x2="scene.actualEndpoint.x"
            :y2="scene.actualEndpoint.y"
          />
          <path class="error-arc" :d="scene.arcPath" />
          <circle
            class="actual-point"
            :cx="scene.actualEndpoint.x"
            :cy="scene.actualEndpoint.y"
            r="1.25"
          />
          <circle class="predicted-point" :cx="scene.endpoint.x" :cy="scene.endpoint.y" r="1.4" />
          <g
            class="planet-hit"
            role="button"
            tabindex="0"
            :aria-label="`${selectedId === scene.id ? 'Return to overview from' : 'Inspect'} ${scene.name}`"
            @click="toggleSelection(scene.id)"
            @keydown.enter.prevent="toggleSelection(scene.id)"
            @keydown.space.prevent="toggleSelection(scene.id)"
            @mouseenter="hoverPlanet(scene.id)"
            @mouseleave="clearPlanetHover(scene.id)"
            @focus="hoverPlanet(scene.id)"
            @blur="clearPlanetHover(scene.id)"
          >
            <circle class="planet-target" :cx="scene.endpoint.x" :cy="scene.endpoint.y" r="3.2" />
            <circle
              class="planet-focus-ring"
              :cx="scene.endpoint.x"
              :cy="scene.endpoint.y"
              r="1.85"
            />
          </g>
          <text
            class="planet-symbol"
            :x="scene.symbolPoint.x"
            :y="scene.symbolPoint.y"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ scene.symbol }}
          </text>
        </g>

        <circle class="earth" cx="50" cy="50" r="2.25" />
        <text class="earth-symbol" x="50" y="50.2" text-anchor="middle" dominant-baseline="middle">
          ⊕
        </text>
      </svg>

      <button v-if="selectedId" type="button" class="overview-button" @click="selectedId = null">
        Show all planets
      </button>
      <p class="diagram-key">
        <span><i class="dot dot--predicted"></i>model</span>
        <span><i class="dot dot--actual"></i>actual angle</span>
        <span><i class="line-key"></i>longitude error</span>
      </p>
      <div class="circle-callout" aria-live="polite">
        <template v-if="hoveredPlanet">
          <strong>{{ hoveredPlanet.symbol }} {{ hoveredPlanet.name }}</strong>
          <span>
            Deferent eccentricity:
            <b>{{ hoveredPlanet.model.fit.eccentricity.toFixed(3) }}</b
            >; bisected equant
            <template v-if="Math.abs(hoveredPlanet.model.fit.apsisRateRadPerDay) > 1e-12">
              , apsis period
              {{
                formatPeriod((Math.PI * 2) / Math.abs(hoveredPlanet.model.fit.apsisRateRadPerDay))
              }}
            </template>
          </span>
          <span v-for="(arm, index) in hoveredPlanet.model.arms" :key="index">
            {{ index === 0 ? 'Deferent' : `Epicycle ${index}` }}:
            <b>{{ formatRadius(arm.circle.radius) }}</b> relative radius,
            {{ formatPeriod(circlePeriodDays(arm.circle)) }}
          </span>
        </template>
        <span v-else-if="hoveredCircle">
          {{ hoveredCircle.planet }}, circle {{ hoveredCircle.index + 1 }}:
          <strong>{{ formatRadius(hoveredCircle.radius) }}</strong> relative radius,
          {{ formatPeriod(hoveredCircle.periodDays) }}
          {{ hoveredCircle.retrograde ? 'clockwise' : 'counterclockwise' }}
        </span>
        <span v-else>Hover or focus a planet to inspect all of its circles.</span>
      </div>
    </div>

    <div class="comparison-wrap">
      <table class="comparison">
        <thead>
          <tr>
            <th scope="col">Planet</th>
            <th scope="col">Model λ</th>
            <th scope="col">Actual λ</th>
            <th scope="col">Error</th>
            <th scope="col">Model distance</th>
            <th scope="col">Actual distance</th>
            <th scope="col">Distance error</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="scene in scenes"
            :key="scene.id"
            :class="{ selected: selectedId === scene.id }"
            @click="toggleSelection(scene.id)"
          >
            <th scope="row">
              <button type="button" @click.stop="toggleSelection(scene.id)">
                <span :style="{ color: scene.color }">{{ scene.symbol }}</span>
                {{ scene.name }}
              </button>
            </th>
            <td>{{ formatLongitude(scene.model.longitudeRad) }}</td>
            <td>{{ formatLongitude(scene.actual.longitudeRad) }}</td>
            <td :class="{ 'large-error': Math.abs(scene.error) > Math.PI / 36 }">
              {{ formatError(scene.error) }}
            </td>
            <td>{{ formatDistance(scene.distance.model, scene.distance.unit) }}</td>
            <td>{{ formatDistance(scene.distance.actual, scene.distance.unit) }}</td>
            <td>{{ formatDistance(scene.distance.error, scene.distance.unit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selectedScene" class="circle-list">
      <h2>{{ selectedScene.symbol }} {{ selectedScene.name }} circles</h2>
      <ol>
        <li v-for="(arm, index) in selectedScene.model.arms" :key="index">
          <span>{{ index === 0 ? 'Deferent' : `Epicycle ${index}` }}</span>
          <strong>{{ formatRadius(arm.circle.radius) }}</strong>
          <span>{{ formatPeriod(circlePeriodDays(arm.circle)) }}</span>
          <span>{{ arm.circle.rateRadPerDay < 0 ? 'clockwise' : 'counterclockwise' }}</span>
        </li>
      </ol>
      <p>
        The deferent center is offset {{ selectedScene.model.fit.eccentricity.toFixed(3) }} of its
        radius from Earth; the equant lies the same distance beyond that center.
        <template v-if="Math.abs(selectedScene.model.fit.apsisRateRadPerDay) > 1e-12">
          Its apsis completes one turn in
          {{ formatPeriod((Math.PI * 2) / Math.abs(selectedScene.model.fit.apsisRateRadPerDay)) }}.
        </template>
      </p>
      <p>
        1800–2050 fit: {{ selectedScene.model.fit.rmsErrorDeg.toFixed(2) }}° RMS,
        {{ selectedScene.model.fit.maxErrorDeg.toFixed(2) }}° maximum.
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.epicycle-studio {
  width: min(100%, 66rem);
  margin: 0 auto;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: $spacing-sm $spacing-lg;
  margin-bottom: $spacing-md;
  color: $color-text-muted;
  font-size: 0.75rem;
}

.control-group {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.control-label {
  margin-right: 0.25rem;
}

.control-group button,
.overview-button {
  border: 1px solid transparent;
  border-radius: $radius-sm;
  padding: 0.22rem 0.45rem;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.control-group button:hover,
.control-group button:focus-visible,
.control-group button.active,
.overview-button:hover,
.overview-button:focus-visible {
  border-color: $color-border;
  color: $color-text;
  outline: none;
}

.control-group button.active {
  background: $color-surface;
  border-color: var(--border-strong);
}

.visibility-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
}

.visibility-toggle input {
  accent-color: $color-accent;
}

.stage {
  position: relative;
  width: min(100%, 42rem);
  margin: 0 auto;
}

.orrery {
  display: block;
  width: 100%;
  overflow: visible;
}

.reference-ring,
.orbit-track {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.reference-ring {
  stroke: var(--border);
  stroke-width: 0.35;
  stroke-dasharray: 0.8 1.8;
}

.cardinal {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.18;
  opacity: 0.45;
}

.planet-chain {
  --planet-color: var(--accent);
  color: var(--planet-color);
  transition: opacity 160ms ease;
}

.orbit-track {
  stroke: currentColor;
  stroke-width: 0.45;
  opacity: 0.38;
}

.armature {
  stroke: currentColor;
  stroke-width: 0.38;
  opacity: 0.68;
  vector-effect: non-scaling-stroke;
}

.apsidal-line,
.equant-ray {
  stroke: currentColor;
  vector-effect: non-scaling-stroke;
}

.apsidal-line {
  stroke-width: 0.25;
  opacity: 0.45;
}

.equant-ray {
  stroke-width: 0.32;
  stroke-dasharray: 0.8 0.8;
  opacity: 0.7;
}

.deferent-center,
.equant-point {
  fill: var(--bg);
  stroke: currentColor;
  stroke-width: 0.35;
  vector-effect: non-scaling-stroke;
}

.equant-point {
  fill: currentColor;
}

.actual-ray {
  stroke: var(--text-dim);
  stroke-width: 0.25;
  stroke-dasharray: 1 1.2;
  opacity: 0.5;
}

.error-arc {
  fill: none;
  stroke: var(--red);
  stroke-width: 0.7;
  vector-effect: non-scaling-stroke;
}

.predicted-point {
  fill: currentColor;
}

.actual-point {
  fill: var(--bg);
  stroke: var(--text);
  stroke-width: 0.55;
  vector-effect: non-scaling-stroke;
}

.circle-target {
  fill: none;
  stroke: transparent;
  stroke-width: 2.5;
  cursor: crosshair;
}

.circle-target:focus {
  stroke: var(--text);
  stroke-width: 0.6;
  outline: none;
}

.planet-hit {
  color: inherit;
  cursor: pointer;
  outline: none;
}

.planet-target,
.planet-focus-ring {
  fill: transparent;
  stroke: transparent;
}

.planet-hit:focus-visible .planet-focus-ring {
  stroke: var(--text);
  stroke-width: 0.35;
  vector-effect: non-scaling-stroke;
}

.planet-symbol {
  fill: currentColor;
  font-size: 3.5px;
  font-weight: 650;
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 0.7px;
}

.earth {
  fill: #2c8d69;
  stroke: var(--text);
  stroke-width: 0.35;
}

.earth-symbol {
  fill: var(--text);
  font-size: 3.2px;
  pointer-events: none;
}

.overview-button {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  color: $color-text-muted;
}

.diagram-key,
.circle-callout {
  display: flex;
  justify-content: center;
  gap: $spacing-md;
  margin: 0.25rem 0 0;
  color: $color-text-muted;
  font-size: 0.72rem;
  line-height: 1.45;
}

.circle-callout {
  display: flex;
  min-height: 6.2rem;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  text-align: center;
}

.dot {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  margin-right: 0.3rem;
  border-radius: 50%;
  vertical-align: -0.03rem;
}

.dot--predicted {
  background: $color-accent;
}

.dot--actual {
  border: 1px solid $color-text;
}

.line-key {
  display: inline-block;
  width: 0.8rem;
  margin-right: 0.3rem;
  border-top: 2px solid var(--red);
  vertical-align: 0.2rem;
}

.comparison-wrap {
  margin-top: $spacing-xl;
  overflow-x: auto;
  border-top: 1px solid $color-border;
  border-bottom: 1px solid $color-border;
}

.comparison {
  width: 100%;
  border-collapse: collapse;
  font-family: $font-mono;
  font-size: 0.74rem;
  white-space: nowrap;
  --row-bg: #{$color-bg};
}

.comparison th,
.comparison td {
  padding: 0.6rem 0.7rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  text-align: right;
  font-weight: 400;
}

.comparison thead th {
  color: $color-text-muted;
}

.comparison th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  text-align: left;
  font-family: $font-sans;
  padding-right: 20px;
  background: linear-gradient(to right, var(--row-bg) 85%, transparent 100%);
  box-shadow: 0.4rem 0 0.55rem -0.35rem $color-bg;
}

.comparison tbody tr {
  cursor: pointer;
}

.comparison tbody button {
  padding: 0;
  border: 0;
  background: none;
  color: $color-text;
  font: inherit;
  cursor: pointer;
}

.comparison tbody button span {
  display: inline-block;
  width: 1.25rem;
  font-size: 1rem;
}

/* Registering the property is what makes the row tint animatable. `initial-value`
   has to be computationally independent, so it cannot be the themed `var(--bg)`;
   the table below supplies the real starting color. */
@property --row-bg {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}

.comparison tbody tr {
  cursor: pointer;
  background: var(--row-bg);
  transition: --row-bg 120ms ease;

  > * {
    background: var(--row-bg);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 1px solid color-mix(in srgb, $color-accent 70%, transparent);
    outline-offset: -1px;
  }

  &:hover {
    --row-bg: #{color-mix(in srgb, $color-text 10%, $color-bg)};
  }

  &.selected {
    --row-bg: #{color-mix(in srgb, $color-accent 15%, $color-bg)};
  }

  &.selected:hover {
    --row-bg: #{color-mix(in srgb, $color-accent 20%, $color-bg)};
  }
}

.large-error {
  color: var(--red);
}

.circle-list {
  width: min(100%, 42rem);
  margin: $spacing-lg auto 0;
  color: $color-text-muted;
  font-size: 0.78rem;
}

.circle-list h2 {
  margin: 0 0 $spacing-sm;
  color: $color-text;
  font-size: 0.9rem;
  font-weight: 600;
}

.circle-list ol {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid $color-border;
}

.circle-list li {
  display: grid;
  grid-template-columns: 1fr repeat(3, minmax(5rem, auto));
  gap: $spacing-md;
  padding: 0.45rem 0;
  border-bottom: 1px solid $color-border;
  font-family: $font-mono;
}

.circle-list strong {
  color: $color-text;
}

.circle-list p {
  margin: $spacing-sm 0 0;
}

@media (max-width: 640px) {
  .toolbar {
    justify-content: flex-start;
    gap: $spacing-sm $spacing-md;
  }

  .circle-list li {
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem $spacing-md;
  }
}

@media (prefers-reduced-motion: reduce) {
  .planet-chain {
    transition: none;
  }
}
</style>
