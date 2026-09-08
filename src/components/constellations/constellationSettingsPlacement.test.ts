import { describe, expect, it } from 'vitest'
import { placeSettingsPopup } from './constellationSettingsPlacement.ts'

describe('placeSettingsPopup', () => {
  it('opens below a top-right trigger and clamps width to the viewport', () => {
    const placement = placeSettingsPopup({
      trigger: { top: 80, right: 980, bottom: 112, left: 860 },
      viewportWidth: 1000,
      viewportHeight: 800,
      margin: 16,
      gap: 8,
      preferredWidth: 352,
    })

    expect(placement).toEqual({
      top: 120,
      left: 628,
      width: 352,
      maxHeight: 664,
    })
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(800 - 16)
    expect(placement.left + placement.width).toBeLessThanOrEqual(1000 - 16)
  })

  it('opens into the larger space above when the trigger sits near the bottom', () => {
    const placement = placeSettingsPopup({
      trigger: { top: 700, right: 980, bottom: 732, left: 860 },
      viewportWidth: 1000,
      viewportHeight: 800,
      margin: 16,
      gap: 8,
      preferredWidth: 352,
    })

    expect(placement.top).toBe(16)
    expect(placement.maxHeight).toBe(676)
    expect(placement.top + placement.maxHeight).toBe(692)
  })

  it('shrinks width when the preferred size cannot fit', () => {
    const placement = placeSettingsPopup({
      trigger: { top: 40, right: 300, bottom: 72, left: 180 },
      viewportWidth: 320,
      viewportHeight: 500,
      margin: 16,
      gap: 8,
      preferredWidth: 352,
    })

    expect(placement.width).toBe(288)
    expect(placement.left).toBe(16)
  })
})
