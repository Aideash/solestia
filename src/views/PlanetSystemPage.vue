<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import PlanetClock from '../components/PlanetClock.vue'
import SolarSystemView from '../components/SolarSystemView.vue'
import SystemStage from '../components/SystemStage.vue'
import {
  PLANET_SYSTEMS,
  VIEW_PLANE_CHOICES,
  type PlanetSystemId,
  type ViewPlane,
} from '../data/planetSystems.ts'
import { epochKey } from '../epoch.ts'
import { planetSystemAt } from '../lib/kepler.ts'
import { router } from '../router.ts'

const props = defineProps<{ systemId: PlanetSystemId }>()

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const system = computed(() => PLANET_SYSTEMS[props.systemId])
const viewPlane = ref<ViewPlane>(system.value.defaultViewPlane)
const selectedSatellite = epoch.selectedId
const snapshot = computed(() => planetSystemAt(epoch.viewed.value, props.systemId))
const innerSatellites = computed(() =>
  snapshot.value.satellites.slice(0, system.value.innerSatelliteCount),
)
const outerSatellites = computed(() =>
  snapshot.value.satellites.slice(system.value.innerSatelliteCount),
)

watch(
  () => props.systemId,
  (id) => {
    viewPlane.value = PLANET_SYSTEMS[id].defaultViewPlane
  },
)

function cycleViewPlane() {
  const i = VIEW_PLANE_CHOICES.indexOf(viewPlane.value)
  viewPlane.value = VIEW_PLANE_CHOICES[(i + 1) % VIEW_PLANE_CHOICES.length]
}

function toggleSatellite(id: string) {
  if (id === 'sun') {
    router.push('/')
  }
  selectedSatellite.value = selectedSatellite.value === id ? null : id
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="satellite in innerSatellites"
        :key="satellite.id"
        :planet="satellite"
        :parent-system="systemId"
        :mirrored-label="false"
        :selected="selectedSatellite === satellite.id"
        @select="toggleSatellite(satellite.id)"
      />
    </template>
    <template #center>
      <SolarSystemView
        :snapshot="snapshot"
        :selected-planet="selectedSatellite"
        :view-plane="viewPlane"
        :live="epoch.live.value"
        @select="toggleSatellite"
      />
    </template>
    <template #controls>
      <button
        type="button"
        class="frame-toggle"
        title="Ecliptic keeps Earth’s perihelion at the top, matching the solar-system orrery. Equator looks down the parent’s IAU pole so the moons run evenly and the Sun’s azimuth carries the seasons."
        :aria-label="`View plane ${viewPlane}. Click to cycle ecliptic, equator.`"
        @click="cycleViewPlane"
      >
        <span class="frame-toggle__label">plane</span>
        <span class="frame-toggle__mode">{{ viewPlane }}</span>
      </button>
      <RouterLink class="back" to="/">← solar system</RouterLink>
    </template>
    <template #outer>
      <PlanetClock
        v-for="satellite in outerSatellites"
        :key="satellite.id"
        :planet="satellite"
        :parent-system="systemId"
        :mirrored-label="true"
        :selected="selectedSatellite === satellite.id"
        @select="toggleSatellite(satellite.id)"
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

.back {
  display: block;
  margin-top: 0.5rem;
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
</style>
