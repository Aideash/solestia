<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PlanetClock from './components/PlanetClock.vue'
import SolarSystemView from './components/SolarSystemView.vue'
import { ROTATION_FRAME_CHOICES, type PlanetId, type RotationFrameChoice } from './data/planets.ts'
import { solarSystemAt } from './lib/kepler.ts'

const now = ref(new Date())
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
  window.addEventListener('keydown', onAppKeydown)
})

onUnmounted(() => {
  window.clearInterval(timer)
  window.removeEventListener('keydown', onAppKeydown)
})

const rotationFrame = ref<RotationFrameChoice>('iau')

function cycleRotationFrame() {
  const i = ROTATION_FRAME_CHOICES.indexOf(rotationFrame.value)
  rotationFrame.value = ROTATION_FRAME_CHOICES[(i + 1) % ROTATION_FRAME_CHOICES.length]
}

const snapshot = computed(() => solarSystemAt(now.value, rotationFrame.value))

/** One selection shared by the dials, the orrery and the table. */
const selectedPlanet = ref<PlanetId | null>(null)

function togglePlanet(id: PlanetId) {
  selectedPlanet.value = selectedPlanet.value === id ? null : id
}

function onAppKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || selectedPlanet.value === null) return
  selectedPlanet.value = null
  event.preventDefault()
}

/** Mercury through Mars flank the left, the outer four the right. */
const innerPlanets = computed(() => snapshot.value.planets.slice(0, 4))
const outerPlanets = computed(() => snapshot.value.planets.slice(4))

const clockLabel = computed(() =>
  now.value.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }),
)
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1>Solestia</h1>
      <p class="clock">{{ clockLabel }}[{{ -now.getTimezoneOffset() / 60 }}]</p>
      <button
        type="button"
        class="frame-toggle"
        title="Jupiter cloud is System I (equatorial). Neptune magnetic is Voyager radio. Uranus cloud and the inner planets stay on the IAU cartographic W."
        :aria-label="`Rotation frame ${rotationFrame}. Click to cycle IAU, magnetic, cloud.`"
        @click="cycleRotationFrame"
      >
        <span class="frame-toggle__label">longitude</span>
        <span class="frame-toggle__mode">{{ rotationFrame }}</span>
      </button>
    </header>
    <div class="app__layout">
      <div class="app__dials app__dials--inner">
        <PlanetClock
          v-for="planet in innerPlanets"
          :key="planet.id"
          :planet="planet"
          :mirrored-label="false"
          :selected="selectedPlanet === planet.id"
          @select="togglePlanet(planet.id)"
        />
      </div>
      <div class="app__center">
        <SolarSystemView
          :snapshot="snapshot"
          :selected-planet="selectedPlanet"
          @select="togglePlanet"
        />
      </div>
      <div class="app__dials app__dials--outer">
        <PlanetClock
          v-for="planet in outerPlanets"
          :key="planet.id"
          :planet="planet"
          :mirrored-label="true"
          :selected="selectedPlanet === planet.id"
          @select="togglePlanet(planet.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables' as *;

$center-width: 32rem;
$flanked-width: 78rem;

.app {
  max-width: 76rem;
  margin: 0 auto;
  padding: $spacing-lg $spacing-md 2.5rem;
  min-height: 100vh;
}

.app__header {
  max-width: $center-width;
  margin: 0 auto $spacing-md;
}

.app__layout {
  display: grid;
  justify-content: center;
  gap: $spacing-lg;
  grid-template-columns: minmax(0, $center-width);
  grid-template-areas:
    'center'
    'inner'
    'outer';
}

.app__center {
  grid-area: center;
  min-width: 0;
}

.app__dials {
  display: grid;
  gap: $spacing-md;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
}

.app__dials--inner {
  grid-area: inner;
}

.app__dials--outer {
  grid-area: outer;
}

@media (min-width: $flanked-width) {
  .app__layout {
    grid-template-columns: 1fr minmax(0, $center-width) 1fr;
    grid-template-areas: 'inner center outer';
    align-items: start;
  }

  .app__dials {
    grid-template-columns: 1fr;
    gap: $spacing-lg;
  }

  .app__dials > * {
    max-width: 11rem;
    justify-self: center;
  }
}

h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.clock {
  margin: $spacing-xs 0 0;
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.8125rem;
}

.clock:hover {
  filter: drop-shadow(0px 0px 4px var(--accent));
}

.clock.selected {
  filter: drop-shadow(0px 0px 7px var(--accent));
}

.clock.selected:hover {
  filter: drop-shadow(0px 0px 7px color-mix(in srgb, var(--accent), var(--text)));
}

.frame-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-top: $spacing-xs;
  padding: 0;
  border: 0;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.frame-toggle:hover,
.frame-toggle:focus-visible {
  color: var(--text);
  outline: none;
}

.frame-toggle__label {
  letter-spacing: 0.02em;
}

.frame-toggle__mode {
  font-family: $font-mono;
  font-size: 0.8125rem;
}
</style>
