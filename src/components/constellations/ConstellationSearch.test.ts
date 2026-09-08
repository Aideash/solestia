import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSTELLATIONS } from '../../data/constellations.ts'
import ConstellationSearch from './ConstellationSearch.vue'

const mountedWrappers: ReturnType<typeof mount>[] = []
const scrollIntoView = vi.fn()

type MediaStub = {
  emit: (matches: boolean) => void
  listenerCount: () => number
}

// A controllable `matchMedia` stub that models a real MediaQueryList closely
// enough to exercise the responsive default and the change listener: it records
// its subscribers so a test can emit a breakpoint change and confirm cleanup.
function stubMatchMedia(initialNarrow: boolean): MediaStub {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mql = {
    matches: initialNarrow,
    media: '(max-width: 56rem)',
    onchange: null,
    addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.add(cb)
    },
    removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      listeners.delete(cb)
    },
    addListener: (cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
    removeListener: (cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  }
  window.matchMedia = ((query: string) => {
    mql.media = query
    return mql
  }) as unknown as typeof window.matchMedia
  return {
    emit(matches: boolean) {
      mql.matches = matches
      for (const cb of listeners) cb({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

function mountSearch(activeId: string | null = null) {
  const wrapper = mount(ConstellationSearch, {
    attachTo: document.body,
    props: { activeId },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  scrollIntoView.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('ConstellationSearch', () => {
  it('searches all 88 catalog entries by alias and abbreviation', async () => {
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    expect(wrapper.findAll('[role="option"]')).toHaveLength(88)

    await input.setValue('Big Dipper')
    expect(wrapper.get('[role="option"]').text()).toContain('Ursa Major')

    await input.setValue('Ori')
    expect(wrapper.get('[role="option"]').text()).toContain('Orion')
  })

  it('moves the active option with the keyboard and emits its valid route ID', async () => {
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    await input.trigger('keydown.end')
    const lastOption = wrapper.findAll('[role="option"]').at(-1)
    expect(input.attributes('aria-activedescendant')).toBe(lastOption?.attributes('id'))

    await input.trigger('keydown.home')
    await input.trigger('keydown.arrow-up')
    expect(input.attributes('aria-activedescendant')).toBe(lastOption?.attributes('id'))

    await input.trigger('keydown.home')
    await input.trigger('keydown.arrow-down')
    const activeOptionId = input.attributes('aria-activedescendant')
    const activeOption = wrapper.get(`#${activeOptionId}`)
    const selectedId = activeOption.attributes('data-constellation-id')

    await input.trigger('keydown.enter')

    expect(CONSTELLATIONS.some(({ id }) => id === selectedId)).toBe(true)
    expect(wrapper.emitted('select')).toEqual([[selectedId]])
  })

  it('clears and closes results on Escape and reports no matches', async () => {
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    await input.setValue('not a constellation')
    expect(wrapper.text()).toContain('No constellations match')

    await input.trigger('keydown.escape')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('initializes and scrolls the active option from active-id', async () => {
    const wrapper = mountSearch('orion')
    const input = wrapper.get('input[role="combobox"]')
    const orion = wrapper.get('[data-constellation-id="orion"]')

    await nextTick()

    expect(orion.attributes('aria-selected')).toBe('true')
    expect(input.attributes('aria-activedescendant')).toBe(orion.attributes('id'))
    expect(scrollIntoView.mock.instances).toContain(orion.element)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('recomputes a closed active option and scrolls it after focus reopens results', async () => {
    const wrapper = mountSearch('orion')
    const input = wrapper.get('input[role="combobox"]')
    const disclosure = wrapper.get('button[data-compact-disclosure]')

    await disclosure.trigger('click')
    scrollIntoView.mockClear()
    await wrapper.setProps({ activeId: 'ursa-major' })
    expect(input.attributes('aria-expanded')).toBe('false')
    expect(input.attributes('aria-activedescendant')).toBeUndefined()

    await input.trigger('focus')
    await nextTick()

    const activeOption = wrapper.get('[data-constellation-id="ursa-major"]')
    expect(input.attributes('aria-activedescendant')).toBe(activeOption.attributes('id'))
    expect(scrollIntoView.mock.instances).toContain(activeOption.element)
  })

  it('exposes stateful compact disclosure without losing the combobox', async () => {
    const wrapper = mountSearch()
    const disclosure = wrapper.get('button[data-compact-disclosure]')

    expect(disclosure.attributes('aria-expanded')).toBe('true')
    await disclosure.trigger('click')
    expect(disclosure.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.find('input[role="combobox"]').exists()).toBe(true)
  })
})

describe('ConstellationSearch responsive open state', () => {
  it('starts open as a rail on a wide load', () => {
    stubMatchMedia(false)
    const wrapper = mountSearch()

    expect(wrapper.get('input[role="combobox"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.get('button[data-compact-disclosure]').attributes('aria-expanded')).toBe('true')
  })

  it('starts collapsed on a fresh narrow load so the scene stays visible', () => {
    stubMatchMedia(true)
    const wrapper = mountSearch()

    expect(wrapper.get('input[role="combobox"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    expect(wrapper.get('button[data-compact-disclosure]').attributes('aria-expanded')).toBe('false')
  })

  it('opens the narrow search when the field gains focus', async () => {
    stubMatchMedia(true)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    await input.trigger('focus')

    expect(input.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('opens the narrow search on keyboard navigation', async () => {
    stubMatchMedia(true)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    await input.trigger('keydown.arrow-down')

    expect(input.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('opens the narrow search on typing', async () => {
    stubMatchMedia(true)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')

    await input.setValue('ori')

    expect(input.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="option"]').text()).toContain('Orion')
  })

  it('toggles the narrow search with the disclosure control', async () => {
    stubMatchMedia(true)
    const wrapper = mountSearch()
    const disclosure = wrapper.get('button[data-compact-disclosure]')

    expect(disclosure.attributes('aria-expanded')).toBe('false')
    await disclosure.trigger('click')
    expect(disclosure.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    await disclosure.trigger('click')
    expect(disclosure.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('collapses an empty inactive search when the viewport narrows', async () => {
    const media = stubMatchMedia(false)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')
    expect(input.attributes('aria-expanded')).toBe('true')

    media.emit(true)
    await nextTick()

    expect(input.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('keeps a typed search open when the viewport narrows', async () => {
    const media = stubMatchMedia(false)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')
    await input.setValue('ori')

    media.emit(true)
    await nextTick()

    expect(input.attributes('aria-expanded')).toBe('true')
  })

  it('keeps an active search open when the viewport narrows', async () => {
    const media = stubMatchMedia(false)
    const wrapper = mountSearch('orion')
    const input = wrapper.get('input[role="combobox"]')

    media.emit(true)
    await nextTick()

    expect(input.attributes('aria-expanded')).toBe('true')
  })

  it('reopens the rail when the viewport widens', async () => {
    const media = stubMatchMedia(true)
    const wrapper = mountSearch()
    const input = wrapper.get('input[role="combobox"]')
    expect(input.attributes('aria-expanded')).toBe('false')

    media.emit(false)
    await nextTick()

    expect(input.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('removes its media listener on unmount', () => {
    const media = stubMatchMedia(false)
    const wrapper = mountSearch()
    expect(media.listenerCount()).toBe(1)

    wrapper.unmount()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)

    expect(media.listenerCount()).toBe(0)
  })
})
