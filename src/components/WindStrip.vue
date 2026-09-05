<script setup lang="ts">
import { computed, ref } from 'vue'
import { SOLAR_WIND, solarWindBounds, type SolarWindArchive } from '../lib/solarWind.ts'

const props = withDefaults(
  defineProps<{
    at: Date
    archive?: SolarWindArchive
  }>(),
  {
    archive: () => SOLAR_WIND,
  },
)

const emit = defineEmits<{
  seek: [at: Date]
}>()

const MS_PER_DAY = 86_400_000
const width = 100
const height = 18
const svgEl = ref<SVGSVGElement | null>(null)

const bounds = computed(() => solarWindBounds(Date.now(), props.archive))
const lastMs = computed(
  () => props.archive.startMs + (props.archive.pdynNPa.length - 1) * MS_PER_DAY,
)

const series = computed(() => {
  const values = props.archive.pdynNPa
  const peak = Math.max(8, ...values)
  const y = (p: number) => height - 1.2 - (Math.min(p, peak) / peak) * (height - 2.4)
  const x = (ms: number) =>
    ((ms - bounds.value.fromMs) / Math.max(1, bounds.value.toMs - bounds.value.fromMs)) * width
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < values.length; i++) {
    const p = values[i]
    if (!(p > 0)) continue
    points.push({ x: x(props.archive.startMs + i * MS_PER_DAY), y: y(p) })
  }
  const last = [...values].reverse().find((p) => p > 0) ?? 2
  if (bounds.value.toMs > lastMs.value) {
    points.push({ x: x(bounds.value.toMs), y: y(last) })
  }
  return { points, peak, x, last }
})

const path = computed(() => {
  const pts = series.value.points
  if (pts.length < 2) return ''
  return pts.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
})

const playheadX = computed(() => {
  const { fromMs, toMs } = bounds.value
  const t = (props.at.getTime() - fromMs) / Math.max(1, toMs - fromMs)
  return Math.min(width, Math.max(0, t * width))
})

function seek(event: PointerEvent) {
  const svg = svgEl.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  const t = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const ms = bounds.value.fromMs + t * (bounds.value.toMs - bounds.value.fromMs)
  emit('seek', new Date(ms))
}

let dragging = false

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  dragging = true
  svgEl.value?.setPointerCapture(event.pointerId)
  seek(event)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging) return
  seek(event)
}

function onPointerUp() {
  dragging = false
}
</script>

<template>
  <svg
    ref="svgEl"
    class="wind-strip"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    role="slider"
    aria-label="Solar-wind dynamic pressure over the OMNI archive. Click or drag to set the date."
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <path class="wind-strip__series" :d="path" />
    <line class="wind-strip__now" :x1="playheadX" :x2="playheadX" y1="0" :y2="height" />
  </svg>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

/**
 * `preserveAspectRatio: none` lets the series span the panel instead of being
 * letterboxed to the viewBox ratio, which also keeps it aligned with the
 * pointer mapping in `seek`. Strokes opt out of the resulting anisotropic
 * scaling so a day spike stays as thin as the playhead.
 */
.wind-strip {
  display: block;
  width: 100%;
  height: 3.5rem;
  cursor: ew-resize;
  touch-action: none;
}

.wind-strip__series,
.wind-strip__now {
  vector-effect: non-scaling-stroke;
}

.wind-strip__series {
  fill: none;
  stroke: color-mix(in srgb, $color-accent 70%, $color-border);
  stroke-width: 1;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.wind-strip__now {
  stroke: $color-accent;
  stroke-width: 1;
  opacity: 0.85;
}
</style>
