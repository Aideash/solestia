import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConstellationScene from '../../components/constellations/ConstellationScene.vue'
import ConstellationsPage from '../../views/ConstellationsPage.vue'

const sceneApi = vi.hoisted(() => ({
  goToEarthPov: vi.fn(),
}))

vi.mock('../components/constellations/ConstellationScene.vue', () => ({
  default: defineComponent({
    name: 'ConstellationScene',
    props: {
      selectedId: { type: String, default: null },
      showStems: { type: Boolean, default: false },
      depthMode: { type: String, default: 'compressed' },
      previewFigureLines: { type: Boolean, default: true },
      listPreviewId: { type: String, default: null },
      dragMode: { type: String, default: 'normal' },
    },
    emits: ['select', 'scale-change'],
    methods: {
      goToEarthPov() {
        sceneApi.goToEarthPov()
      },
    },
    template: '<div class="scene-contract" />',
  }),
}))

const mountedWrappers: VueWrapper[] = []
const mountHosts: HTMLElement[] = []

async function mountPage(
  path = '/constellations',
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/constellations', name: 'constellations', component: ConstellationsPage },
      { path: '/constellation/:id', name: 'constellation', component: ConstellationsPage },
    ],
  })
  await router.push(path)
  await router.isReady()

  const app = document.createElement('div')
  app.className = 'app'
  document.body.appendChild(app)
  mountHosts.push(app)

  const wrapper = mount(ConstellationsPage, {
    attachTo: app,
    global: { plugins: [router] },
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  sceneApi.goToEarthPov.mockClear()
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  for (const host of mountHosts.splice(0)) host.remove()
})

describe('ConstellationsPage', () => {
  it('uses the URL parameter as the active constellation and identifies its detail', async () => {
    const { wrapper } = await mountPage('/constellation/orion')

    expect(wrapper.getComponent(ConstellationScene).props('selectedId')).toBe('orion')
    expect(wrapper.get('[data-constellation-detail]').text()).toContain('Orion')
    expect(wrapper.text()).toContain('Drag to orbit around the slice')
  })

  it('pushes detail routes from search and scene selections', async () => {
    const { wrapper, router } = await mountPage()

    await wrapper.get('[data-constellation-id="orion"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/constellation/orion')

    wrapper.getComponent(ConstellationScene).vm.$emit('select', 'ursa-major')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/constellation/ursa-major')
  })

  it('returns to the sky overview from the detail action', async () => {
    const { wrapper, router } = await mountPage('/constellation/orion')

    await wrapper.get('button[data-return-to-sky]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/constellations')
    expect(wrapper.text()).toContain('selecting or searching opens a constellation')
  })

  it('offers Earth POV beside return-to-sky and asks the scene to go there', async () => {
    const { wrapper, router } = await mountPage('/constellation/orion')

    const earthPov = wrapper.get('button[data-earth-pov]')
    expect(earthPov.text()).toBe('Earth POV')
    await earthPov.trigger('click')

    expect(sceneApi.goToEarthPov).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe('/constellation/orion')
  })

  it('replaces invalid IDs with overview and announces the invalid value', async () => {
    const { wrapper, router } = await mountPage('/constellation/not-a-real-constellation')

    expect(router.currentRoute.value.fullPath).toBe('/constellations')
    const notice = wrapper.get('[role="alert"]')
    expect(notice.attributes('aria-live')).toBe('assertive')
    expect(notice.text()).toContain('not-a-real-constellation')
  })

  it('dismisses the invalid-ID notice with its dismiss control', async () => {
    const { wrapper, router } = await mountPage('/constellation/not-a-real-constellation')

    expect(router.currentRoute.value.fullPath).toBe('/constellations')
    const notice = wrapper.get('[role="alert"]')
    expect(notice.text()).toContain('not-a-real-constellation')

    // The notice persists (no timer) until the native dismiss control clears it,
    // freeing the search input it overlaps on narrow layouts.
    const dismiss = wrapper.get('[data-notice-dismiss]')
    expect(dismiss.attributes('type')).toBe('button')
    await dismiss.trigger('click')

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('starts compressed without stems, with figure-line preview, and flows settings into the scene', async () => {
    const { wrapper } = await mountPage('/constellation/orion')
    const scene = wrapper.getComponent(ConstellationScene)

    expect(scene.props()).toMatchObject({
      selectedId: 'orion',
      showStems: false,
      depthMode: 'compressed',
      previewFigureLines: true,
      dragMode: 'normal',
    })

    scene.vm.$emit('scale-change', {
      mode: 'compressed',
      maxLightYears: 2_500,
      depthLimitLy: 1_000,
      measuredCount: 6,
      unavailableCount: 2,
    })
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    // Settings teleport into `.app`, outside the page component root.
    const dialogEl = document.querySelector('.app > [role="dialog"]')
    expect(dialogEl).toBeInstanceOf(HTMLElement)
    const dialog = new DOMWrapper(dialogEl as HTMLElement)
    await dialog.get('input[data-settings-preview-lines]').setValue(false)
    await dialog.get('input[data-settings-stems]').setValue(true)
    await dialog.get('input[type="radio"][value="true"]').setValue()
    await dialog.get('input[data-settings-drag-mode][value="inverted"]').setValue()

    expect(scene.props()).toMatchObject({
      showStems: true,
      depthMode: 'true',
      previewFigureLines: false,
      dragMode: 'inverted',
    })
    expect(wrapper.get('[aria-label="Constellation distance scale"]').text()).toContain(
      'True scale',
    )
    expect(wrapper.get('[aria-label="Constellation distance scale"]').text()).toContain(
      '2 stars omitted',
    )
  })

  it('forwards list hover into the scene preview prop', async () => {
    const { wrapper } = await mountPage()
    const scene = wrapper.getComponent(ConstellationScene)

    await wrapper.get('[data-constellation-id="orion"]').trigger('mousemove')
    expect(scene.props('listPreviewId')).toBe('orion')
  })

  it('keeps one mounted page and scene instance across overview → detail → overview', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/constellations', name: 'constellations', component: ConstellationsPage },
        { path: '/constellation/:id', name: 'constellation', component: ConstellationsPage },
      ],
    })
    await router.push('/constellations')
    await router.isReady()

    const app = document.createElement('div')
    app.className = 'app'
    document.body.appendChild(app)
    mountHosts.push(app)

    const Harness = { components: { RouterView }, template: '<RouterView />' }
    const wrapper = mount(Harness, { attachTo: app, global: { plugins: [router] } })
    mountedWrappers.push(wrapper)
    await flushPromises()

    // A reused instance keeps its uid and its mounted DOM node; a remount would
    // increment the uid and swap in fresh elements.
    const pageUid = wrapper.findComponent(ConstellationsPage).vm.$.uid
    const sceneNode = wrapper.findComponent(ConstellationScene).element

    await router.push('/constellation/orion')
    await flushPromises()
    // A shared route component must be reused, not remounted, so the live scene
    // survives selection rather than tearing down and rebuilding its GPU state.
    expect(wrapper.findComponent(ConstellationsPage).vm.$.uid).toBe(pageUid)
    expect(wrapper.findComponent(ConstellationScene).element).toBe(sceneNode)

    await router.push('/constellations')
    await flushPromises()
    expect(wrapper.findComponent(ConstellationsPage).vm.$.uid).toBe(pageUid)
    expect(wrapper.findComponent(ConstellationScene).element).toBe(sceneNode)
  })

  it('updates the distance legend from scene scale changes', async () => {
    const { wrapper } = await mountPage('/constellation/orion')

    wrapper.getComponent(ConstellationScene).vm.$emit('scale-change', {
      mode: 'compressed',
      maxLightYears: 812,
      depthLimitLy: 812,
      measuredCount: 5,
      unavailableCount: 1,
    })
    await wrapper.vm.$nextTick()

    const legend = wrapper.get('[aria-label="Constellation distance scale"]')
    expect(legend.text()).toContain('Physical maximum 812 ly')
    expect(legend.text()).toContain('1 star omitted')
  })
})
