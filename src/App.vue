<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SolarSystemView from './components/SolarSystemView.vue'
import { solarSystemAt } from './lib/kepler.ts'

const now = ref(new Date())
let timer = 0

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  window.clearInterval(timer)
})

const snapshot = computed(() => solarSystemAt(now.value))

const clockLabel = computed(() =>
  now.value.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZoneName: 'short',
  }),
)
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1>Solestia</h1>
      <p class="clock">{{ clockLabel }}</p>
    </header>
    <SolarSystemView :snapshot="snapshot" />
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables' as *;

.app {
  max-width: 24rem;
  margin: 0 auto;
  padding: $spacing-lg $spacing-md 2.5rem;
  min-height: 100vh;
}

.app__header {
  margin-bottom: $spacing-md;
}

h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.clock {
  margin: $spacing-xs 0 0;
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.8125rem;
}
</style>
