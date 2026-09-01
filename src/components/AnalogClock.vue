<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  at: Date
}>()

const cx = 50
const cy = 50
const faceRadius = 42
const tickOuter = 40
const hourTickInner = 34
const minuteTickInner = 37.5
const numberRadius = 28
const hourHandLength = 22
const minuteHandLength = 30
const secondHandLength = 32

function dialPoint(radius: number, fraction: number): { x: number; y: number } {
  const angle = fraction * Math.PI * 2
  return {
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  }
}

const hours = computed(() => props.at.getHours())
const minutes = computed(() => props.at.getMinutes())
const seconds = computed(() => props.at.getSeconds())

const hourFraction = computed(
  () => ((hours.value % 12) + minutes.value / 60 + seconds.value / 3600) / 12,
)
const minuteFraction = computed(() => (minutes.value + seconds.value / 60) / 60)
const secondFraction = computed(() => seconds.value / 60)

const hourHand = computed(() => dialPoint(hourHandLength, hourFraction.value))
const minuteHand = computed(() => dialPoint(minuteHandLength, minuteFraction.value))
const secondHand = computed(() => dialPoint(secondHandLength, secondFraction.value))

const hourTicks = Array.from({ length: 12 }, (_, i) => {
  const fraction = i / 12
  const from = dialPoint(hourTickInner, fraction)
  const to = dialPoint(tickOuter, fraction)
  return { key: i, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
})

const minuteTicks = Array.from({ length: 60 }, (_, i) => {
  if (i % 5 === 0) return null
  const fraction = i / 60
  const from = dialPoint(minuteTickInner, fraction)
  const to = dialPoint(tickOuter, fraction)
  return { key: i, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
}).filter((tick) => tick !== null)

const numerals = Array.from({ length: 12 }, (_, i) => {
  const hour = i === 0 ? 12 : i
  const point = dialPoint(numberRadius, i / 12)
  return { key: hour, hour, x: point.x, y: point.y }
})

const zone = computed(() => {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(props.at)
    .find((entry) => entry.type === 'timeZoneName')
  return part?.value ?? ''
})

const digital = computed(() =>
  props.at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }),
)

const label = computed(() => {
  const parts = [digital.value]
  if (zone.value) parts.push(zone.value)
  return parts.join(' ')
})
</script>

<template>
  <div class="analog">
    <svg class="analog__dial" viewBox="0 0 100 100" role="img" :aria-label="label">
      <title>{{ label }}</title>
      <circle class="analog__edge" :cx="cx" :cy="cy" :r="faceRadius + 2" />
      <circle class="analog__face" :cx="cx" :cy="cy" :r="faceRadius" />
      <line
        v-for="tick in minuteTicks"
        :key="`min-${tick.key}`"
        class="analog__tick analog__tick--minute"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
      />
      <line
        v-for="tick in hourTicks"
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
        :x="numeral.x"
        :y="numeral.y"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {{ numeral.hour }}
      </text>
      <line
        class="analog__hand analog__hand--hour"
        :x1="cx"
        :y1="cy"
        :x2="hourHand.x"
        :y2="hourHand.y"
      />
      <line
        class="analog__hand analog__hand--minute"
        :x1="cx"
        :y1="cy"
        :x2="minuteHand.x"
        :y2="minuteHand.y"
      />
      <line
        class="analog__hand analog__hand--second"
        :x1="cx"
        :y1="cy"
        :x2="secondHand.x"
        :y2="secondHand.y"
      />
      <circle class="analog__hub" :cx="cx" :cy="cy" r="2.2" />
    </svg>
    <p class="analog__readout">{{ label }}</p>
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
</style>
