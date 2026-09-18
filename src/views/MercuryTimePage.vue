<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AnalogClock from '../components/AnalogClock.vue'
import MercuryLocalClock from '../components/clocks/MercuryLocalClock.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import PlanetClock from '../components/PlanetClock.vue'
import {
  DEFAULT_MERCURY_SITE_ID,
  groupedMercurySites,
  isMercurySiteId,
} from '../data/mercurySites.ts'
import { epochKey, SI_SECOND_CADENCE } from '../epoch.ts'
import { clampEpoch, solarSystemAt } from '../lib/kepler.ts'
import { mercuryLocalSkyAt } from '../lib/mercuryLocalSky.ts'
import { mercurySystem, mercurySystems, type MercuryCadenceSource } from '../lib/mercurySystems.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const viewed = epoch.viewed
const live = epoch.live
const snapshot = computed(() => solarSystemAt(viewed.value))
const SITE_STORAGE_KEY = 'solestia.mercurySite'

type DialMode = 'prime' | 'local'
const dialMode = ref<DialMode>('prime')

function storedSiteId(): string {
  try {
    const raw = localStorage.getItem(SITE_STORAGE_KEY)
    if (raw && isMercurySiteId(raw)) return raw
  } catch {
    // Private mode or quota — keep the session default.
  }
  return DEFAULT_MERCURY_SITE_ID
}

const systemId = ref<(typeof mercurySystems)[number]['id']>('phases')
const system = computed(() => mercurySystem(systemId.value))
const cadenceSource = ref<MercuryCadenceSource>('day')
const siteId = ref(storedSiteId())
const siteGroups = groupedMercurySites()

const mercury = computed(() => {
  const planet = snapshot.value.planets.find((body) => body.id === 'mercury')
  if (!planet) throw new Error('Mercury orbital elements are missing')
  return planet
})

const dialPlanet = computed(() => mercury.value)

const localSky = computed(() => {
  if (dialMode.value !== 'local') return null
  return mercuryLocalSkyAt(viewed.value, siteId.value, snapshot.value)
})

const dayClock = computed(() => system.value.dayClock)
const yearClock = computed(() => system.value.yearClock)
const calendar = computed(() => system.value.calendar)

const activeClock = computed(() => {
  if (system.value.layout === 'dual' && cadenceSource.value === 'year' && yearClock.value) {
    return yearClock.value
  }
  return dayClock.value
})

watch(systemId, (id) => {
  cadenceSource.value = mercurySystem(id).defaultCadence
})

watch(siteId, (id) => {
  try {
    localStorage.setItem(SITE_STORAGE_KEY, id)
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
})

/**
 * Live EpochField ticks in the active Mercury civil unit while this page is up.
 * Dual systems can beat on the day clock or the year clock.
 */
watch(
  [activeClock, siteId],
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
        <PlanetClock v-if="dialMode === 'prime'" :planet="dialPlanet" />
        <MercuryLocalClock v-else-if="localSky" :sky="localSky" />
        <div class="studio__dial-toggle" role="group" aria-label="Planet clock mode">
          <button
            type="button"
            class="names-toggle"
            :aria-pressed="dialMode === 'prime'"
            @click="dialMode = 'prime'"
          >
            <span class="names-toggle__label">Dial</span>
            <span class="names-toggle__mode">Prime</span>
          </button>
          <button
            type="button"
            class="names-toggle"
            :aria-pressed="dialMode === 'local'"
            @click="dialMode = 'local'"
          >
            <span class="names-toggle__mode">Local</span>
          </button>
        </div>
        <p class="studio__note">
          Local dial shows true solar and sidereal sky time (true solar can run backward near
          perihelion). Civil systems below use mean time.
        </p>
        <label class="calendar-picker studio__zone">
          <span class="calendar-picker__label">Site</span>
          <select v-model="siteId" class="calendar-picker__select studio__zone-select">
            <optgroup v-for="group in siteGroups" :key="group.group" :label="group.group">
              <option v-for="entry in group.sites" :key="entry.id" :value="entry.id">
                {{ entry.name }}
              </option>
            </optgroup>
          </select>
        </label>
        <label class="calendar-picker studio__system">
          <span class="calendar-picker__label">System</span>
          <select v-model="systemId" class="calendar-picker__select studio__system-select">
            <option v-for="entry in mercurySystems" :key="entry.id" :value="entry.id">
              {{ entry.name }}
            </option>
          </select>
        </label>
      </section>
      <section class="studio__time" aria-label="Time">
        <div class="studio__time-header">
          <h2 class="studio__label">{{ system.layout === 'dual' ? 'Sol' : 'Time' }}</h2>
          <div
            v-if="system.layout === 'dual'"
            class="studio__cadence"
            role="group"
            aria-label="Live cadence"
          >
            <button
              type="button"
              class="names-toggle"
              :aria-pressed="cadenceSource === 'day'"
              @click="cadenceSource = 'day'"
            >
              <span class="names-toggle__mode">Live: sol</span>
            </button>
            <button
              type="button"
              class="names-toggle"
              :aria-pressed="cadenceSource === 'year'"
              @click="cadenceSource = 'year'"
            >
              <span class="names-toggle__mode">Live: year</span>
            </button>
          </div>
        </div>
        <AnalogClock :at="viewed" :driver="dayClock" :time-zone="siteId" @change="setViewed" />
      </section>
      <section class="studio__date" aria-label="Date">
        <div class="studio__date-header">
          <h2 class="studio__label">{{ system.layout === 'dual' ? 'Year' : 'Date' }}</h2>
        </div>
        <AnalogClock
          v-if="system.layout === 'dual' && yearClock"
          :at="viewed"
          :driver="yearClock"
          @change="setViewed"
        />
        <MonthCalendar
          v-else-if="calendar"
          :at="viewed"
          :driver="calendar"
          :time-zone="siteId"
          @change="setViewed"
        />
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

.studio__dial-toggle {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: $spacing-xs;
}

.studio__note {
  margin: 0;
  color: $color-text-muted;
  font-size: 0.7rem;
  line-height: 1.35;
  text-align: center;
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

.studio__date :deep(.analog) {
  --analog-scale: 1.1;

  align-self: center;
}

.studio__zone,
.studio__system {
  justify-self: stretch;
  justify-content: center;
  min-width: 0;
}

.studio__zone-select,
.studio__system-select {
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

.studio__cadence {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: $spacing-xs;
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
  max-width: 12rem;
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

.names-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  padding: 0.2rem 0.45rem;
  background: var(--background);
  color: var(--text);
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}

.names-toggle:hover,
.names-toggle:focus-visible {
  border-color: var(--accent);
  outline: none;
}

.names-toggle[aria-pressed='true'] .names-toggle__mode {
  color: var(--accent);
}

.names-toggle__label {
  color: $color-text-muted;
}

.names-toggle__mode {
  font-weight: 600;
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
    align-items: start;
  }

  .studio__center {
    justify-self: center;
  }
}
</style>
