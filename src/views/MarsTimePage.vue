<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AnalogClock from '../components/AnalogClock.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import PlanetClock from '../components/PlanetClock.vue'
import { groupedMarsSites, isMarsSiteId } from '../data/marsSites.ts'
import { epochKey, SI_SECOND_CADENCE } from '../epoch.ts'
import { marsCalendarDrivers } from '../lib/marsCalendars.ts'
import { marsClockDrivers } from '../lib/marsClocks.ts'
import { clampEpoch, solarSystemAt } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const viewed = epoch.viewed
const live = epoch.live
const snapshot = computed(() => solarSystemAt(viewed.value))
const SITE_STORAGE_KEY = 'solestia.marsSite'

function storedSiteId(): string {
  try {
    const raw = localStorage.getItem(SITE_STORAGE_KEY)
    if (raw && isMarsSiteId(raw)) return raw
  } catch {
    // Private mode or quota — keep the session default.
  }
  return 'airy'
}

const calendarId = ref<(typeof marsCalendarDrivers)[number]['id']>('darian')
const calendar = computed(
  () =>
    marsCalendarDrivers.find((driver) => driver.id === calendarId.value) ?? marsCalendarDrivers[0],
)
const clockId = ref<(typeof marsClockDrivers)[number]['id']>('mars-mean-24')
const clock = computed(
  () => marsClockDrivers.find((driver) => driver.id === clockId.value) ?? marsClockDrivers[0],
)
const siteId = ref(storedSiteId())
const siteGroups = groupedMarsSites()
const mars = computed(() => {
  const planet = snapshot.value.planets.find((body) => body.id === 'mars')
  if (!planet) throw new Error('Mars orbital elements are missing')
  return planet
})

watch(siteId, (id) => {
  try {
    localStorage.setItem(SITE_STORAGE_KEY, id)
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
})

/**
 * The live clock beats in Mars seconds while this page is up, so the header runs
 * a touch slow the way a clock at Gale would. Leaving restores the SI second.
 */
watch(
  [clock, siteId],
  ([driver, site]) => {
    epoch.cadence.value = { tickMs: driver.tickMs, frameMs: (at) => driver.frameMs(at, site) }
  },
  { immediate: true },
)

onUnmounted(() => {
  epoch.cadence.value = SI_SECOND_CADENCE
})

function setViewed(at: Date) {
  live.value = false
  viewed.value = clampEpoch(at)
}
</script>

<template>
  <div class="page">
    <div class="studio">
      <section class="studio__center" aria-label="Planet clock">
        <PlanetClock :planet="mars" />
        <label class="calendar-picker studio__zone">
          <span class="calendar-picker__label">Site</span>
          <select v-model="siteId" class="calendar-picker__select studio__zone-select">
            <optgroup v-for="group in siteGroups" :key="group.group" :label="group.group">
              <option v-for="site in group.sites" :key="site.id" :value="site.id">
                {{ site.name }}
              </option>
            </optgroup>
          </select>
        </label>
      </section>
      <section class="studio__time" aria-label="Time">
        <div class="studio__time-header">
          <h2 class="studio__label">Time</h2>
          <div class="calendar-pickers">
            <label class="calendar-picker">
              <span class="calendar-picker__label">Clock</span>
              <select v-model="clockId" class="calendar-picker__select">
                <option v-for="driver in marsClockDrivers" :key="driver.id" :value="driver.id">
                  {{ driver.name }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <AnalogClock :at="viewed" :driver="clock" :time-zone="siteId" @change="setViewed" />
      </section>
      <section class="studio__date" aria-label="Date">
        <div class="studio__date-header">
          <h2 class="studio__label">Date</h2>
          <div class="calendar-pickers">
            <label class="calendar-picker">
              <span class="calendar-picker__label">Calendar</span>
              <select v-model="calendarId" class="calendar-picker__select">
                <option v-for="driver in marsCalendarDrivers" :key="driver.id" :value="driver.id">
                  {{ driver.name }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <MonthCalendar :at="viewed" :driver="calendar" :time-zone="siteId" @change="setViewed" />
      </section>
    </div>
    <RouterLink class="nav-pill" :to="{ name: 'solar' }">← Solar system</RouterLink>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

$page-wide: 56rem;
$page-medium: 36rem;

.studio {
  display: grid;
  gap: $spacing-xl;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'center'
    'time'
    'date';
}

.studio__center {
  grid-area: center;
  display: grid;
  justify-items: center;
  align-self: start;
  justify-self: center;
  gap: $spacing-lg;
  width: min(16rem, 100%);
}

.studio__center :deep(.clock) {
  cursor: default;
}

.studio__center :deep(.clock:hover) {
  filter: none;
}

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

.studio__zone {
  justify-self: stretch;
  justify-content: center;
  min-width: 0;
}

.studio__zone-select {
  flex: 1 1 auto;
  max-width: none;
}

.studio__label {
  margin: 0;
  color: $color-text-muted;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.studio__time-header,
.studio__date-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.calendar-pickers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: $spacing-sm;
}

.calendar-picker {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
}

.calendar-picker__label {
  color: $color-text-muted;
  font-size: 0.7rem;
}

.calendar-picker__select {
  min-width: 0;
  max-width: 10rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  padding: 0.2rem 1.5rem 0.2rem 0.4rem;
  background: var(--background);
  color: var(--text);
  font: inherit;
  font-size: 0.7rem;
}

.calendar-picker__select:focus-visible {
  border-color: var(--accent);
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
