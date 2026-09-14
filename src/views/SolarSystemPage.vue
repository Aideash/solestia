<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PlanetClock from '../components/PlanetClock.vue'
import SolarSystemView from '../components/SolarSystemView.vue'
import SystemStage from '../components/SystemStage.vue'
import {
  cycleViewPlane,
  HELIOCENTRIC_VIEW_PLANE_CHOICES,
  planetSystemFor,
  type ViewPlane,
} from '../data/planetSystems.ts'
import { timePageFor } from '../data/timePages.ts'
import { ROTATION_FRAME_CHOICES, type RotationFrameChoice } from '../data/planets.ts'
import { epochKey } from '../epoch.ts'
import { solarSystemAt } from '../lib/kepler.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const router = useRouter()
const rotationFrame = ref<RotationFrameChoice>('iau')
const viewPlane = ref<ViewPlane>('ecliptic')
const selectedPlanet = epoch.selectedId
const selectedTimePage = computed(() =>
  selectedPlanet.value ? timePageFor(selectedPlanet.value) : undefined,
)

const snapshot = computed(() => solarSystemAt(epoch.viewed.value, rotationFrame.value))
const innerPlanets = computed(() => snapshot.value.planets.slice(0, 4))
const outerPlanets = computed(() => snapshot.value.planets.slice(4))

function cycleRotationFrame() {
  const i = ROTATION_FRAME_CHOICES.indexOf(rotationFrame.value)
  rotationFrame.value = ROTATION_FRAME_CHOICES[(i + 1) % ROTATION_FRAME_CHOICES.length]
}

function cycleSolarViewPlane() {
  viewPlane.value = cycleViewPlane(viewPlane.value, HELIOCENTRIC_VIEW_PLANE_CHOICES)
}

function togglePlanet(id: string) {
  selectedPlanet.value = selectedPlanet.value === id ? null : id
}

function openSystem(id: string) {
  if (id === 'asteroid-belt' || id === 'kuiper-belt') {
    void router.push({ name: id })
    return
  }
  const system = planetSystemFor(id as Parameters<typeof planetSystemFor>[0])
  // Mars has system ephemeris for the local clock but no orrery route yet —
  // fall through to the time page when the system route is absent.
  if (system && router.hasRoute(system.routeName)) {
    void router.push({ name: system.routeName })
    return
  }
  const timePage = timePageFor(id)
  if (timePage) void router.push({ name: timePage.routeName })
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
        :selected-planet="selectedPlanet"
        :view-plane="viewPlane"
        :live="epoch.live.value"
        @select="togglePlanet"
        @open="openSystem"
      />
    </template>
    <template #controls>
      <RouterLink
        v-if="selectedTimePage"
        class="nav-pill"
        :to="{ name: selectedTimePage.routeName }"
      >
        Date and time →
      </RouterLink>
      <button
        type="button"
        class="frame-toggle"
        title="Ecliptic is an orthographic camera north of Earth’s orbit, with perihelion up, so inclined orbits foreshorten. Edge rotates that camera 90°."
        :aria-label="`View plane ${viewPlane}. Click to cycle ecliptic, edge.`"
        @click="cycleSolarViewPlane"
      >
        <span class="frame-toggle__label">plane</span>
        <span class="frame-toggle__mode">{{ viewPlane }}</span>
      </button>
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
