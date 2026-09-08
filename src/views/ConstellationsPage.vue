<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConstellationScaleLegend from '../components/constellations/ConstellationScaleLegend.vue'
import ConstellationScene from '../components/constellations/ConstellationScene.vue'
import ConstellationSearch from '../components/constellations/ConstellationSearch.vue'
import ConstellationSettings from '../components/constellations/ConstellationSettings.vue'
import type { ConstellationDragMode } from '../components/constellations/constellationDragControls.ts'
import type { ConstellationScaleData } from '../components/constellations/constellationSceneModel.ts'
import { constellationById } from '../data/constellations.ts'
import type { ConstellationDepthMode } from '../lib/constellationGeometry.ts'

const route = useRoute()
const router = useRouter()
const showStems = ref(false)
const previewFigureLines = ref(true)
const listPreviewId = ref<string | null>(null)
const depthMode = ref<ConstellationDepthMode>('compressed')
const dragMode = ref<ConstellationDragMode>('normal')
const scale = ref<ConstellationScaleData | null>(null)
const invalidMessage = ref<string | null>(null)

const selectedId = computed(() => {
  const value = route.params.id
  return typeof value === 'string' ? value : null
})
const selectedConstellation = computed(() =>
  selectedId.value ? constellationById(selectedId.value) : undefined,
)

watch(
  selectedId,
  (id) => {
    if (!id) return
    if (!constellationById(id)) {
      invalidMessage.value = `“${id}” is not a valid constellation. Showing the full sky instead.`
      void router.replace({ name: 'constellations' })
      return
    }
    invalidMessage.value = null
  },
  { immediate: true },
)

function selectConstellation(id: string): void {
  invalidMessage.value = null
  void router.push({ name: 'constellation', params: { id } })
}

function returnToSky(): void {
  invalidMessage.value = null
  void router.push({ name: 'constellations' })
}

function dismissInvalidMessage(): void {
  invalidMessage.value = null
}
</script>

<template>
  <main class="constellations-page">
    <div
      v-if="invalidMessage"
      class="constellations-page__notice"
      role="alert"
      aria-live="assertive"
    >
      <span class="constellations-page__notice-text">{{ invalidMessage }}</span>
      <button
        type="button"
        class="constellations-page__notice-dismiss"
        data-notice-dismiss
        @click="dismissInvalidMessage"
      >
        Dismiss
      </button>
    </div>

    <div class="constellations-page__layout">
      <aside class="constellations-page__search">
        <ConstellationSearch
          :active-id="selectedId"
          @select="selectConstellation"
          @hover="listPreviewId = $event"
        />
      </aside>

      <section class="constellations-page__stage" aria-label="Constellation explorer">
        <ConstellationScene
          :selected-id="selectedId"
          :show-stems="showStems"
          :depth-mode="depthMode"
          :preview-figure-lines="previewFigureLines"
          :list-preview-id="listPreviewId"
          :drag-mode="dragMode"
          @select="selectConstellation"
          @scale-change="scale = $event"
        />

        <div class="constellations-page__intro">
          <div v-if="selectedConstellation" data-constellation-detail>
            <p class="constellations-page__eyebrow">Constellation slice</p>
            <h2>{{ selectedConstellation.name }}</h2>
            <p>Drag to orbit around the slice and reveal its stellar depth.</p>
            <button type="button" data-return-to-sky @click="returnToSky">Return to sky</button>
          </div>
          <div v-else>
            <h2>Explore the celestial sphere</h2>
            <p>
              Drag to explore the celestial sphere; selecting or searching opens a constellation.
            </p>
          </div>
        </div>

        <div class="constellations-page__settings">
          <ConstellationSettings
            v-model:show-stems="showStems"
            v-model:depth-mode="depthMode"
            v-model:preview-figure-lines="previewFigureLines"
            v-model:drag-mode="dragMode"
          />
        </div>
        <div v-if="scale" class="constellations-page__scale">
          <ConstellationScaleLegend
            :maximum-ly="scale.maxLightYears"
            :depth-mode="depthMode"
            :unavailable-count="scale.unavailableCount"
          />
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

// Vertical space the sticky app header reserves above this immersive page, so
// the stage fills the rest of the viewport. Two values: the wide layout leaves a
// little extra breathing room, the compact layout hugs the shorter header.
$header-reserve: 4.5rem;
$header-reserve-compact: 4rem;

.constellations-page {
  position: relative;
  min-height: max(30rem, calc(100dvh - #{$header-reserve} - env(safe-area-inset-bottom)));
  color: #fff4d6;
  background: #05070d;
  overflow: hidden;
}

.constellations-page__notice {
  position: absolute;
  z-index: 30;
  top: $spacing-sm;
  left: 50%;
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: max-content;
  max-width: calc(100% - #{$spacing-md * 2});
  margin: 0;
  padding: $spacing-sm $spacing-md;
  color: #fff4d6;
  background: rgb(35 12 16 / 94%);
  border: 1px solid rgb(245 197 66 / 55%);
  border-radius: $radius-sm;
  transform: translateX(-50%);
}

.constellations-page__notice-text {
  min-width: 0;
}

.constellations-page__notice-dismiss {
  flex: none;
  padding: $spacing-xs $spacing-sm;
  color: #fff4d6;
  background: transparent;
  border: 1px solid rgb(245 197 66 / 55%);
  border-radius: $radius-sm;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;

  &:hover {
    background: rgb(245 197 66 / 16%);
  }

  &:focus-visible {
    outline: 2px solid #f5c542;
    outline-offset: 2px;
  }
}

.constellations-page__layout {
  display: grid;
  grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
  height: max(30rem, calc(100dvh - #{$header-reserve} - env(safe-area-inset-bottom)));
}

.constellations-page__search {
  z-index: 10;
  min-width: 0;
  overflow-y: auto;
  background: #02040a;
}

.constellations-page__stage {
  position: relative;
  min-width: 0;
  min-height: 20rem;
}

.constellations-page__intro {
  position: absolute;
  z-index: 5;
  top: max(#{$spacing-md}, env(safe-area-inset-top));
  left: $spacing-md;
  max-width: min(29rem, calc(100% - 9rem));
  padding: $spacing-md;
  pointer-events: none;
  background: linear-gradient(105deg, rgb(2 4 10 / 88%), rgb(2 4 10 / 50%) 72%, transparent);
  border-left: 2px solid rgb(115 213 232 / 55%);

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(1.1rem, 2vw, 1.55rem);
    font-weight: 600;
  }

  p {
    margin-top: $spacing-xs;
    color: rgb(255 244 214 / 72%);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  // Nested so it outranks `.constellations-page__intro p` on specificity alone,
  // which lets the eyebrow keep its accent color and size without `!important`.
  .constellations-page__eyebrow {
    color: #73d5e8;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  button {
    margin-top: $spacing-sm;
    padding: $spacing-xs $spacing-sm;
    color: #73d5e8;
    pointer-events: auto;
    background: rgb(2 4 10 / 78%);
    border: 1px solid rgb(115 213 232 / 45%);
    border-radius: $radius-sm;
    font: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid #f5c542;
      outline-offset: 2px;
    }
  }
}

.constellations-page__settings {
  position: absolute;
  z-index: 10;
  top: max(#{$spacing-md}, env(safe-area-inset-top));
  right: max(#{$spacing-md}, env(safe-area-inset-right));
}

.constellations-page__scale {
  position: absolute;
  z-index: 5;
  right: max(#{$spacing-md}, env(safe-area-inset-right));
  bottom: max(#{$spacing-md}, env(safe-area-inset-bottom));
}

@media (max-width: 56rem) {
  .constellations-page {
    min-height: calc(100dvh - #{$header-reserve-compact} - env(safe-area-inset-bottom));
    overflow: visible;
  }

  .constellations-page__layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(22rem, 1fr);
    height: auto;
    min-height: calc(100dvh - #{$header-reserve-compact} - env(safe-area-inset-bottom));
  }

  .constellations-page__search {
    overflow: visible;
  }

  .constellations-page__stage {
    height: max(22rem, calc(100dvh - 12rem - env(safe-area-inset-bottom)));
  }
}

@media (max-height: 36rem) and (max-width: 56rem) {
  .constellations-page__layout {
    grid-template-rows: auto 22rem;
  }

  .constellations-page__stage {
    height: 22rem;
  }

  .constellations-page__intro {
    max-width: calc(100% - 7rem);
    padding: $spacing-sm;
  }
}
</style>
