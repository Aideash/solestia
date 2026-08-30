<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useRouter } from 'vue-router'
import PlanetClock from '../components/PlanetClock.vue'
import SolarSystemView from '../components/SolarSystemView.vue'
import SystemStage from '../components/SystemStage.vue'
import { ROTATION_FRAME_CHOICES, type RotationFrameChoice } from '../data/planets.ts'
import { epochKey } from '../epoch.ts'
import { solarSystemAt } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const router = useRouter()
const rotationFrame = ref<RotationFrameChoice>('iau')
const selectedPlanet = epoch.selectedId

const snapshot = computed(() => solarSystemAt(epoch.viewed.value, rotationFrame.value))
const innerPlanets = computed(() => snapshot.value.planets.slice(0, 4))
const outerPlanets = computed(() => snapshot.value.planets.slice(4))

function cycleRotationFrame() {
  const i = ROTATION_FRAME_CHOICES.indexOf(rotationFrame.value)
  rotationFrame.value = ROTATION_FRAME_CHOICES[(i + 1) % ROTATION_FRAME_CHOICES.length]
}

function togglePlanet(id: string) {
  selectedPlanet.value = selectedPlanet.value === id ? null : id
}

function openJupiter() {
  void router.push({ name: 'jupiter' })
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="planet in innerPlanets"
        :key="planet.id"
        :planet="planet"
        :mirrored-label="false"
        :selected="selectedPlanet === planet.id"
        @select="togglePlanet(planet.id)"
      />
    </template>
    <template #center>
      <SolarSystemView
        :snapshot="snapshot"
        system="solar"
        :selected-planet="selectedPlanet"
        :live="epoch.live.value"
        @select="togglePlanet"
        @open="openJupiter"
      />
    </template>
    <template #controls>
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
    </template>
    <template #outer>
      <PlanetClock
        v-for="planet in outerPlanets"
        :key="planet.id"
        :planet="planet"
        :mirrored-label="true"
        :selected="selectedPlanet === planet.id"
        @select="togglePlanet(planet.id)"
      />
    </template>
  </SystemStage>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

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
