<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import AsteroidBeltView from '../components/AsteroidBeltView.vue'
import PlanetClock from '../components/PlanetClock.vue'
import SystemStage from '../components/SystemStage.vue'
import { epochKey } from '../epoch.ts'
import { asteroidBeltAt } from '../lib/asteroidEphemeris.ts'
import { router } from '../router.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const selectedAsteroid = epoch.selectedId
const snapshot = computed(() => asteroidBeltAt(epoch.viewed.value))
const innerAsteroids = computed(() => snapshot.value.asteroids.slice(0, 3))
const outerAsteroids = computed(() => snapshot.value.asteroids.slice(3))

function toggleAsteroid(id: string) {
  if (id === 'sun') router.push({ name: 'solar' })
  selectedAsteroid.value = selectedAsteroid.value === id ? null : id
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="asteroid in innerAsteroids"
        :key="asteroid.id"
        :planet="asteroid"
        :selected="selectedAsteroid === asteroid.id"
        @select="toggleAsteroid(asteroid.id)"
      />
    </template>
    <template #center>
      <AsteroidBeltView
        :snapshot="snapshot"
        :selected-asteroid="selectedAsteroid"
        :live="epoch.live.value"
        @select="toggleAsteroid"
      />
    </template>
    <template #controls>
      <RouterLink class="back-link" :to="{ name: 'solar' }">← Solar system</RouterLink>
    </template>
    <template #outer>
      <PlanetClock
        v-for="asteroid in outerAsteroids"
        :key="asteroid.id"
        :planet="asteroid"
        :mirrored-label="true"
        :selected="selectedAsteroid === asteroid.id"
        @select="toggleAsteroid(asteroid.id)"
      />
    </template>
  </SystemStage>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.back-link {
  color: $color-text-muted;
  font-size: 0.75rem;
  text-decoration: none;
}

.back-link:hover,
.back-link:focus-visible {
  color: $color-text;
  outline: none;
}
</style>
