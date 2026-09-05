<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EpochField from './components/EpochField.vue'
import { epochKey } from './epoch.ts'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from './data/planets.ts'
import { clampEpoch } from './lib/kepler.ts'
import { solarWindBounds } from './lib/solarWind.ts'

const live = ref(true)
const viewed = ref(new Date())
const selectedId = ref<string | null>(null)
let timer = 0

provide(epochKey, { viewed, live, selectedId })

const route = useRoute()
const router = useRouter()
const subtitle = computed(() =>
  typeof route.meta.subtitle === 'string' ? route.meta.subtitle : null,
)
const isDetailView = computed(() => route.name !== 'solar')
const epochRange = computed(() => {
  if (route.name === 'earth-fields') return solarWindBounds()
  return { fromMs: ELEMENTS_VALID_FROM_MS, toMs: ELEMENTS_VALID_TO_MS }
})

function startLiveClock() {
  window.clearInterval(timer)
  timer = window.setInterval(() => {
    viewed.value = clampViewed(new Date())
  }, 1000)
}

function stopLiveClock() {
  window.clearInterval(timer)
  timer = 0
}

function clampToRange(date: Date, fromMs: number, toMs: number): Date {
  const ms = Math.min(toMs, Math.max(fromMs, date.getTime()))
  return ms === date.getTime() ? date : new Date(ms)
}

function clampViewed(date: Date): Date {
  const planetary = clampEpoch(date)
  return clampToRange(planetary, epochRange.value.fromMs, epochRange.value.toMs)
}

function goLive() {
  live.value = true
  viewed.value = clampViewed(new Date())
}

function setViewed(at: Date) {
  live.value = false
  viewed.value = clampViewed(at)
}

watch(live, (isLive) => {
  if (isLive) startLiveClock()
  else stopLiveClock()
})

watch(
  () => route.name,
  () => {
    selectedId.value = null
    viewed.value = clampViewed(viewed.value)
  },
)

function onAppKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return
  }
  if (selectedId.value) {
    selectedId.value = null
    event.preventDefault()
    return
  }
  if (
    route.name === 'earth-time' ||
    route.name === 'earth-eclipse' ||
    route.name === 'earth-fields'
  ) {
    void router.push({ name: 'earth-system' })
    event.preventDefault()
    return
  }
  if (route.name === 'mars-time') {
    void router.push({ name: 'solar' })
    event.preventDefault()
    return
  }
  if (isDetailView.value) {
    void router.push({ name: 'solar' })
    event.preventDefault()
  }
}

onMounted(() => {
  if (live.value) startLiveClock()
  window.addEventListener('keydown', onAppKeydown)
})

onUnmounted(() => {
  stopLiveClock()
  window.removeEventListener('keydown', onAppKeydown)
})
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1>
        <RouterLink class="app__title" to="/">Solestia</RouterLink>
        <span v-if="subtitle" class="app__subtitle">{{ subtitle }}</span>
      </h1>
      <EpochField
        :at="viewed"
        :live="live"
        :from-ms="epochRange.fromMs"
        :to-ms="epochRange.toMs"
        @change="setViewed"
        @live="goLive"
      />
    </header>
    <RouterView />
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables' as *;

$center-width: 32rem;

.app {
  max-width: 1500px;
  margin: 0 auto;
  padding: $spacing-lg $spacing-md 2.5rem;
  min-height: 100vh;
}

.app__header {
  max-width: $center-width;
  margin: 0 auto $spacing-md;
}

h1 {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.app__title {
  color: inherit;
  text-decoration: none;
}

.app__title:hover,
.app__title:focus-visible {
  color: var(--text);
  outline: none;
}

.app__subtitle {
  color: $color-text-muted;
  font-size: 0.85rem;
  font-weight: 500;
}
</style>
