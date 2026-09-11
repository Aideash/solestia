<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { RouterLink } from 'vue-router'
import KuiperBeltView from '../components/KuiperBeltView.vue'
import PlanetClock from '../components/PlanetClock.vue'
import SystemStage from '../components/SystemStage.vue'
import {
  cycleViewPlane,
  HELIOCENTRIC_VIEW_PLANE_CHOICES,
  type ViewPlane,
} from '../data/planetSystems.ts'
import { epochKey } from '../epoch.ts'
import { kuiperBeltAt } from '../lib/kuiperEphemeris.ts'
import { router } from '../router.ts'

const epoch = inject(epochKey)
if (!epoch) throw new Error('Epoch context is missing')

const selectedObject = epoch.selectedId
const viewPlane = ref<ViewPlane>('ecliptic')
const snapshot = computed(() => kuiperBeltAt(epoch.viewed.value))
const innerObjects = computed(() => snapshot.value.objects.slice(0, 4))
const outerObjects = computed(() => snapshot.value.objects.slice(4))

function cycleBeltViewPlane() {
  viewPlane.value = cycleViewPlane(viewPlane.value, HELIOCENTRIC_VIEW_PLANE_CHOICES)
}

function toggleObject(id: string) {
  if (id === 'sun') {
    void router.push({ name: 'solar' })
    return
  }
  selectedObject.value = selectedObject.value === id ? null : id
}
</script>

<template>
  <SystemStage>
    <template #inner>
      <PlanetClock
        v-for="object in innerObjects"
        :key="object.id"
        :planet="object"
        :selected="selectedObject === object.id"
        @select="toggleObject(object.id)"
      />
    </template>
    <template #center>
      <KuiperBeltView
        :snapshot="snapshot"
        :selected-object="selectedObject"
        :view-plane="viewPlane"
        :live="epoch.live.value"
        @select="toggleObject"
      />
    </template>
    <template #controls>
      <button
        type="button"
        class="frame-toggle"
        title="Ecliptic looks down from ecliptic north. Edge rotates the camera 90° to reveal orbital inclination."
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
        v-for="object in outerObjects"
        :key="object.id"
        :planet="object"
        :mirrored-label="true"
        :selected="selectedObject === object.id"
        @select="toggleObject(object.id)"
      />
    </template>
  </SystemStage>
</template>
