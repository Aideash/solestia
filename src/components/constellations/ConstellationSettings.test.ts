import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { CONSTELLATION_ATTRIBUTIONS } from '../../data/constellations.ts'
import ConstellationSettings from './ConstellationSettings.vue'

const mountedWrappers: VueWrapper[] = []

function mountSettings(
  showStems = false,
  depthMode: 'compressed' | 'true' = 'compressed',
  previewFigureLines = true,
) {
  const wrapper = mount(ConstellationSettings, {
    attachTo: document.body,
    props: { showStems, depthMode, previewFigureLines },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('ConstellationSettings', () => {
  it('moves focus inside on open and restores it after Escape', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')

    expect(button.text()).toContain('Settings')
    expect(button.attributes('aria-expanded')).toBe('false')

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Constellation settings')
    expect(document.activeElement).toBe(
      wrapper.get('input[data-settings-preview-lines]').element,
    )

    await wrapper.get('input[data-settings-preview-lines]').trigger('keydown.escape')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('closes on an outside click and restores focus when the target is not focusable', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')
    await button.trigger('click')

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('restores focus after the explicit close action', async () => {
    const wrapper = mountSettings()
    const button = wrapper.get('button[aria-haspopup="dialog"]')
    await button.trigger('click')

    await wrapper.get('button[data-settings-close]').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
  })

  it('reflects stem and figure-line props and emits stem, line, and depth changes', async () => {
    const wrapper = mountSettings(false, 'compressed', true)
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    const previewLines = wrapper.get('input[data-settings-preview-lines]')
    expect((previewLines.element as HTMLInputElement).checked).toBe(true)
    await previewLines.setValue(false)

    const stems = wrapper.get('input[data-settings-stems]')
    expect((stems.element as HTMLInputElement).checked).toBe(false)
    await stems.setValue(true)

    const trueScale = wrapper.get('input[type="radio"][value="true"]')
    await trueScale.setValue()

    expect(wrapper.emitted('update:preview-figure-lines')).toEqual([[false]])
    expect(wrapper.emitted('update:show-stems')).toEqual([[true]])
    expect(wrapper.emitted('update:depth-mode')).toEqual([['true']])
    expect(wrapper.text()).toContain('Preserves physical distance')
    expect(wrapper.text()).toContain('Brings distant stars closer')
    expect(wrapper.text()).toContain('Preview figure lines')
  })

  it('shows source links, licenses, revisions, and no velocity control', async () => {
    const wrapper = mountSettings()
    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    const links = wrapper.findAll('a')
    for (const attribution of CONSTELLATION_ATTRIBUTIONS) {
      expect(wrapper.text()).toContain(attribution.license)
      expect(links.some((link) => link.attributes('href') === attribution.sourceUrl)).toBe(true)
      if (attribution.sourcePageUrl) {
        const detailsLink = links.find(
          (link) => link.attributes('href') === attribution.sourcePageUrl,
        )
        expect(detailsLink?.text()).toBe('Details')
      }
      if (attribution.revision) expect(wrapper.text()).toContain(attribution.revision)
    }
    expect(wrapper.text().toLowerCase()).not.toContain('velocity')
  })
})
