<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ELEMENTS_VALID_FROM_MS, ELEMENTS_VALID_TO_MS } from '../data/planets.ts'
import { clampEpoch, clampEpochMs } from '../lib/kepler.ts'

const props = defineProps<{
  at: Date
  live: boolean
}>()

const emit = defineEmits<{
  change: [at: Date]
  live: []
}>()

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000
const MS_PER_MONTH = 30 * MS_PER_DAY
const DRAG_THRESHOLD = 4

const CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
}

function formatClock(date: Date): string {
  return date.toLocaleString(undefined, CLOCK_FORMAT)
}

const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const draft = ref('')
const editOrigin = ref('')
const dragging = ref(false)
const didScrub = ref(false)
const expanded = ref(false)

const rangeSpan = ELEMENTS_VALID_TO_MS - ELEMENTS_VALID_FROM_MS
const rangeValue = computed(() => clampEpochMs(props.at.getTime()) - ELEMENTS_VALID_FROM_MS)

const display = computed(() => formatClock(props.at))
const tzHours = computed(() => -props.at.getTimezoneOffset() / 60)

const nowMarkPct = computed(() => {
  void props.at
  void props.live
  const t = clampEpochMs(Date.now())
  return ((t - ELEMENTS_VALID_FROM_MS) / rangeSpan) * 100
})

function scrubMsPerPixel(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean }): number {
  if (event.altKey) return MS_PER_MONTH
  if (event.shiftKey) return MS_PER_DAY
  if (event.ctrlKey) return MS_PER_MINUTE
  return MS_PER_HOUR
}

function commitDate(date: Date) {
  emit('change', clampEpoch(date))
}

function parseDraft(raw: string): Date | 'live' | null {
  const text = raw.trim()
  if (!text) return null
  if (/^(now|live)$/i.test(text)) return 'live'
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function startEditing() {
  editing.value = true
  draft.value = display.value
  editOrigin.value = display.value
  void nextTick(() => {
    const el = inputEl.value
    if (!el) return
    el.focus()
    el.select()
  })
}

function cancelEditing() {
  editing.value = false
  draft.value = display.value
}

function commitDraft() {
  if (!editing.value) return
  const text = draft.value.trim()
  editing.value = false
  if (text === editOrigin.value.trim()) {
    draft.value = display.value
    return
  }
  const result = parseDraft(draft.value)
  if (result === 'live') {
    emit('live')
    return
  }
  if (result) commitDate(result)
  draft.value = display.value
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitDraft()
    inputEl.value?.blur()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelEditing()
    inputEl.value?.blur()
  }
}

let lastX = 0
let scrubMs = 0

function onPointerDown(event: PointerEvent) {
  if (editing.value || event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  didScrub.value = false
  lastX = event.clientX
  scrubMs = props.at.getTime()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

/**
 * Each movement is scaled on its own and added to the running total, so
 * changing modifier mid-drag re-scales only what follows. Scaling the whole
 * travel from the press instead would rewind everything already scrubbed.
 */
function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  if (!didScrub.value) {
    if (Math.abs(event.clientX - lastX) < DRAG_THRESHOLD) return
    didScrub.value = true
  }
  const dx = event.clientX - lastX
  lastX = event.clientX
  scrubMs = clampEpochMs(scrubMs + dx * scrubMsPerPixel(event))
  commitDate(new Date(scrubMs))
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  if (!didScrub.value) startEditing()
}

function onWheel(event: WheelEvent) {
  if (editing.value) return
  event.preventDefault()
  const delta = event.deltaX + event.deltaY
  commitDate(new Date(props.at.getTime() - (delta * scrubMsPerPixel(event)) / 8))
}

function onRangeInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  commitDate(new Date(ELEMENTS_VALID_FROM_MS + value))
}

onMounted(() => {
  rootEl.value?.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  rootEl.value?.removeEventListener('wheel', onWheel)
})

watch(
  () => props.at,
  (at) => {
    if (!editing.value) draft.value = formatClock(at)
  },
  { immediate: true },
)
</script>

<template>
  <div ref="rootEl" class="epoch">
    <div class="epoch__row">
      <input
        ref="inputEl"
        class="epoch__text"
        :class="{ 'epoch__text--dragging': dragging && didScrub }"
        type="text"
        spellcheck="false"
        autocomplete="off"
        aria-label="Viewing date and time. Drag or scroll to scrub; click to type."
        :value="editing ? draft : display"
        @input="draft = ($event.target as HTMLInputElement).value"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKeydown"
        @blur="commitDraft"
      />
      <button
        type="button"
        class="epoch__live"
        :class="{ 'epoch__live--on': live }"
        :aria-pressed="live"
        :aria-label="live ? 'Showing live time' : 'Reset to live time'"
        @click="emit('live')"
      >
        Live
      </button>
      <button
        type="button"
        class="epoch__caret"
        :class="{ 'epoch__caret--open': expanded }"
        aria-controls="epoch-details"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Hide date slider' : 'Show date slider'"
        @click="expanded = !expanded"
      >
        <svg viewBox="0 0 10 6" aria-hidden="true" focusable="false">
          <path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" stroke-width="1.4" />
        </svg>
      </button>
    </div>
    <Transition name="epoch-reveal">
      <div v-show="expanded" id="epoch-details" class="epoch__details">
        <div class="epoch__details-inner">
          <div class="epoch__track">
            <span
              class="epoch__now"
              :style="{ left: `${nowMarkPct}%` }"
              title="Now"
              aria-hidden="true"
            />
            <input
              class="epoch__range"
              type="range"
              min="0"
              :max="rangeSpan"
              :step="MS_PER_DAY"
              :value="rangeValue"
              :aria-valuetext="display"
              aria-label="Date across the 1800 to 2050 validity window"
              @input="onRangeInput"
            />
          </div>
          <span class="epoch__tz">GMT{{ tzHours > 0 ? '+' : '' }}{{ tzHours }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.epoch {
  margin-top: $spacing-xs;
}

.epoch__row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
}

.epoch__text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-family: $font-mono;
  font-size: 0.8125rem;
  cursor: ew-resize;
}

.epoch__text:hover,
.epoch__text:focus-visible {
  color: var(--text);
  outline: none;
}

.epoch__text:focus-visible {
  cursor: text;
}

.epoch__text--dragging {
  color: var(--text);
  cursor: grabbing;
}

.epoch__tz {
  display: block;
  margin-top: 0.2rem;
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.6875rem;
  text-align: right;
}

.epoch__live {
  flex: 0 0 auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.epoch__live:hover,
.epoch__live:focus-visible {
  color: var(--text);
  outline: none;
}

.epoch__live--on {
  opacity: 0.45;
  cursor: default;

  &:before {
    content: ' ';
    width: 0.75em;
    height: 0.75em;
    display: inline-block;
    background: radial-gradient(circle, #722 0%, transparent 100%);
    border-radius: 50%;
  }
}

.epoch__caret {
  display: flex;
  flex: 0 0 auto;
  align-self: center;
  margin: 0;
  padding: 0.15rem;
  border: 0;
  background: none;
  color: $color-text-muted;
  cursor: pointer;
}

.epoch__caret svg {
  width: 0.625rem;
  height: 0.375rem;
  transition: transform 220ms ease;
}

.epoch__caret--open svg {
  transform: rotate(180deg);
}

.epoch__caret:hover,
.epoch__caret:focus-visible {
  color: var(--text);
  outline: none;
}

/**
 * The 0fr/1fr row is what animates: the inner wrapper clips its own overflow so
 * the slider keeps its natural height instead of needing a measured pixel value.
 */
.epoch__details {
  display: grid;
  grid-template-rows: 1fr;
}

.epoch__details-inner {
  min-height: 0;
  overflow: hidden;
}

.epoch-reveal-enter-active,
.epoch-reveal-leave-active {
  transition:
    grid-template-rows 220ms ease,
    opacity 180ms ease;
}

.epoch-reveal-enter-from,
.epoch-reveal-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .epoch__caret svg,
  .epoch-reveal-enter-active,
  .epoch-reveal-leave-active {
    transition: none;
  }
}

/** The vertical padding keeps the range thumb clear of the reveal wrapper's clip. */
.epoch__track {
  position: relative;
  padding-block: 0.35rem;
}

.epoch__now {
  position: absolute;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 1px;
  margin-left: -0.5px;
  background: var(--accent);
  opacity: 0.7;
  pointer-events: none;
}

.epoch__range {
  display: block;
  width: 100%;
  height: 0.4rem;
  margin: 0;
  padding: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
</style>
