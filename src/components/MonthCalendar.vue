<script setup lang="ts">
import { computed } from 'vue'
import type { CalendarDriver } from '../lib/calendars.ts'

const props = defineProps<{
  at: Date
  driver: CalendarDriver
  locale?: string
  timeZone?: string
}>()

const emit = defineEmits<{
  change: [at: Date]
}>()

const grid = computed(() => props.driver.monthGrid(props.at, props.locale, props.timeZone))
const parts = computed(() => props.driver.dateParts(props.at, props.timeZone))

function isSelected(key: string): boolean {
  return parts.value.key === key
}

function pickDay(instant: Date, inWindow: boolean) {
  if (!inWindow) return
  emit('change', instant)
}

function stepMonth(delta: number) {
  emit('change', props.driver.shiftMonth(props.at, delta, props.timeZone))
}

function stepYear(delta: number) {
  emit('change', props.driver.shiftYear(props.at, delta, props.timeZone))
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
      <h3 class="calendar__heading" :title="grid.headingSecondary ? undefined : grid.headingTitle">
        <span class="calendar__heading-primary">{{ grid.headingPrimary }}</span>
        <span
          v-if="grid.headingSecondary"
          class="calendar__heading-secondary"
          :title="grid.headingTitle"
          :aria-label="grid.headingTitle"
        >
          {{ grid.headingSecondary }}
        </span>
      </h3>
      <button type="button" class="calendar__nav" aria-label="Next month" @click="stepMonth(1)">
        ›
      </button>
      <button type="button" class="calendar__nav" aria-label="Next year" @click="stepYear(1)">
        »
      </button>
    </div>
    <!-- <p class="calendar__caption">{{ caption }}</p> -->
    <div
      class="calendar__grid"
      role="grid"
      :aria-label="`${driver.name} calendar`"
      :style="{ '--calendar-columns': grid.columnCount }"
    >
      <span
        v-for="label in grid.weekdayLabels"
        :key="label.long"
        class="calendar__weekday"
        role="columnheader"
        :title="label.long"
        :aria-label="label.long"
      >
        {{ label.short }}
      </span>
      <button
        v-for="(cell, index) in grid.cells"
        :key="`${cell.key}-${index}`"
        type="button"
        class="calendar__day"
        :class="{
          'calendar__day--outside': !cell.inMonth,
          'calendar__day--muted': !cell.inWindow,
          'calendar__day--selected': isSelected(cell.key),
          'calendar__day--named': cell.label,
        }"
        role="gridcell"
        :disabled="!cell.inWindow"
        :aria-current="isSelected(cell.key) ? 'date' : undefined"
        :aria-label="cell.title"
        :title="cell.title"
        @click="pickDay(cell.instant, cell.inWindow)"
      >
        {{ cell.label ?? cell.day }}
      </button>
    </div>
  </div>
  <p v-else class="calendar__unavailable">
    The {{ driver.name }} calendar is unavailable in this browser.
  </p>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.calendar {
  /** Multiplier on the calendar's full-size footprint; type stays fixed. */
  --calendar-scale: 1;

  display: grid;
  gap: $spacing-sm;
  width: 100%;
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
  display: grid;
  justify-items: center;
  margin: 0;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
}

.calendar__heading-secondary {
  color: var(--text-dim);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: help;
}

.calendar__heading[title] {
  cursor: help;
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

.calendar__unavailable {
  margin: 0;
  color: $color-text-muted;
  font-size: 0.8rem;
  text-align: center;
}

.calendar__grid {
  display: grid;
  grid-template-columns: repeat(var(--calendar-columns), minmax(0, 1fr));
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
  // aspect-ratio: 1;
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

.calendar__day--named {
  min-height: 2.4rem;
  padding-inline: 0.15rem;
  font-size: 0.68rem;
  overflow-wrap: anywhere;
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
