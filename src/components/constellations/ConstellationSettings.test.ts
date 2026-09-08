import { DOMWrapper, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSTELLATION_ATTRIBUTIONS } from '../../data/constellations.ts'
import type { ConstellationDragMode } from './constellationDragControls.ts'
import ConstellationSettings from './ConstellationSettings.vue'

const mountedWrappers: VueWrapper[] = []
const mountHosts: HTMLElement[] = []

function mountSettings(
  showStems = false,
  depthMode: 'compressed' | 'true' = 'compressed',
  previewFigureLines = true,
  dragMode: ConstellationDragMode = 'normal',
) {
  const app = document.createElement('div')
  app.className = 'app'
  document.body.appendChild(app)
  mountHosts.push(app)

  const wrapper = mount(ConstellationSettings, {
    attachTo: app,
    props: { showStems, depthMode, previewFigureLines, dragMode },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function findDialog(): HTMLElement | null {
  return document.querySelector('.app > [role="dialog"]')
}

function getDialog(): DOMWrapper<HTMLElement> {
  const dialog = findDialog()
  if (!(dialog instanceof HTMLElement)) throw new Error('settings dialog not found in .app')
  return new DOMWrapper(dialog)
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  for (const host of mountHosts.splice(0)) host.remove()
  vi.restoreAllMocks()
})

describe('ConstellationSettings', () => {
  it('moves focus inside on open and restores it after Escape', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')

    expect(button.text()).toContain('Settings')
    expect(button.attributes('aria-expanded')).toBe('false')

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    const dialog = getDialog()
    expect(dialog.attributes('aria-label')).toBe('Constellation settings')
    expect(document.activeElement).toBe(dialog.get('input[data-settings-preview-lines]').element)

    await dialog.get('input[data-settings-preview-lines]').trigger('keydown.escape')
    expect(findDialog()).toBeNull()
    expect(document.activeElement).toBe(button.element)
  })

  it('closes on an outside click and restores focus when the target is not focusable', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')
    await button.trigger('click')

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(findDialog()).toBeNull()
    expect(document.activeElement).toBe(button.element)
  })

  it('restores focus after the explicit close action', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')
    await button.trigger('click')

    await getDialog().get('button[data-settings-close]').trigger('click')

    expect(findDialog()).toBeNull()
    expect(document.activeElement).toBe(button.element)
  })

  it('reflects stem and figure-line props and emits stem, line, and depth changes', async () => {
    const wrapper = mountSettings(false, 'compressed', true)
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
    const dialog = getDialog()

    const previewLines = dialog.get('input[data-settings-preview-lines]')
    expect((previewLines.element as HTMLInputElement).checked).toBe(true)
    await previewLines.setValue(false)

    const stems = dialog.get('input[data-settings-stems]')
    expect((stems.element as HTMLInputElement).checked).toBe(false)
    await stems.setValue(true)

    const trueScale = dialog.get('input[type="radio"][value="true"]')
    await trueScale.setValue()

    expect(wrapper.emitted('update:preview-figure-lines')).toEqual([[false]])
    expect(wrapper.emitted('update:show-stems')).toEqual([[true]])
    expect(wrapper.emitted('update:depth-mode')).toEqual([['true']])
    expect(dialog.text()).toContain('Preserves physical distance')
    expect(dialog.text()).toContain('Brings distant stars closer')
    expect(dialog.text()).toContain('Preview figure lines')
  })

  it('reflects drag-mode props and emits inverted mouse controls', async () => {
    const wrapper = mountSettings(false, 'compressed', true, 'normal')
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
    const dialog = getDialog()

    const normal = dialog.get('input[data-settings-drag-mode][value="normal"]')
    const inverted = dialog.get('input[data-settings-drag-mode][value="inverted"]')
    expect((normal.element as HTMLInputElement).checked).toBe(true)
    expect((inverted.element as HTMLInputElement).checked).toBe(false)

    await inverted.setValue()

    expect(wrapper.emitted('update:drag-mode')).toEqual([['inverted']])
    expect(dialog.text()).toContain('Mouse controls')
    expect(dialog.text()).toContain('Dragging moves the sky with your cursor')
    expect(dialog.text()).toContain('Dragging moves the sky against your cursor')
  })

  it('shows source links, licenses, revisions, and no velocity control', async () => {
    const wrapper = mountSettings()
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')
    const dialog = getDialog()

    const links = dialog.findAll('a')
    for (const attribution of CONSTELLATION_ATTRIBUTIONS) {
      expect(dialog.text()).toContain(attribution.license)
      expect(links.some((link) => link.attributes('href') === attribution.sourceUrl)).toBe(true)
      if (attribution.sourcePageUrl) {
        const detailsLink = links.find(
          (link) => link.attributes('href') === attribution.sourcePageUrl,
        )
        expect(detailsLink?.text()).toBe('Details')
      }
      if (attribution.revision) expect(dialog.text()).toContain(attribution.revision)
    }
    expect(dialog.text().toLowerCase()).not.toContain('velocity')
  })

  it('teleports the popup into .app so page overflow cannot clip it', async () => {
    const wrapper = mountSettings()
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    expect(wrapper.find('.constellation-settings [role="dialog"]').exists()).toBe(false)
    const dialog = findDialog()
    expect(dialog).toBeTruthy()
    expect(dialog?.getAttribute('aria-label')).toBe('Constellation settings')
  })

  it('keeps the teleported popup fully within the viewport with scroll overflow', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')
    vi.spyOn(button.element as HTMLButtonElement, 'getBoundingClientRect').mockReturnValue({
      x: 800,
      y: 80,
      top: 80,
      right: 980,
      bottom: 112,
      left: 800,
      width: 180,
      height: 32,
      toJSON() {
        return {}
      },
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })

    await button.trigger('click')
    await wrapper.vm.$nextTick()

    const dialog = findDialog()
    expect(dialog).toBeTruthy()
    expect(dialog?.style.position).toBe('fixed')
    expect(dialog?.style.overflowY).toBe('auto')

    const top = Number.parseFloat(dialog!.style.top)
    const maxHeight = Number.parseFloat(dialog!.style.maxHeight)
    expect(top + maxHeight).toBeLessThanOrEqual(400)
    expect(maxHeight).toBeGreaterThan(0)
  })

  it('does not close when clicking inside the teleported popup', async () => {
    const wrapper = mountSettings()
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    const dialog = findDialog()
    expect(dialog).toBeTruthy()
    dialog!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(findDialog()).toBeTruthy()
  })
})
