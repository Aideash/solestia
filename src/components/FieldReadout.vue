<script setup lang="ts">
import { nextTick, ref } from 'vue'

export type FieldCursor = {
  strength: string
  dilation?: string | null
  hint?: string
}

export type FieldPin = {
  key: string
  strength: string
  dilation?: string
  hint?: string
}

const props = defineProps<{
  cursor: FieldCursor | null
  pins: FieldPin[]
}>()

const emit = defineEmits<{
  remove: [index: number]
}>()

const paddingTransitionEnabled = ref(true)
const paddingCollapsed = ref(false)
const shiftAnimating = ref(false)
const overflowLeaveActive = ref(false)
const listRef = ref<{ $el: HTMLElement } | null>(null)
const listMinHeight = ref('')

function listEl(): HTMLElement | null {
  return listRef.value?.$el ?? null
}

function listRowGap(parent: HTMLElement): number {
  return parseFloat(getComputedStyle(parent).rowGap) || 0
}

/** Run the pin-stack animation after the parent prepends a pin. */
async function notifyPinned() {
  shiftAnimating.value = true
  paddingTransitionEnabled.value = false
  paddingCollapsed.value = true
  await nextTick()
  paddingTransitionEnabled.value = true
  await nextTick()
  requestAnimationFrame(() => {
    paddingCollapsed.value = false
  })
}

function onPaddingTransitionEnd(event: TransitionEvent) {
  if (event.propertyName !== 'padding-top') return
  shiftAnimating.value = false
}

function onAfterLeave() {
  overflowLeaveActive.value = false
  listMinHeight.value = ''
}

function onBeforeLeave(el: Element) {
  const node = el as HTMLElement
  const list = listEl()
  if (overflowLeaveActive.value && list) {
    listMinHeight.value = `${list.offsetHeight}px`
    const gap = listRowGap(list)
    node.style.top = 'auto'
    node.style.bottom = `${-(node.offsetHeight + gap)}px`
    node.style.width = `${node.offsetWidth}px`
    return
  }
  node.style.top = `${node.offsetTop}px`
  node.style.bottom = 'auto'
  node.style.width = `${node.offsetWidth}px`
}

function remove(index: number) {
  if (props.pins.length >= 5) overflowLeaveActive.value = true
  emit('remove', index)
}

defineExpose({ notifyPinned })
</script>

<template>
  <div class="field-readout">
    <div v-if="cursor" class="field-readout__cursor">
      <span>{{ cursor.strength }}</span>
      <span v-if="cursor.dilation" class="field-readout__dim"> · {{ cursor.dilation }}</span>
      <span v-if="cursor.hint" class="field-readout__hint"> · {{ cursor.hint }}</span>
    </div>
    <div
      v-if="pins.length > 0"
      class="field-readout__history"
      :class="{
        'field-readout__history--no-transition': !paddingTransitionEnabled,
        'field-readout__history--collapsed': paddingCollapsed,
      }"
      @transitionend="onPaddingTransitionEnd"
    >
      <TransitionGroup
        ref="listRef"
        name="field-pins"
        tag="div"
        class="field-readout__list"
        :style="listMinHeight ? { minHeight: listMinHeight } : undefined"
        :move-class="shiftAnimating ? 'field-pins-move--paused' : 'field-pins-move'"
        @before-leave="onBeforeLeave"
        @after-leave="onAfterLeave"
      >
        <div v-for="(pin, index) in pins" :key="pin.key" class="field-readout__point">
          <button
            type="button"
            class="field-readout__remove"
            aria-label="Remove sample"
            @click.stop="remove(index)"
          >
            −
          </button>
          <span>
            <span>{{ pin.strength }}</span>
            <span v-if="pin.dilation" class="field-readout__dim"> · {{ pin.dilation }}</span>
            <span v-if="pin.hint" class="field-readout__hint"> · {{ pin.hint }}</span>
          </span>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.field-readout {
  pointer-events: none;
  --field-font-size: 0.7rem;
  --field-line-height: 1.2;
  --field-padding-y: 0.2rem;
  --field-gap: 0.25rem;
  /* One readout box (text + padding + 1px borders) plus the list gap. */
  --field-row-height: calc(
    var(--field-font-size) * var(--field-line-height) + var(--field-padding-y) * 2 + 2px +
      var(--field-gap)
  );
  --field-transition: 180ms ease;
}

.field-readout__cursor {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  padding: var(--field-padding-y) 0.45rem;
  color: $color-text;
  font-family: $font-mono;
  font-size: var(--field-font-size);
  line-height: var(--field-line-height);
  white-space: nowrap;
  background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  backdrop-filter: blur(4px);
}

.field-readout__dim {
  color: $color-text-muted;
}

.field-readout__hint {
  color: $color-accent;
}

.field-readout__history {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 100%;
  padding-top: var(--field-row-height);
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: var(--field-font-size);
  line-height: var(--field-line-height);
  transition:
    padding-top var(--field-transition),
    border-width var(--field-transition);

  &--collapsed {
    padding-top: 0;
  }

  &--no-transition {
    transition: none;
  }

  &:hover .field-readout__remove {
    opacity: 1;
  }
}

.field-readout__list {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--field-gap);
}

.field-readout__point {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  pointer-events: auto;
  white-space: nowrap;

  > span {
    padding: var(--field-padding-y) 0.45rem;
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    border: 1px solid var(--border);
    border-radius: $radius-sm;
  }
}

.field-readout__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  line-height: 1;
  color: $color-text-muted;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--field-transition);

  &:hover,
  &:focus-visible {
    color: $color-text;
    opacity: 1;
    outline: none;
  }
}

:deep(.field-pins-move) {
  transition: transform var(--field-transition);
}

:deep(.field-pins-move--paused) {
  transition: none;
}

:deep(.field-pins-leave-active) {
  position: absolute;
  right: 0;
  transition: opacity var(--field-transition);
}

:deep(.field-pins-leave-to) {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .field-readout__history,
  .field-readout__remove,
  :deep(.field-pins-move),
  :deep(.field-pins-leave-active) {
    transition: none;
  }
}
</style>
