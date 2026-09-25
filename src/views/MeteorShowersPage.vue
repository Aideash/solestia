<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ConstellationGlyph from '../components/ConstellationGlyph.vue'
import MeteorShowersView from '../components/MeteorShowersView.vue'
import PlanetClock from '../components/PlanetClock.vue'
import SystemStage from '../components/SystemStage.vue'
import {
  cycleViewPlane,
  HELIOCENTRIC_VIEW_PLANE_CHOICES,
  type ViewPlane,
} from '../data/planetSystems.ts'
import { epochKey } from '../epoch.ts'
import { meteorShowersAt } from '../lib/meteorEphemeris.ts'
import { router } from '../router.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const selectedParent = epoch.selectedId
const viewPlane = ref<ViewPlane>('ecliptic')
const snapshot = computed(() => meteorShowersAt(epoch.viewed.value))
const innerParents = computed(() => snapshot.value.parents.slice(0, 3))
const outerParents = computed(() => snapshot.value.parents.slice(3))

function cycleMeteorViewPlane() {
  viewPlane.value = cycleViewPlane(viewPlane.value, HELIOCENTRIC_VIEW_PLANE_CHOICES)
}

function toggleParent(id: string) {
  if (id === 'sun') {
    void router.push({ name: 'solar' })
    return
  }
  selectedParent.value = selectedParent.value === id ? null : id
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="parent in innerParents"
        :key="parent.id"
        :planet="parent"
        face="none"
        :selected="selectedParent === parent.id"
        @select="toggleParent(parent.id)"
      >
        <template #center>
          <ConstellationGlyph :constellation-ids="parent.constellationIds" :color="parent.color" />
        </template>
      </PlanetClock>
    </template>
    <template #center>
      <MeteorShowersView
        :snapshot="snapshot"
        :selected-parent="selectedParent"
        :view-plane="viewPlane"
        :live="epoch.live.value"
        @select="toggleParent"
      />
    </template>
    <template #controls>
      <button
        type="button"
        class="frame-toggle"
        title="Ecliptic is an orthographic camera north of Earth’s orbit, with perihelion up, so inclined orbits foreshorten. Edge rotates that camera 90°."
        :aria-label="`View plane ${viewPlane}. Click to cycle ecliptic, edge.`"
        @click="cycleMeteorViewPlane"
      >
        <span class="frame-toggle__label">plane</span>
        <span class="frame-toggle__mode">{{ viewPlane }}</span>
      </button>
      <RouterLink class="nav-pill" :to="{ name: 'solar' }">← Solar system</RouterLink>
    </template>
    <template #outer>
      <PlanetClock
        v-for="parent in outerParents"
        :key="parent.id"
        :planet="parent"
        face="none"
        :mirrored-label="true"
        :selected="selectedParent === parent.id"
        @select="toggleParent(parent.id)"
      >
        <template #center>
          <ConstellationGlyph :constellation-ids="parent.constellationIds" :color="parent.color" />
        </template>
      </PlanetClock>
    </template>
  </SystemStage>
</template>
