import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConstellationScaleLegend from '../../../components/constellations/ConstellationScaleLegend.vue'

describe('ConstellationScaleLegend', () => {
  it('labels compressed depth and formats a light-year maximum', () => {
    const wrapper = mount(ConstellationScaleLegend, {
      props: { maximumLy: 950, depthMode: 'compressed' },
    })

    expect(wrapper.text()).toContain('Compressed depth')
    expect(wrapper.text()).toContain('950 ly')
  })

  it('labels true scale and formats a kilolight-year maximum', () => {
    const wrapper = mount(ConstellationScaleLegend, {
      props: { maximumLy: 12_500, depthMode: 'true' },
    })

    expect(wrapper.text()).toContain('True scale')
    expect(wrapper.text()).toContain('12.5 kly')
  })

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not present %s as a physical maximum',
    (maximumLy) => {
      const wrapper = mount(ConstellationScaleLegend, {
        props: { maximumLy, depthMode: 'true' },
      })

      expect(wrapper.text()).toContain('Distance unavailable')
      expect(wrapper.text()).not.toContain('0 ly')
    },
  )

  it('mentions stars omitted for unavailable distances', () => {
    const wrapper = mount(ConstellationScaleLegend, {
      props: { maximumLy: 8_200, depthMode: 'compressed', unavailableCount: 3 },
    })

    expect(wrapper.text()).toContain('3 stars omitted')
    expect(wrapper.text()).toContain('unavailable distances')
  })
})
