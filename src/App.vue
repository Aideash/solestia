<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EpochField from './components/EpochField.vue'
import { epochKey, SI_SECOND_CADENCE, type LiveCadence } from './epoch.ts'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from './data/planets.ts'
import { clampEpoch } from './lib/kepler.ts'
import { solarWindBounds } from './lib/solarWind.ts'

const live = ref(true)
const viewed = ref(new Date())
const selectedId = ref<string | null>(null)
const cadence = ref<LiveCadence>(SI_SECOND_CADENCE)
let timer = 0

provide(epochKey, { viewed, live, selectedId, cadence })

const route = useRoute()
const router = useRouter()
const subtitle = computed(() =>
  typeof route.meta.subtitle === 'string' ? route.meta.subtitle : null,
)
const isTimeless = computed(() => route.meta.timeless === true)
const isImmersive = computed(() => route.meta.immersive === true)
const hideHeader = computed(() => route.name === 'home')
const isDetailView = computed(() => route.name !== 'solar' && route.name !== 'home')
const epochRange = computed(() => {
  if (route.name === 'earth-fields') return solarWindBounds()
  return { fromMs: ELEMENTS_VALID_FROM_MS, toMs: ELEMENTS_VALID_TO_MS }
})

/**
 * Waits out whatever is left of the current tick rather than a fixed interval,
 * so the step lands on the boundary of the unit being shown and the wait cannot
 * drift. The elapsed reading comes from the clock's own frame, which is what
 * puts a decimal second or a kastha on its mark instead of near it.
 */
function scheduleTick() {
  const { tickMs, frameMs } = cadence.value
  const now = new Date()
  const elapsed = frameMs ? frameMs(now) : now.getTime()
  const remaining = tickMs - (((elapsed % tickMs) + tickMs) % tickMs)
  timer = window.setTimeout(() => {
    viewed.value = clampViewed(new Date())
    scheduleTick()
  }, remaining)
}

function startLiveClock() {
  stopLiveClock()
  scheduleTick()
}

function stopLiveClock() {
  window.clearTimeout(timer)
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

watch(cadence, () => {
  if (live.value) startLiveClock()
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
  if (route.name === 'constellation') {
    void router.push({ name: 'constellations' })
    event.preventDefault()
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
    route.name === 'earth-fields' ||
    route.name === 'earth-epicycles'
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
  <div class="app" :class="{ 'app--immersive': isImmersive, 'app--home': hideHeader }">
    <header v-show="!hideHeader">
      <div class="app__header">
        <h1>
          <RouterLink class="app__title" to="/">Solestia</RouterLink>
          <span v-if="subtitle" class="app__subtitle">{{ subtitle }}</span>
        </h1>
        <EpochField
          v-if="!isTimeless"
          :at="viewed"
          :live="live"
          :from-ms="epochRange.fromMs"
          :to-ms="epochRange.toMs"
          @change="setViewed"
          @live="goLive"
        />
      </div>
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
  padding: $spacing-md $spacing-md 2.5rem;
  min-height: 100vh;
}

.app--immersive {
  max-width: none;
  padding: max(#{$spacing-sm}, env(safe-area-inset-top))
    max(#{$spacing-sm}, env(safe-area-inset-right)) max(#{$spacing-sm}, env(safe-area-inset-bottom))
    max(#{$spacing-sm}, env(safe-area-inset-left));
}

.app--home {
  padding: 0;
}

header {
  background: linear-gradient(to bottom, $color-bg 85%, transparent);
  position: sticky;
  top: 0;
  z-index: 1000;
  padding: 0.5rem 0 1px 0;
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
