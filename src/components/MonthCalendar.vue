<script setup lang="ts">
import { computed } from 'vue'
import {
  atCivilDay,
  shiftCivilMonth,
  shiftCivilYear,
  type CalendarDriver,
} from '../lib/calendars.ts'

const props = defineProps<{
  at: Date
  driver: CalendarDriver
}>()

const emit = defineEmits<{
  change: [at: Date]
}>()

const grid = computed(() => props.driver.monthGrid(props.at))
const parts = computed(() => props.driver.dateParts(props.at))
// const caption = computed(() => props.driver.label(props.at))

function isSelected(year: number, month: number, day: number): boolean {
  const current = parts.value
  return current.year === year && current.month === month && current.day === day
}

function pickDay(year: number, month: number, day: number, inWindow: boolean) {
  if (!inWindow) return
  emit('change', atCivilDay(props.at, year, month, day))
}

function stepMonth(delta: number) {
  emit('change', shiftCivilMonth(props.at, delta))
}

function stepYear(delta: number) {
  emit('change', shiftCivilYear(props.at, delta))
}
</script>

<template>
  <div v-if="grid" class="calendar">
    <div class="calendar__toolbar">
      <button type="button" class="calendar__nav" aria-label="Previous year" @click="stepYear(-1)">
        «
      </button>
      <button
        type="button"
        class="calendar__nav"
        aria-label="Previous month"
        @click="stepMonth(-1)"
      >
        ‹
      </button>
      <h3 class="calendar__heading">{{ grid.heading }}</h3>
      <button type="button" class="calendar__nav" aria-label="Next month" @click="stepMonth(1)">
        ›
      </button>
      <button type="button" class="calendar__nav" aria-label="Next year" @click="stepYear(1)">
        »
      </button>
    </div>
    <!-- <p class="calendar__caption">{{ caption }}</p> -->
    <div class="calendar__grid" role="grid" :aria-label="`${driver.name} calendar`">
      <span
        v-for="label in grid.weekdayLabels"
        :key="label"
        class="calendar__weekday"
        role="columnheader"
      >
        {{ label }}
      </span>
      <button
        v-for="(cell, index) in grid.cells"
        :key="`${cell.year}-${cell.month}-${cell.day}-${index}`"
        type="button"
        class="calendar__day"
        :class="{
          'calendar__day--outside': !cell.inMonth,
          'calendar__day--muted': !cell.inWindow,
          'calendar__day--selected': isSelected(cell.year, cell.month, cell.day),
        }"
        role="gridcell"
        :disabled="!cell.inWindow"
        :aria-current="isSelected(cell.year, cell.month, cell.day) ? 'date' : undefined"
        @click="pickDay(cell.year, cell.month, cell.day, cell.inWindow)"
      >
        {{ cell.day }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.calendar {
  /** Multiplier on the calendar's full-size footprint; type stays fixed. */
  --calendar-scale: 1;

  display: grid;
  gap: $spacing-sm;
  min-width: 0;
  max-width: calc(34rem * var(--calendar-scale));
  margin-inline: auto;
  border: 5px double var(--border);
  padding: 3px;
}

.calendar__toolbar {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: $spacing-xs;
  padding-bottom: $spacing-xs;
  border-bottom: 1px solid var(--border-strong);
  border-radius: $radius-sm;
}

.calendar__heading {
  margin: 0;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
}

.calendar__nav {
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.2;
  cursor: pointer;
}

.calendar__nav:hover,
.calendar__nav:focus-visible {
  color: var(--text);
  outline: none;
}

// .calendar__caption {
//   margin: 0;
//   color: $color-text-muted;
//   font-size: 0.75rem;
//   text-align: center;
// }

.calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.15rem;
}

.calendar__weekday {
  color: $color-text-muted;
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  text-align: center;
  padding-bottom: 0.2rem;
}

.calendar__day {
  aspect-ratio: 1;
  min-height: 1.85rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: $radius-sm;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.calendar__day:hover,
.calendar__day:focus-visible {
  border-color: var(--border);
  outline: none;
}

.calendar__day--outside {
  color: $color-text-muted;
}

.calendar__day--muted {
  color: color-mix(in srgb, var(--text-dim) 40%, transparent);
  cursor: default;
}

.calendar__day--selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
}

.calendar__day:disabled {
  pointer-events: none;
}
</style>
