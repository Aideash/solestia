<script setup lang="ts">
import { computed } from 'vue'
import type { ClockDriver } from '../lib/clocks.ts'

const props = defineProps<{
  at: Date
  driver: ClockDriver
  locale?: string
}>()

const cx = 50
const cy = 50
const faceRadius = 42
const tickOuter = 40
const majorTickInner = 34
const minorTickInner = 37.5
const numberRadius = 28
const majorHandLength = 22
const middleHandLength = 30
const minorHandLength = 32

function dialPoint(radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * Math.PI * 2
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  }
}

const dial = computed(() => props.driver.dial)
const hands = computed(() => props.driver.hands(props.at))
const label = computed(() => props.driver.label(props.at, props.locale))
const numerals = computed(() =>
  props.driver.numerals(props.locale).map((numeral) => {
    const point = dialPoint(numberRadius, numeral.fraction)
    return { ...numeral, x: point.x, y: point.y }
  }),
)

const majorHand = computed(() => dialPoint(majorHandLength, hands.value.major))
const middleHand = computed(() => dialPoint(middleHandLength, hands.value.middle))
const minorHand = computed(() =>
  hands.value.minor === null ? null : dialPoint(minorHandLength, hands.value.minor),
)

const majorTicks = computed(() =>
  Array.from({ length: dial.value.majorTicks }, (_, i) => {
    const fraction = i / dial.value.majorTicks
    const from = dialPoint(majorTickInner, fraction)
    const to = dialPoint(tickOuter, fraction)
    return { key: i, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  }),
)

const minorTicks = computed(() => {
  const { majorTicks: majors, minorTicks: minors } = dial.value
  if (minors <= majors) return []
  return Array.from({ length: minors }, (_, i) => {
    if ((i * majors) % minors === 0) return null
    const fraction = i / minors
    const from = dialPoint(minorTickInner, fraction)
    const to = dialPoint(tickOuter, fraction)
    return { key: i, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
  }).filter((tick) => tick !== null)
})

const denseNumerals = computed(() => numerals.value.length >= 20)
</script>

<template>
  <div class="analog">
    <svg class="analog__dial" viewBox="0 0 100 100" role="img" :aria-label="label">
      <title>{{ label }}</title>
      <circle class="analog__edge" :cx="cx" :cy="cy" :r="faceRadius + 2" />
      <circle class="analog__face" :cx="cx" :cy="cy" :r="faceRadius" />
      <line
        v-for="tick in minorTicks"
        :key="`min-${tick.key}`"
        class="analog__tick analog__tick--minute"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
      />
      <line
        v-for="tick in majorTicks"
        :key="`hour-${tick.key}`"
        class="analog__tick analog__tick--hour"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
      />
      <text
        v-for="numeral in numerals"
        :key="numeral.key"
        class="analog__numeral"
        :class="{ 'analog__numeral--dense': denseNumerals }"
        :x="numeral.x"
        :y="numeral.y"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ numeral.text }}
      </text>
      <line
        class="analog__hand analog__hand--hour"
        :x1="cx"
        :y1="cy"
        :x2="majorHand.x"
        :y2="majorHand.y"
      />
      <line
        class="analog__hand analog__hand--minute"
        :x1="cx"
        :y1="cy"
        :x2="middleHand.x"
        :y2="middleHand.y"
      />
      <line
        v-if="minorHand"
        class="analog__hand analog__hand--second"
        :x1="cx"
        :y1="cy"
        :x2="minorHand.x"
        :y2="minorHand.y"
      />
      <circle class="analog__hub" :cx="cx" :cy="cy" r="2.2" />
    </svg>
    <p class="analog__readout">{{ label }}</p>
    <span class="update-note" :class="{ visible: !driver.id?.includes('civil') }"
      >* Clock updates once an SI-second regardless of mode used</span
    >
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.analog {
  /** Multiplier on the dial's full-size footprint. */
  --analog-scale: 1;

  display: grid;
  justify-items: center;
  gap: $spacing-sm;
}

.analog__dial {
  display: block;
  width: 100%;
  max-width: calc(16rem * var(--analog-scale));
  height: auto;
}

.analog__edge {
  fill: none;
  stroke: var(--border);
  stroke-width: 0.4;
}

.analog__face {
  fill: var(--bg-raised);
  stroke: var(--border);
  stroke-width: 0.4;
}

.analog__tick {
  stroke: var(--text-dim);
}

.analog__tick--minute {
  stroke-width: 0.5;
  stroke: color-mix(in srgb, var(--text-dim) 55%, transparent);
}

.analog__tick--hour {
  stroke-width: 1.2;
}

.analog__numeral {
  fill: var(--text);
  font-size: 7px;
  font-weight: 500;
}

.analog__numeral--dense {
  font-size: 4.2px;
}

.analog__hand {
  stroke-linecap: round;
}

.analog__hand--hour {
  stroke: var(--text);
  stroke-width: 2.2;
}

.analog__hand--minute {
  stroke: var(--text);
  stroke-width: 1.4;
}

.analog__hand--second {
  stroke: var(--accent);
  stroke-width: 0.8;
}

.analog__hub {
  fill: var(--accent);
}

.analog__readout {
  margin: 0;
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: calc(0.8125rem * var(--analog-scale));
  text-align: center;
}

.update-note {
  font-size: 0.75rem;
  color: $color-text-muted;
  text-align: center;
  margin-top: $spacing-xs;
  opacity: 0;
  transition: opacity 150ms ease;
  &.visible {
    opacity: 0.8;
  }
}
</style>
