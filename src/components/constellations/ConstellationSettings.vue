<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, type CSSProperties } from 'vue'
import { CONSTELLATION_ATTRIBUTIONS } from '../../data/constellations.ts'
import type { ConstellationDepthMode } from '../../lib/constellationGeometry.ts'
import type { ConstellationDragMode } from './constellationDragControls.ts'
import { placeSettingsPopup } from './constellationSettingsPlacement.ts'

defineProps<{
  showStems: boolean
  depthMode: ConstellationDepthMode
  previewFigureLines: boolean
  dragMode: ConstellationDragMode
}>()

const emit = defineEmits<{
  'update:show-stems': [value: boolean]
  'update:depth-mode': [value: ConstellationDepthMode]
  'update:preview-figure-lines': [value: boolean]
  'update:drag-mode': [value: ConstellationDragMode]
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const firstControl = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const popupStyle = ref<CSSProperties>({})
const popupId = `constellation-settings-${useId()}`

function rootFontSizePx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function updatePopupPosition(): void {
  if (!trigger.value) return
  const rem = rootFontSizePx()
  const placement = placeSettingsPopup({
    trigger: trigger.value.getBoundingClientRect(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    margin: rem, // $spacing-md
    gap: rem * 0.5, // $spacing-sm
    preferredWidth: rem * 22,
  })
  popupStyle.value = {
    position: 'fixed',
    top: `${placement.top}px`,
    left: `${placement.left}px`,
    width: `${placement.width}px`,
    maxHeight: `${placement.maxHeight}px`,
    overflowY: 'auto',
  }
}

async function open(): Promise<void> {
  isOpen.value = true
  await nextTick()
  updatePopupPosition()
  firstControl.value?.focus()
}

function close(restoreFocus = true): void {
  if (!isOpen.value) return
  isOpen.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function toggle(): void {
  if (isOpen.value) close()
  else void open()
}

function isFocusablePointerTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
  )
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isOpen.value) return
  const target = event.target as Node
  if (root.value?.contains(target) || popup.value?.contains(target)) return
  close(!isFocusablePointerTarget(event.target))
}

function handleViewportChange(): void {
  if (isOpen.value) updatePopupPosition()
}

function emitStemChange(event: Event): void {
  emit('update:show-stems', (event.target as HTMLInputElement).checked)
}

function emitPreviewLinesChange(event: Event): void {
  emit('update:preview-figure-lines', (event.target as HTMLInputElement).checked)
}

function emitDepthChange(event: Event): void {
  emit('update:depth-mode', (event.target as HTMLInputElement).value as ConstellationDepthMode)
}

function emitDragModeChange(event: Event): void {
  emit('update:drag-mode', (event.target as HTMLInputElement).value as ConstellationDragMode)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <div ref="root" class="constellation-settings" @keydown.escape.stop.prevent="close()">
    <button
      ref="trigger"
      type="button"
      class="constellation-settings__button"
      aria-haspopup="dialog"
      :aria-controls="popupId"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <span aria-hidden="true">⚙</span>
      Settings
    </button>

    <Teleport to=".app">
      <section
        v-if="isOpen"
        :id="popupId"
        ref="popup"
        class="constellation-settings__popup"
        role="dialog"
        aria-label="Constellation settings"
        :style="popupStyle"
        @keydown.escape.stop.prevent="close()"
      >
        <div class="constellation-settings__heading">
          <h2>Constellation settings</h2>
          <button
            type="button"
            class="constellation-settings__close"
            data-settings-close
            @click="close()"
          >
            Close
          </button>
        </div>

        <label class="constellation-settings__check">
          <input
            ref="firstControl"
            type="checkbox"
            data-settings-preview-lines
            :checked="previewFigureLines"
            @change="emitPreviewLinesChange"
          />
          <span>
            <strong>Preview figure lines on hover</strong>
            <small>Show stick-figure lines when hovering a constellation in the list or sky.</small>
          </span>
        </label>

        <label class="constellation-settings__check">
          <input
            type="checkbox"
            data-settings-stems
            :checked="showStems"
            @change="emitStemChange"
          />
          <span>
            <strong>Projection stems</strong>
            <small>Connect placed objects to the reference plane.</small>
          </span>
        </label>

        <fieldset>
          <legend>Mouse controls</legend>
          <label class="constellation-settings__choice">
            <input
              type="radio"
              name="constellation-drag-mode"
              data-settings-drag-mode
              value="normal"
              :checked="dragMode === 'normal'"
              @change="emitDragModeChange"
            />
            <span>
              <strong>Normal</strong>
              <small>Dragging moves the sky with your cursor.</small>
            </span>
          </label>
          <label class="constellation-settings__choice">
            <input
              type="radio"
              name="constellation-drag-mode"
              data-settings-drag-mode
              value="inverted"
              :checked="dragMode === 'inverted'"
              @change="emitDragModeChange"
            />
            <span>
              <strong>Inverted</strong>
              <small>Dragging moves the sky against your cursor.</small>
            </span>
          </label>
        </fieldset>

        <fieldset>
          <legend>Depth</legend>
          <label class="constellation-settings__choice">
            <input
              type="radio"
              name="constellation-depth"
              value="compressed"
              :checked="depthMode === 'compressed'"
              @change="emitDepthChange"
            />
            <span>
              <strong>Compressed depth</strong>
              <small>Brings distant stars closer while preserving their order.</small>
            </span>
          </label>
          <label class="constellation-settings__choice">
            <input
              type="radio"
              name="constellation-depth"
              value="true"
              :checked="depthMode === 'true'"
              @change="emitDepthChange"
            />
            <span>
              <strong>True scale</strong>
              <small>Preserves physical distance in every direction.</small>
            </span>
          </label>
        </fieldset>

        <details class="constellation-settings__credits" @toggle="updatePopupPosition">
          <summary>Data credits</summary>
          <ul>
            <li v-for="attribution in CONSTELLATION_ATTRIBUTIONS" :key="attribution.label">
              <strong>{{ attribution.label }}</strong>
              <span>{{ attribution.attribution }}</span>
              <span>
                <a :href="attribution.sourceUrl" target="_blank" rel="noreferrer">Source</a>
                <a
                  v-if="attribution.sourcePageUrl"
                  :href="attribution.sourcePageUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  Details
                </a>
                · {{ attribution.license
                }}<template v-if="attribution.revision">
                  · revision {{ attribution.revision }}</template
                >
              </span>
            </li>
          </ul>
        </details>
      </section>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.constellation-settings {
  position: relative;
  display: inline-block;
  color: #fff4d6;
  font-family: $font-sans;
}

.constellation-settings__button {
  display: inline-flex;
  align-items: center;
  gap: $spacing-sm;
  min-height: 2.4rem;
  padding: $spacing-sm $spacing-md;
  color: #fff4d6;
  background: color-mix(in srgb, #02040a 88%, transparent);
  border: 1px solid color-mix(in srgb, #73d5e8 38%, transparent);
  border-radius: $radius-sm;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #f5c542;
    outline-offset: 2px;
  }
}

.constellation-settings__popup {
  z-index: 1100;
  box-sizing: border-box;
  padding: $spacing-md;
  color: #fff4d6;
  background: color-mix(in srgb, #02040a 96%, transparent);
  border: 1px solid color-mix(in srgb, #73d5e8 38%, transparent);
  border-radius: $radius-md;
  box-shadow: 0 0.85rem 2rem rgb(0 0 0 / 38%);
  font-family: $font-sans;
}

.constellation-settings__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  padding: 0 $spacing-sm $spacing-sm;

  h2 {
    margin: 0;
    color: #fff4d6;
    font-size: 0.95rem;
    font-weight: 600;
  }
}

.constellation-settings__close {
  padding: $spacing-xs $spacing-sm;
  color: #73d5e8;
  background: transparent;
  border: 1px solid color-mix(in srgb, #73d5e8 38%, transparent);
  border-radius: $radius-sm;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #f5c542;
    outline-offset: 2px;
  }
}

.constellation-settings__check,
.constellation-settings__choice {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  cursor: pointer;

  &:focus-within {
    outline: 2px solid #f5c542;
    outline-offset: 1px;
  }

  input {
    margin-top: 0.2rem;
    accent-color: #73d5e8;
  }

  span {
    display: grid;
    gap: 0.15rem;
  }

  strong {
    font-size: 0.88rem;
    font-weight: 600;
  }

  small {
    color: color-mix(in srgb, #fff4d6 62%, transparent);
    line-height: 1.35;
  }
}

fieldset {
  padding: $spacing-sm 0 0;
  margin: $spacing-sm 0 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, #73d5e8 20%, transparent);
}

legend {
  padding: $spacing-md $spacing-sm $spacing-xs;
  color: color-mix(in srgb, #fff4d6 74%, #73d5e8);
  font-size: 0.78rem;
}

.constellation-settings__credits {
  padding: $spacing-sm 0 0;
  margin-top: $spacing-sm;
  border-top: 1px solid color-mix(in srgb, #73d5e8 20%, transparent);
  color: color-mix(in srgb, #fff4d6 66%, transparent);
  font-size: 0.75rem;

  summary {
    padding: $spacing-xs $spacing-sm;
    color: #73d5e8;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid #f5c542;
      outline-offset: 2px;
    }
  }

  ul {
    display: grid;
    gap: $spacing-sm;
    padding: $spacing-sm;
    margin: 0;
    list-style: none;
  }

  li,
  li > span {
    display: block;
  }

  strong {
    color: color-mix(in srgb, #fff4d6 86%, transparent);
    font-weight: 600;
  }

  a {
    color: #73d5e8;
  }
}

@media (prefers-reduced-motion: reduce) {
  .constellation-settings *,
  .constellation-settings *::before,
  .constellation-settings *::after {
    transition: none;
  }
}
</style>
