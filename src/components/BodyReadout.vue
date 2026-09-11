<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, useSlots, watch } from 'vue'
import type { ReadoutColumn, ReadoutNavigation, ReadoutRow } from '../lib/readout.ts'

const props = defineProps<{
  /** Caption above the table, reused as the table's own accessible caption. */
  title: string
  /** Heading of the sticky first column, such as Planet, Moon or Object. */
  bodyHeading: string
  columns: readonly ReadoutColumn[]
  rows: readonly ReadoutRow[]
  /** Where the column choice persists. A new key reloads the choice. */
  storageKey: string
  selectedId?: string | null
  navigation?: readonly ReadoutNavigation[]
}>()

const emit = defineEmits<{
  select: [id: string]
  open: [id: string]
}>()

const slots = useSlots()
const helpId = useId()

const visibleColumns = ref<Set<string>>(new Set())

function storedColumns(): Set<string> {
  const known = new Set(props.columns.map((column) => column.id))
  const fallback = new Set(
    props.columns.filter((column) => column.onByDefault).map((column) => column.id),
  )
  try {
    const raw = localStorage.getItem(props.storageKey)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && known.has(id)))
  } catch {
    return fallback
  }
}

watch(
  () => props.storageKey,
  () => {
    visibleColumns.value = storedColumns()
  },
  { immediate: true },
)

const shownColumns = computed(() =>
  props.columns.filter((column) => visibleColumns.value.has(column.id)),
)

function showColumn(id: string): boolean {
  return visibleColumns.value.has(id)
}

function toggleColumn(id: string) {
  const next = new Set(visibleColumns.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  visibleColumns.value = next
  try {
    localStorage.setItem(props.storageKey, JSON.stringify([...next]))
  } catch {
    // Private mode or quota — the picker still works for the session.
  }
}

const columnsOpen = ref(false)
const columnsRoot = ref<HTMLElement | null>(null)

function onDocPointerdown(event: PointerEvent) {
  if (!columnsOpen.value) return
  const target = event.target
  if (target instanceof Node && columnsRoot.value?.contains(target)) return
  columnsOpen.value = false
}

function onDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !columnsOpen.value) return
  columnsOpen.value = false
  event.preventDefault()
  event.stopPropagation()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerdown)
  document.addEventListener('keydown', onDocKeydown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerdown)
  document.removeEventListener('keydown', onDocKeydown, true)
})

/** Navigation rows keyed by the body row they follow. */
const navigationAfter = computed(() => {
  const byRow = new Map<string, ReadoutNavigation[]>()
  for (const entry of props.navigation ?? []) {
    const existing = byRow.get(entry.afterId)
    if (existing) existing.push(entry)
    else byRow.set(entry.afterId, [entry])
  }
  return byRow
})

/**
 * Roving tabindex: the table is a single tab stop, then the arrow keys walk the
 * rows. The dials and the diagram stay click-only so the same bodies don't turn
 * up three times in the tab order.
 */
const focusedId = ref<string | null>(null)

const tabStopId = computed(() => focusedId.value ?? props.selectedId ?? props.rows[0]?.id ?? null)

function focusRow(row: Element | null | undefined) {
  if (row instanceof HTMLElement) row.focus()
}

function onRowKeydown(event: KeyboardEvent, id: string, action: 'select' | 'open' = 'select') {
  const row = event.currentTarget as HTMLTableRowElement
  const body = row.parentElement
  if (!body) return

  switch (event.key) {
    case 'ArrowDown':
      focusRow(row.nextElementSibling ?? body.firstElementChild)
      break
    case 'ArrowUp':
      focusRow(row.previousElementSibling ?? body.lastElementChild)
      break
    case 'Home':
      focusRow(body.firstElementChild)
      break
    case 'End':
      focusRow(body.lastElementChild)
      break
    case 'Enter':
    case ' ':
      if (action === 'open') emit('open', id)
      else emit('select', id)
      break
    default:
      return
  }
  event.preventDefault()
}

/** A second click of a double-click is the open gesture, not a reselection. */
function onRowClick(id: string, event: MouseEvent) {
  if (event.detail > 1) return
  emit('select', id)
}
</script>

<template>
  <div class="readout-block">
    <div class="readout__caption">
      <span class="readout__caption-title">{{ title }}</span>
      <span v-if="slots.help" class="help">
        <button
          type="button"
          class="help__btn"
          :aria-describedby="helpId"
          aria-label="About table symbols"
        >
          i
        </button>
        <div :id="helpId" role="tooltip" class="help__panel">
          <slot name="help" />
        </div>
      </span>
      <div ref="columnsRoot" class="readout__columns">
        <button
          type="button"
          class="readout__columns-btn"
          :aria-expanded="columnsOpen"
          :aria-controls="`${helpId}-columns`"
          aria-haspopup="true"
          aria-label="Table columns"
          @click="columnsOpen = !columnsOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 5h4v14H3V5Zm7 0h4v14h-4V5Zm7 0h4v14h-4V5Z" />
          </svg>
        </button>
        <Transition name="menu">
          <div
            v-show="columnsOpen"
            :id="`${helpId}-columns`"
            class="readout__columns-menu"
            :aria-labelledby="`${helpId}-columns-title`"
          >
            <p :id="`${helpId}-columns-title`" class="readout__columns-title">Columns</p>
            <label v-for="column in columns" :key="column.id" class="readout__columns-item">
              <input
                type="checkbox"
                :checked="showColumn(column.id)"
                @change="toggleColumn(column.id)"
              />
              {{ column.label }}
            </label>
          </div>
        </Transition>
      </div>
    </div>
    <div class="readout-scroll">
      <table class="readout">
        <caption class="readout__sr">
          {{
            title
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="readout__body-name">{{ bodyHeading }}</th>
            <th v-for="column in shownColumns" :key="column.id" scope="col" :title="column.title">
              <slot :name="`head-${column.id}`">{{ column.heading }}</slot>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr
              :class="{ selected: selectedId === row.id }"
              :tabindex="tabStopId === row.id ? 0 : -1"
              :aria-current="selectedId === row.id ? 'true' : undefined"
              @click="onRowClick(row.id, $event)"
              @dblclick="emit('open', row.id)"
              @focus="focusedId = row.id"
              @keydown="onRowKeydown($event, row.id)"
            >
              <th scope="row" class="readout__body-name">
                <span v-if="row.color" class="swatch" :style="{ background: row.color }"></span>
                {{ row.name }}
                <span v-if="row.detail" class="readout__body-detail">{{ row.detail }}</span>
              </th>
              <td
                v-for="column in shownColumns"
                :key="column.id"
                :title="row.cells[column.id]?.title"
              >
                <span class="pair">{{ row.cells[column.id]?.primary ?? '—' }}</span>
                <span v-if="row.cells[column.id]?.secondary" class="pair pair--dim">
                  {{ row.cells[column.id]?.secondary }}
                </span>
              </td>
            </tr>
            <tr
              v-for="entry in navigationAfter.get(row.id) ?? []"
              :key="entry.id"
              class="readout__navigation"
              :tabindex="tabStopId === entry.id ? 0 : -1"
              @click="emit('open', entry.id)"
              @focus="focusedId = entry.id"
              @keydown="onRowKeydown($event, entry.id, 'open')"
            >
              <th :colspan="shownColumns.length + 1" scope="row">
                <span class="readout__navigation-name">{{ entry.name }}</span>
                <span class="readout__navigation-detail">{{ entry.detail }}</span>
              </th>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/menu' as menu;
@use '../styles/variables' as *;

@include menu.menu-transition;

.readout-block {
  min-width: 0;
}

.readout-scroll {
  overflow-x: auto;
  width: 100%;
}

.readout {
  --row-bg: #{$color-bg};
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.readout__caption {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: $spacing-sm;
  font-weight: 600;
}

.readout__caption-title {
  font-weight: 600;
}

.readout__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.readout__columns {
  position: relative;
  flex: none;
  margin-left: auto;
}

.readout__columns-btn {
  @include menu.icon-button;
}

.readout__columns-btn svg {
  width: 0.9rem;
  height: 0.9rem;
}

.readout__columns-menu {
  @include menu.menu-panel;

  max-height: min(22rem, 70vh);
  overflow-y: auto;
}

.readout__columns-title {
  @include menu.menu-title;
}

.readout__columns-item {
  @include menu.menu-item;
}

.help {
  position: relative;
  display: inline-block;
  margin-left: 0.35rem;
  font-weight: 400;
  vertical-align: middle;
}

.help__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: 1px solid $color-border;
  border-radius: 50%;
  background: transparent;
  color: $color-text-muted;
  font: inherit;
  font-size: 0.7rem;
  font-style: italic;
  line-height: 1;
  cursor: help;
}

.help__btn:hover,
.help__btn:focus-visible {
  color: $color-text;
  border-color: color-mix(in srgb, $color-accent 55%, $color-border);
  outline: none;
}

.help__panel {
  display: none;
  overflow: auto;
  position: absolute;
  z-index: 20;
  top: 100%;
  left: 0;
  width: min(18.5rem, 70vw);
  max-height: 350px;
  padding: 0.65rem 0.75rem;
  border: 1px solid $color-border;
  border-radius: $radius-sm;
  background: $color-surface;
  box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 35%);
  color: $color-text;
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
}

.help:hover .help__panel,
.help:focus-within .help__panel {
  display: block;
}

// The prose arrives through a slot, so it carries the caller's scope id.
.help__panel :deep(p) {
  margin: 0 0 0.55rem;
}

.help__panel :deep(p:last-child) {
  margin-bottom: 0;
}

th,
td {
  padding: 0.4rem 0.35rem;
  border-bottom: 1px solid $color-border;
  text-align: left;
  vertical-align: top;
}

td {
  min-width: 4.5rem;
}

tbody tr:last-child {
  th,
  td {
    border-bottom-color: transparent;
  }
}

/* A heading that switches units, supplied through a `head-<id>` slot. */
thead th :deep(.th-toggle) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;

  &:hover .th-mode,
  &:focus-visible {
    color: $color-text;
  }

  &:focus-visible {
    outline: none;
  }
}

thead th :deep(.th-mode) {
  font-size: 0.65rem;
  font-weight: 400;
  letter-spacing: 0.01em;
}

thead th :deep(.th-sym sub) {
  font-size: 0.65em;
}

tbody th {
  font-weight: 500;
  white-space: nowrap;
}

/* The first column stays put while the rest scrolls, so it paints its own
   background: the row tint under a fade to transparent at the right edge, with
   a soft shadow as the cue that there is more table out there. */
.readout__body-name {
  position: sticky;
  left: 0;
  z-index: 1;
  padding-right: 20px;
  background: linear-gradient(to right, var(--row-bg) 85%, transparent 100%);
  box-shadow: 0.4rem 0 0.55rem -0.35rem $color-bg;
}

thead .readout__body-name {
  z-index: 2;
}

.readout__body-detail {
  color: $color-text-muted;
}

/* Registering the property is what makes the row tint animatable. `initial-value`
   has to be computationally independent, so it cannot be the themed `var(--bg)`;
   the table below supplies the real starting color. */
@property --row-bg {
  syntax: '<color>';
  inherits: true;
  initial-value: transparent;
}

/* Rows tint themselves through `--row-bg` rather than a background on the row:
   the sticky first cell paints its own gradient and would otherwise bury it. */
tbody tr {
  cursor: pointer;
  background: var(--row-bg);
  transition: --row-bg 120ms ease;

  > * {
    background: var(--row-bg);
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 1px solid color-mix(in srgb, $color-accent 70%, transparent);
    outline-offset: -1px;
  }

  &:hover {
    --row-bg: #{color-mix(in srgb, $color-text 10%, $color-bg)};
  }

  &.selected {
    --row-bg: #{color-mix(in srgb, $color-accent 15%, $color-bg)};
  }

  &.selected:hover {
    --row-bg: #{color-mix(in srgb, $color-accent 20%, $color-bg)};
  }
}

.readout__navigation {
  --row-bg: #{color-mix(in srgb, $color-accent 7%, $color-bg)};

  > th {
    position: static;
    padding: 0.55rem 0.65rem;
    white-space: normal;
  }

  &:hover {
    --row-bg: #{color-mix(in srgb, $color-accent 14%, $color-bg)};
  }
}

.readout__navigation-name {
  margin-right: 1.25rem;
  color: $color-text;
  font-weight: 600;
}

.readout__navigation-detail {
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.7rem;
}

.swatch {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin-right: 0.4rem;
  vertical-align: middle;
}

.pair {
  display: block;
}

.pair--dim {
  color: $color-text-muted;
  font-family: $font-mono;
  font-size: 0.7rem;
}

@media (prefers-reduced-motion: reduce) {
  tbody tr {
    transition: none;
  }
}
</style>
