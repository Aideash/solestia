<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import AnalogClock from '../components/AnalogClock.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import PlanetClock from '../components/PlanetClock.vue'
import { epochKey } from '../epoch.ts'
import { gregorianCalendar } from '../lib/calendars.ts'
import { clampEpoch, planetSystemAt } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const viewed = epoch.viewed
const live = epoch.live
const snapshot = computed(() => planetSystemAt(viewed.value, 'earth'))
const earth = computed(() => snapshot.value.parent)

function setViewed(at: Date) {
  live.value = false
  viewed.value = clampEpoch(at)
}
</script>

<template>
  <div class="page">
    <div class="studio">
      <section class="studio__center" aria-label="Planet clock">
        <PlanetClock :planet="earth" />
      </section>
      <section class="studio__time" aria-label="Time">
        <h2 class="studio__label">Time</h2>
        <AnalogClock :at="viewed" />
      </section>
      <section class="studio__date" aria-label="Date">
        <h2 class="studio__label">Date</h2>
        <MonthCalendar :at="viewed" :driver="gregorianCalendar" @change="setViewed" />
      </section>
    </div>
    <RouterLink class="back" :to="{ name: 'earth-system' }">← Earth</RouterLink>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

$page-wide: 56rem;
$page-medium: 36rem;

.page {
  display: grid;
  gap: $spacing-lg;
}

.studio {
  display: grid;
  gap: $spacing-lg;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'center'
    'time'
    'date';
}

.studio__center {
  grid-area: center;
  align-self: start;
  justify-self: center;
  width: min(16rem, 100%);
}

.studio__center :deep(.clock) {
  cursor: default;
}

.studio__center :deep(.clock:hover) {
  filter: none;
}

/* Labels stay on a shared top line; the dials center in the space below them. */
.studio__time,
.studio__date {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
}

.studio__time {
  grid-area: time;
}

.studio__time :deep(.analog) {
  --analog-scale: 1.1;

  align-self: center;
}

.studio__date {
  grid-area: date;
}

.studio__date :deep(.calendar) {
  --calendar-scale: 0.6;

  align-self: center;
}

.studio__label {
  margin: 0 0 $spacing-sm;
  color: $color-text-muted;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.back {
  display: block;
  color: var(--accent);
  font-size: 0.75rem;
  text-decoration: none;
  padding: 4px 10px;
  border: 1px solid var(--border);
  width: fit-content;
  border-radius: 10px;
}

.back:hover,
.back:focus-visible {
  color: var(--text);
  outline: none;
}

@media (min-width: $page-medium) {
  .studio {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'center center'
      'time date';
  }
}

@media (min-width: $page-wide) {
  .studio {
    grid-template-columns: minmax(0, 1fr) minmax(12rem, 16rem) minmax(0, 1fr);
    grid-template-areas: 'time center date';
  }

  .studio__center {
    width: 100%;
  }

  .studio__time,
  .studio__date {
    margin-top: 5rem;
  }
}
</style>
