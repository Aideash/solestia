import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.vue'
import ConstellationsPage from '../views/ConstellationsPage.vue'

// The immersive page mounts a WebGL scene that jsdom can't run; the shell tests
// only care about keyboard routing, so stub the scene to a passive contract.
vi.mock('../components/constellations/ConstellationScene.vue', () => ({
  default: {
    name: 'ConstellationScene',
    props: {
      selectedId: { type: String, default: null },
      showStems: { type: Boolean, default: false },
      showProperMotion: { type: Boolean, default: false },
      properMotionScope: { type: String, default: 'figure' },
      depthMode: { type: String, default: 'compressed' },
    },
    emits: ['select', 'scale-change'],
    template: '<div class="scene-contract" />',
  },
}))

const Page = defineComponent({ template: '<main>Page</main>' })
const mountedWrappers: VueWrapper[] = []

async function mountApp(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: Page,
        meta: { timeless: true, immersive: true },
      },
      { path: '/orrery', name: 'solar', component: Page },
      {
        path: '/constellations',
        name: 'constellations',
        component: Page,
        meta: { subtitle: 'Constellations', timeless: true, immersive: true },
      },
      {
        path: '/constellation/:id',
        name: 'constellation',
        component: Page,
        meta: { subtitle: 'Constellations', timeless: true, immersive: true },
      },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { EpochField: { template: '<div data-testid="epoch-field" />' } },
    },
  })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

const immersiveMeta = { subtitle: 'Constellations', timeless: true, immersive: true }

async function mountShellWithPage(path: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: Page,
        meta: { timeless: true, immersive: true },
      },
      { path: '/orrery', name: 'solar', component: Page },
      {
        path: '/constellations',
        name: 'constellations',
        component: ConstellationsPage,
        meta: immersiveMeta,
      },
      {
        path: '/constellation/:id',
        name: 'constellation',
        component: ConstellationsPage,
        meta: immersiveMeta,
      },
    ],
  })
  // Mount on a non-constellation route first so App's `.app` root is in the
  // document before ConstellationSettings resolves `Teleport to=".app"`.
  await router.push('/orrery')
  await router.isReady()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [router],
      stubs: { EpochField: { template: '<div data-testid="epoch-field" />' } },
    },
  })
  mountedWrappers.push(wrapper)
  await router.push(path)
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('App constellation shell', () => {
  it('hides epoch controls and relaxes the shell only for timeless immersive routes', async () => {
    const { wrapper, router } = await mountApp('/orrery')

    expect(wrapper.find('[data-testid="epoch-field"]').exists()).toBe(true)
    expect(wrapper.get('.app').classes()).not.toContain('app--immersive')

    await router.push('/constellations')
    await flushPromises()

    expect(wrapper.find('[data-testid="epoch-field"]').exists()).toBe(false)
    expect(wrapper.get('.app').classes()).toContain('app--immersive')
  })

  it('hides the app header on home for full immersion', async () => {
    const { wrapper, router } = await mountApp('/')

    expect(wrapper.find('[data-testid="epoch-field"]').exists()).toBe(false)
    expect(wrapper.get('.app').classes()).toContain('app--immersive')
    expect(wrapper.get('.app').classes()).toContain('app--home')
    expect(wrapper.get('header').isVisible()).toBe(false)

    await router.push('/orrery')
    await flushPromises()

    expect(wrapper.get('header').isVisible()).toBe(true)
    expect(wrapper.get('.app__title').attributes('href')).toBe('/')
  })
  it('handles global Escape from constellation detail before generic detail navigation', async () => {
    const { router } = await mountApp('/constellation/orion')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/constellations')
  })

  it('lets the search input consume Escape without global constellation navigation', async () => {
    const { wrapper, router } = await mountShellWithPage('/constellation/orion')
    const input = wrapper.get('input[role="combobox"]')

    await input.setValue('ori')
    await input.trigger('keydown.escape')
    await flushPromises()

    // The Escape bubbles to App's window listener, which must ignore input
    // targets and leave the detail route in place while the field clears.
    expect(router.currentRoute.value.fullPath).toBe('/constellation/orion')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('lets the open settings popup consume Escape without global constellation navigation', async () => {
    const { wrapper, router } = await mountShellWithPage('/constellation/orion')

    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    // Fire from a non-input element (the dialog heading): App's input guard
    // can't mask the result, so this isolates the dialog's own `.stop.prevent`.
    // Without it, the Escape would bubble to App and exit the detail route.
    await wrapper.get('[role="dialog"] h2').trigger('keydown.escape')
    await flushPromises()

    // The popup stops the event locally, so App never runs its detail exit.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/constellation/orion')
  })
})
