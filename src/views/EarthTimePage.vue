<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AnalogClock from '../components/AnalogClock.vue'
import MonthCalendar from '../components/MonthCalendar.vue'
import PlanetClock from '../components/PlanetClock.vue'
import { epochKey, SI_SECOND_CADENCE } from '../epoch.ts'
import { calendarDrivers } from '../lib/calendars.ts'
import { clockDrivers } from '../lib/clocks.ts'
import { clampEpoch, planetSystemAt } from '../lib/kepler.ts'
import { groupedTimeZones, hostTimeZoneId, isTimeZoneId, timeZoneLabel } from '../lib/timeZones.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const viewed = epoch.viewed
const live = epoch.live
const snapshot = computed(() => planetSystemAt(viewed.value, 'earth'))
const earth = computed(() => snapshot.value.parent)
const NAMES_STORAGE_KEY = 'solestia.calendarNames'
const ZONE_STORAGE_KEY = 'solestia.earthTimeZone'

type NamesMode = 'auto' | 'native'

function storedNamesMode(): NamesMode {
  try {
    const raw = localStorage.getItem(NAMES_STORAGE_KEY)
    if (raw === 'auto' || raw === 'native') return raw
  } catch {
    // Private mode or quota — keep the session default.
  }
  return 'auto'
}

function storedTimeZoneId(): string {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY)
    if (raw && isTimeZoneId(raw)) return raw
  } catch {
    // Private mode or quota — keep the session default.
  }
  return hostTimeZoneId()
}

const calendarId = ref<(typeof calendarDrivers)[number]['id']>('gregory')
const calendar = computed(
  () => calendarDrivers.find((driver) => driver.id === calendarId.value) ?? calendarDrivers[0],
)
const clockId = ref<(typeof clockDrivers)[number]['id']>('civil-12')
const clock = computed(
  () => clockDrivers.find((driver) => driver.id === clockId.value) ?? clockDrivers[0],
)
const namesMode = ref<NamesMode>(storedNamesMode())
const timeZoneId = ref(storedTimeZoneId())
const timeZoneGroups = groupedTimeZones()
const calendarLocale = computed(() =>
  namesMode.value === 'native' ? calendar.value.nativeLocale : undefined,
)
const clockLocale = computed(() =>
  namesMode.value === 'native' ? clock.value.nativeLocale : undefined,
)

watch(namesMode, (mode) => {
  try {
    localStorage.setItem(NAMES_STORAGE_KEY, mode)
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
})

watch(timeZoneId, (id) => {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, id)
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
})

/**
 * The live clock beats in whatever unit is on the dial, so a decimal second or a
 * kastha is something you can watch pass. Other pages have no such clock, so the
 * cadence goes back to an SI second on the way out.
 */
watch(
  [clock, timeZoneId],
  ([driver, zone]) => {
    epoch.cadence.value = { tickMs: driver.tickMs, frameMs: (at) => driver.frameMs(at, zone) }
  },
  { immediate: true },
)

onUnmounted(() => {
  epoch.cadence.value = SI_SECOND_CADENCE
})

function toggleNamesMode() {
  namesMode.value = namesMode.value === 'native' ? 'auto' : 'native'
}

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
        <label class="calendar-picker studio__zone">
          <span class="calendar-picker__label">Zone</span>
          <select v-model="timeZoneId" class="calendar-picker__select studio__zone-select">
            <optgroup v-for="group in timeZoneGroups" :key="group.region" :label="group.region">
              <option v-for="id in group.ids" :key="id" :value="id">
                {{ timeZoneLabel(id) }}
              </option>
            </optgroup>
          </select>
        </label>
      </section>
      <section class="studio__time" aria-label="Time">
        <div class="studio__time-header">
          <h2 class="studio__label">Time</h2>
          <div class="calendar-pickers">
            <button
              v-if="clock.nativeLocale"
              type="button"
              class="names-toggle"
              :aria-pressed="namesMode === 'native'"
              :aria-label="`Clock names ${namesMode}. Click to switch between auto and native.`"
              title="Auto uses Latin names. Native uses this clock’s own language."
              @click="toggleNamesMode"
            >
              <span class="names-toggle__label">Names</span>
              <span class="names-toggle__mode">{{
                namesMode === 'native' ? 'Native' : 'Auto'
              }}</span>
            </button>
            <label class="calendar-picker">
              <span class="calendar-picker__label">Clock</span>
              <select v-model="clockId" class="calendar-picker__select">
                <option v-for="driver in clockDrivers" :key="driver.id" :value="driver.id">
                  {{ driver.name }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <AnalogClock
          :at="viewed"
          :driver="clock"
          :locale="clockLocale"
          :time-zone="timeZoneId"
          @change="setViewed"
        />
      </section>
      <section class="studio__date" aria-label="Date">
        <div class="studio__date-header">
          <h2 class="studio__label">Date</h2>
          <div class="calendar-pickers">
            <button
              v-if="calendar.nativeLocale"
              type="button"
              class="names-toggle"
              :aria-pressed="namesMode === 'native'"
              :aria-label="`Calendar names ${namesMode}. Click to switch between auto and native.`"
              title="Auto uses your browser language. Native uses this calendar’s own language."
              @click="toggleNamesMode"
            >
              <span class="names-toggle__label">Names</span>
              <span class="names-toggle__mode">{{
                namesMode === 'native' ? 'Native' : 'Auto'
              }}</span>
            </button>
            <label class="calendar-picker">
              <span class="calendar-picker__label">Calendar</span>
              <select v-model="calendarId" class="calendar-picker__select">
                <option v-for="driver in calendarDrivers" :key="driver.id" :value="driver.id">
                  {{ driver.name }}
                </option>
              </select>
            </label>
          </div>
        </div>
        <MonthCalendar
          :at="viewed"
          :driver="calendar"
          :locale="calendarLocale"
          :time-zone="timeZoneId"
          @change="setViewed"
        />
      </section>
    </div>
    <RouterLink class="nav-pill" :to="{ name: 'earth-system' }">← Earth</RouterLink>
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

.names-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: $spacing-xs;
  padding: 0;
  border: 0;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}

.names-toggle:hover,
.names-toggle:focus-visible {
  color: var(--text);
  outline: none;
}

.names-toggle[aria-pressed='true'] .names-toggle__mode {
  color: var(--accent);
}

.names-toggle__mode {
  font-family: $font-mono;
  font-size: 0.75rem;
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
