<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AsteroidBeltView from '../components/AsteroidBeltView.vue'
import PlanetClock from '../components/PlanetClock.vue'
import SystemStage from '../components/SystemStage.vue'
import {
  cycleViewPlane,
  HELIOCENTRIC_VIEW_PLANE_CHOICES,
  type ViewPlane,
} from '../data/planetSystems.ts'
import { epochKey } from '../epoch.ts'
import { asteroidBeltAt } from '../lib/asteroidEphemeris.ts'
import { router } from '../router.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const selectedAsteroid = epoch.selectedId
const viewPlane = ref<ViewPlane>('ecliptic')
const snapshot = computed(() => asteroidBeltAt(epoch.viewed.value))
const innerAsteroids = computed(() => snapshot.value.asteroids.slice(0, 3))
const outerAsteroids = computed(() => snapshot.value.asteroids.slice(3))

function cycleBeltViewPlane() {
  viewPlane.value = cycleViewPlane(viewPlane.value, HELIOCENTRIC_VIEW_PLANE_CHOICES)
}

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
        :view-plane="viewPlane"
        :live="epoch.live.value"
        @select="toggleAsteroid"
      />
    </template>
    <template #controls>
      <button
        type="button"
        class="frame-toggle"
        title="Ecliptic is an orthographic camera north of Earth’s orbit, with perihelion up, so inclined orbits foreshorten. Edge rotates that camera 90°."
        :aria-label="`View plane ${viewPlane}. Click to cycle ecliptic, edge.`"
        @click="cycleBeltViewPlane"
      >
        <span class="frame-toggle__label">plane</span>
        <span class="frame-toggle__mode">{{ viewPlane }}</span>
      </button>
      <RouterLink class="nav-pill" :to="{ name: 'solar' }">← Solar system</RouterLink>
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
