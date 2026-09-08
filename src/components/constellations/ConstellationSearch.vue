<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import {
  constellationById,
  searchConstellations,
  type Constellation,
} from '../../data/constellations.ts'

const props = defineProps<{
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  hover: [id: string | null]
}>()

function catalogIndex(id: string | null): number {
  if (!id) return 0
  const index = searchConstellations('').findIndex((constellation) => constellation.id === id)
  return index >= 0 ? index : 0
}

// Mirrors the SCSS breakpoint that switches the search from a rail to a sheet.
const NARROW_MEDIA_QUERY = '(max-width: 56rem)'
const narrowMedia =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_MEDIA_QUERY)
    : null

const query = ref('')
// Wide viewports present the search as a persistent rail; a fresh narrow load
// starts collapsed so the sky scene below it is not pushed off-screen. Absent a
// `matchMedia` implementation, assume the wide rail.
const isOpen = ref(!(narrowMedia?.matches ?? false))
const activeIndex = ref(catalogIndex(props.activeId))
let keepClosedForNextQueryChange = false
const listboxId = `constellation-listbox-${useId()}`

const results = computed(() => searchConstellations(query.value))
const activeOptionId = computed(() => {
  const constellation = results.value[activeIndex.value]
  return isOpen.value && constellation ? optionId(constellation.id) : undefined
})

function optionId(id: string): string {
  return `${listboxId}-${id}`
}

function selectedResultIndex(): number {
  if (!props.activeId) return -1
  return results.value.findIndex(({ id }) => id === props.activeId)
}

function normalizeActiveIndex(): void {
  const selectedIndex = selectedResultIndex()
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : 0
}

async function scrollActiveIntoView(): Promise<void> {
  await nextTick()
  const id = activeOptionId.value
  if (!id) return
  const option = document.getElementById(id)
  if (typeof option?.scrollIntoView === 'function') {
    option.scrollIntoView({ block: 'nearest' })
  }
}

function openResults(): void {
  const wasClosed = !isOpen.value
  isOpen.value = true
  if (wasClosed) void scrollActiveIntoView()
}

function emitHover(id: string | null): void {
  emit('hover', id)
}

function setActiveIndex(index: number, announceHover: boolean): void {
  activeIndex.value = index
  if (!announceHover || !isOpen.value) return
  emitHover(results.value[index]?.id ?? null)
}

function moveActive(direction: 1 | -1): void {
  openResults()
  if (results.value.length === 0) return
  setActiveIndex(
    (activeIndex.value + direction + results.value.length) % results.value.length,
    true,
  )
  void scrollActiveIntoView()
}

function selectConstellation(constellation: Constellation): void {
  if (!constellationById(constellation.id)) return
  activeIndex.value = results.value.findIndex(({ id }) => id === constellation.id)
  emitHover(null)
  emit('select', constellation.id)
  void scrollActiveIntoView()
}

function selectActive(): void {
  const constellation = results.value[activeIndex.value]
  if (constellation) selectConstellation(constellation)
}

function setBoundary(position: 'first' | 'last'): void {
  openResults()
  if (results.value.length === 0) return
  setActiveIndex(position === 'first' ? 0 : results.value.length - 1, true)
  void scrollActiveIntoView()
}

function clearAndClose(): void {
  keepClosedForNextQueryChange = query.value !== ''
  query.value = ''
  normalizeActiveIndex()
  isOpen.value = false
  emitHover(null)
}

function toggleDisclosure(): void {
  if (isOpen.value) {
    isOpen.value = false
    emitHover(null)
  } else {
    openResults()
  }
}

function handleViewportChange(event: MediaQueryListEvent): void {
  if (event.matches) {
    // Entering narrow: fold away an empty, inactive search so the scene shows,
    // but leave an in-progress search (typed or with a selection) open.
    if (query.value === '' && props.activeId === null) {
      isOpen.value = false
      emitHover(null)
    }
  } else {
    // Entering wide: the rail is always available.
    isOpen.value = true
  }
}

watch(query, () => {
  if (keepClosedForNextQueryChange) {
    keepClosedForNextQueryChange = false
    return
  }
  openResults()
  normalizeActiveIndex()
  void scrollActiveIntoView()
})

watch(
  () => props.activeId,
  () => {
    normalizeActiveIndex()
    void scrollActiveIntoView()
  },
)

watch(isOpen, (open) => {
  if (!open) emitHover(null)
})

onMounted(() => {
  narrowMedia?.addEventListener('change', handleViewportChange)
  void scrollActiveIntoView()
})

onBeforeUnmount(() => {
  narrowMedia?.removeEventListener('change', handleViewportChange)
})
</script>

<template>
  <section class="constellation-search" aria-label="Choose a constellation">
    <div class="constellation-search__topline">
      <label :for="`${listboxId}-input`">Search constellations</label>
      <button
        type="button"
        class="constellation-search__disclosure"
        data-compact-disclosure
        :aria-controls="listboxId"
        :aria-expanded="isOpen"
        @click="toggleDisclosure"
      >
        {{ isOpen ? 'Hide results' : 'Show results' }}
      </button>
    </div>

    <input
      :id="`${listboxId}-input`"
      v-model="query"
      class="constellation-search__input"
      type="search"
      role="combobox"
      autocomplete="off"
      :aria-controls="listboxId"
      :aria-expanded="isOpen"
      :aria-activedescendant="activeOptionId"
      aria-autocomplete="list"
      @focus="openResults"
      @keydown.arrow-down.prevent="moveActive(1)"
      @keydown.arrow-up.prevent="moveActive(-1)"
      @keydown.home.prevent="setBoundary('first')"
      @keydown.end.prevent="setBoundary('last')"
      @keydown.enter.prevent="selectActive"
      @keydown.escape.prevent="clearAndClose"
    />

    <div v-if="isOpen" class="constellation-search__results" @mouseleave="emit('hover', null)">
      <ul
        v-if="results.length > 0"
        :id="listboxId"
        class="constellation-search__list"
        role="listbox"
        aria-label="Constellations"
      >
        <li
          v-for="(constellation, index) in results"
          :id="optionId(constellation.id)"
          :key="constellation.id"
          class="constellation-search__option"
          :class="{
            'constellation-search__option--focused': index === activeIndex,
            'constellation-search__option--selected': constellation.id === activeId,
          }"
          role="option"
          :aria-selected="constellation.id === activeId"
          :data-constellation-id="constellation.id"
          @mousedown.prevent
          @click="selectConstellation(constellation)"
          @mousemove="setActiveIndex(index, true)"
        >
          <span>{{ constellation.name }}</span>
          <span class="constellation-search__abbr">{{ constellation.abbreviation }}</span>
        </li>
      </ul>
      <p v-else class="constellation-search__empty" role="status">
        No constellations match “{{ query }}”.
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../../styles/variables' as *;

.constellation-search {
  width: min(18rem, 100%);
  color: #fff4d6;
  background: color-mix(in srgb, #02040a 92%, transparent);
  border-right: 1px solid color-mix(in srgb, #73d5e8 32%, transparent);
  font-family: $font-sans;
}

.constellation-search__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: $spacing-md $spacing-md $spacing-sm;
  font-size: 0.8rem;
  color: color-mix(in srgb, #fff4d6 76%, #73d5e8);
}

.constellation-search__disclosure {
  display: none;
}

.constellation-search__input {
  width: calc(100% - #{$spacing-md * 2});
  margin: 0 $spacing-md $spacing-sm;
  padding: 0.65rem 0.75rem;
  color: #fff4d6;
  background: #02040a;
  border: 1px solid color-mix(in srgb, #73d5e8 42%, transparent);
  border-radius: $radius-sm;
  font: inherit;

  &:focus-visible {
    outline: 2px solid #f5c542;
    outline-offset: 2px;
  }
}

.constellation-search__results {
  border-top: 1px solid color-mix(in srgb, #73d5e8 20%, transparent);
}

.constellation-search__list {
  max-height: min(68vh, 34rem);
  padding: $spacing-xs;
  margin: 0;
  overflow-y: auto;
  list-style: none;
}

.constellation-search__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $spacing-sm;
  padding: 0.55rem 0.65rem;
  border-left: 2px solid transparent;
  border-radius: $radius-sm;
  color: color-mix(in srgb, #fff4d6 78%, transparent);
  cursor: pointer;

  &--focused {
    color: #fff4d6;
    background: color-mix(in srgb, #73d5e8 12%, transparent);
    border-left-color: #f5c542;
  }

  &--selected {
    color: #fff4d6;
    border-left-color: #73d5e8;
  }
}

.constellation-search__abbr {
  color: color-mix(in srgb, #73d5e8 72%, transparent);
  font-size: 0.78rem;
}

.constellation-search__empty {
  padding: $spacing-md;
  margin: 0;
  color: color-mix(in srgb, #fff4d6 64%, transparent);
  font-size: 0.85rem;
  line-height: 1.45;
}

@media (max-width: 56rem) {
  .constellation-search {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, #73d5e8 32%, transparent);
  }

  .constellation-search__topline {
    padding: $spacing-sm $spacing-md $spacing-xs;
  }

  .constellation-search__disclosure {
    display: inline-flex;
    padding: $spacing-xs $spacing-sm;
    color: #73d5e8;
    background: transparent;
    border: 1px solid color-mix(in srgb, #73d5e8 38%, transparent);
    border-radius: $radius-sm;
    font: inherit;

    &:focus-visible {
      outline: 2px solid #f5c542;
      outline-offset: 2px;
    }
  }

  .constellation-search__list {
    max-height: min(42vh, 22rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .constellation-search *,
  .constellation-search *::before,
  .constellation-search *::after {
    scroll-behavior: auto;
  }
}
</style>
