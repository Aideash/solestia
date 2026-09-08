<script setup lang="ts">
import { computed } from 'vue'
import type { ConstellationDepthMode } from '../../lib/constellationGeometry.ts'

const props = withDefaults(
  defineProps<{
    maximumLy: number
    depthMode: ConstellationDepthMode
    unavailableCount?: number
  }>(),
  {
    unavailableCount: 0,
  },
)

const maximumLabel = computed(() => {
  if (!Number.isFinite(props.maximumLy) || props.maximumLy <= 0) return null
  if (props.maximumLy >= 1_000) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
      props.maximumLy / 1_000,
    )} kly`
  }
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    props.maximumLy,
  )} ly`
})

const omittedCount = computed(() =>
  Number.isFinite(props.unavailableCount) && props.unavailableCount > 0
    ? Math.floor(props.unavailableCount)
    : 0,
)
</script>

<template>
  <aside class="constellation-scale" aria-label="Constellation distance scale">
    <span class="constellation-scale__mode">
      {{ depthMode === 'compressed' ? 'Compressed depth' : 'True scale' }}
    </span>
    <span v-if="maximumLabel" class="constellation-scale__maximum">
      Physical maximum {{ maximumLabel }}
    </span>
    <span v-else class="constellation-scale__maximum">Distance unavailable</span>
    <span v-if="omittedCount" class="constellation-scale__omitted">
      {{ omittedCount }} {{ omittedCount === 1 ? 'star' : 'stars' }} omitted for unavailable
      distances
    </span>
  </aside>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.constellation-scale {
  display: grid;
  width: max-content;
  max-width: min(18rem, calc(100vw - #{$spacing-md * 2}));
  gap: 0.15rem;
  padding: $spacing-sm $spacing-md;
  color: #fff4d6;
  background: color-mix(in srgb, #02040a 90%, transparent);
  border: 1px solid color-mix(in srgb, #73d5e8 34%, transparent);
  border-radius: $radius-sm;
  box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 34%);
  font-family: $font-sans;
  line-height: 1.35;
}

.constellation-scale__mode {
  color: #73d5e8;
  font-size: 0.78rem;
  font-weight: 600;
}

.constellation-scale__maximum {
  font-size: 0.84rem;
}

.constellation-scale__omitted {
  max-width: 16rem;
  color: color-mix(in srgb, #fff4d6 62%, transparent);
  font-size: 0.72rem;
}
</style>
