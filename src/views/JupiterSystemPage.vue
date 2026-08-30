<script setup lang="ts">
import { computed, inject } from 'vue'
import PlanetClock from '../components/PlanetClock.vue'
import SolarSystemView from '../components/SolarSystemView.vue'
import SystemStage from '../components/SystemStage.vue'
import { epochKey } from '../epoch.ts'
import { jupiterSystemAt } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const selectedMoon = epoch.selectedId
const snapshot = computed(() => jupiterSystemAt(epoch.viewed.value))
const innerMoons = computed(() => snapshot.value.moons.slice(0, 2))
const outerMoons = computed(() => snapshot.value.moons.slice(2))

function toggleMoon(id: string) {
  selectedMoon.value = selectedMoon.value === id ? null : id
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="moon in innerMoons"
        :key="moon.id"
        :planet="moon"
        :mirrored-label="false"
        :selected="selectedMoon === moon.id"
        @select="toggleMoon(moon.id)"
      />
    </template>
    <template #center>
      <SolarSystemView
        :snapshot="snapshot"
        system="jupiter"
        :selected-planet="selectedMoon"
        :live="epoch.live.value"
        @select="toggleMoon"
      />
    </template>
    <template #controls>
      <RouterLink class="back" to="/">← solar system</RouterLink>
    </template>
    <template #outer>
      <PlanetClock
        v-for="moon in outerMoons"
        :key="moon.id"
        :planet="moon"
        :mirrored-label="true"
        :selected="selectedMoon === moon.id"
        @select="toggleMoon(moon.id)"
      />
    </template>
  </SystemStage>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.back {
  display: inline-block;
  margin-top: $spacing-xs;
  color: $color-text-muted;
  font-size: 0.75rem;
  text-decoration: none;
}

.back:hover,
.back:focus-visible {
  color: var(--text);
  outline: none;
}
</style>
