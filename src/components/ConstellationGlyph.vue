<script setup lang="ts">
import { computed } from 'vue'
import {
  buildConstellationGlyph,
  buildDualConstellationGlyph,
  type GlyphSegment,
} from '../lib/constellationGlyph.ts'

const props = defineProps<{
  constellationIds: readonly string[]
  /** Stroke color; typically the parent body's dial color. */
  color: string
}>()

/** Match PlanetClock faceRadius so the glyph sits inside the rim hole. */
const CX = 50
const CY = 50
const GLYPH_SIZE = 56

const single = computed(() => {
  if (props.constellationIds.length !== 1) return null
  return buildConstellationGlyph(props.constellationIds[0], {
    x: CX,
    y: CY,
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
  })
})

const dual = computed(() => {
  if (props.constellationIds.length < 2) return null
  return buildDualConstellationGlyph([props.constellationIds[0], props.constellationIds[1]], {
    x: CX,
    y: CY,
    width: GLYPH_SIZE + 8,
    height: GLYPH_SIZE,
  })
})

const segments = computed((): readonly GlyphSegment[] => {
  if (dual.value) return [...dual.value.left.segments, ...dual.value.right.segments]
  return single.value?.segments ?? []
})
</script>

<template>
  <g class="constellation-glyph" aria-hidden="true">
    <line
      v-for="(segment, index) in segments"
      :key="`seg-${index}`"
      class="constellation-glyph__line"
      :x1="segment.x1"
      :y1="segment.y1"
      :x2="segment.x2"
      :y2="segment.y2"
      :stroke="color"
    />
    <line
      v-if="dual"
      class="constellation-glyph__divider"
      :x1="dual.divider.x1"
      :y1="dual.divider.y1"
      :x2="dual.divider.x2"
      :y2="dual.divider.y2"
      :stroke="color"
    />
  </g>
</template>

<style scoped lang="scss">
.constellation-glyph__line {
  fill: none;
  stroke-opacity: 0.62;
  stroke-width: 0.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.constellation-glyph__divider {
  fill: none;
  stroke-opacity: 0.35;
  stroke-width: 0.45;
  stroke-linecap: round;
  pointer-events: none;
}
</style>
