import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConstellationScene from './ConstellationScene.vue'

// A mocked WebGL boundary: only the renderer touches the GPU, so mocking just
// `WebGLRenderer` lets the rest of Three.js (scene graph, math, OrbitControls)
// run for real while the component's observable fallback, accessibility, timing,
// and cleanup are exercised in jsdom.
const glState = vi.hoisted(() => ({ fail: false, disposeCount: 0 }))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    private readonly context = {}
    constructor() {
      if (glState.fail) throw new Error('mock: WebGL context unavailable')
    }
    getContext() {
      return this.context
    }
    getPixelRatio() {
      return 1
    }
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    render() {}
    dispose() {
      glState.disposeCount += 1
    }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer }
})

let reducedMotion = false
let now = 0
let frames: FrameRequestCallback[] = []

function flushFrames(advanceMs = 0): void {
  now += advanceMs
  const due = frames
  frames = []
  for (const frame of due) frame(now)
}

const mountedWrappers: VueWrapper[] = []

async function mountScene(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = mount(ConstellationScene, { attachTo: document.body, props })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  glState.fail = false
  glState.disposeCount = 0
  reducedMotion = false
  now = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  window.matchMedia = ((query: string) => ({
    matches: reducedMotion,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false
    },
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ConstellationScene accessibility and fallback', () => {
  it('exposes an interactive, described canvas widget when WebGL is available', async () => {
    const wrapper = await mountScene()
    const canvas = wrapper.element.querySelector('canvas')

    expect(canvas).not.toBeNull()
    expect(canvas?.getAttribute('role')).toBe('application')
    expect(canvas?.getAttribute('tabindex')).toBe('0')
    expect(canvas?.getAttribute('aria-roledescription')).toBe('interactive star map')
    expect(canvas?.getAttribute('aria-label')).toContain('star map')

    const describedBy = canvas?.getAttribute('aria-describedby') ?? ''
    const instructions = wrapper.get(`[id="${describedBy}"]`)
    expect(instructions.text()).toContain('Drag or swipe')
    expect(wrapper.find('.constellation-scene__fallback').exists()).toBe(false)
  })

  it('shows an accessible fallback and keeps instructions when WebGL is unavailable', async () => {
    glState.fail = true
    const wrapper = await mountScene()

    expect(wrapper.element.querySelector('canvas')).toBeNull()
    const fallback = wrapper.get('.constellation-scene__fallback')
    expect(fallback.attributes('role')).toBe('alert')
    expect(fallback.text()).toContain('WebGL')
    expect(wrapper.get('.constellation-scene__sr-only').text()).toContain('Drag or swipe')

    expect(() => wrapper.unmount()).not.toThrow()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)
  })

  it('disposes the renderer and detaches the canvas on unmount', async () => {
    const wrapper = await mountScene()
    const canvas = wrapper.element.querySelector('canvas')
    expect(canvas && document.body.contains(canvas)).toBe(true)

    wrapper.unmount()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)

    expect(glState.disposeCount).toBeGreaterThan(0)
    expect(canvas && document.body.contains(canvas)).toBe(false)
  })
})

describe('ConstellationScene motion and rebuild timing', () => {
  it('settles a fly-in within a single frame when reduced motion is preferred', async () => {
    reducedMotion = true
    await mountScene({ selectedId: 'orion' })

    flushFrames(0)

    expect(frames.length).toBe(0)
  })

  it('animates a fly-in across the transition when motion is allowed', async () => {
    reducedMotion = false
    await mountScene({ selectedId: 'orion' })

    flushFrames(0)
    expect(frames.length).toBeGreaterThan(0)

    flushFrames(1000)
    flushFrames(0)
    expect(frames.length).toBe(0)
  })

  it('applies a depth-mode change made mid-fly-in once the slice settles', async () => {
    reducedMotion = false
    const wrapper = await mountScene({ selectedId: 'orion', depthMode: 'compressed' })

    flushFrames(0)
    await wrapper.setProps({ depthMode: 'true' })

    const midEmits = wrapper.emitted('scale-change') ?? []
    expect(midEmits.at(-1)?.[0]).toMatchObject({ mode: 'compressed' })

    flushFrames(1000)
    flushFrames(0)

    const finalEmits = wrapper.emitted('scale-change') ?? []
    expect(finalEmits.at(-1)?.[0]).toMatchObject({ mode: 'true' })
  })
})
