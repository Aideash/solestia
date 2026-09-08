import { describe, expect, it } from 'vitest'
import { router } from './router.ts'

describe('constellation routes', () => {
  it('registers overview and detail with one timeless immersive page loader', () => {
    const overview = router.getRoutes().find(({ name }) => name === 'constellations')
    const detail = router.getRoutes().find(({ name }) => name === 'constellation')

    expect(overview).toBeDefined()
    expect(detail).toBeDefined()
    if (!overview?.components || !detail?.components) {
      throw new Error('Constellation routes must define page components')
    }

    expect(overview?.path).toBe('/constellations')
    expect(detail?.path).toBe('/constellation/:id')
    expect(overview.components.default).toBe(detail.components.default)
    expect(overview?.meta).toMatchObject({
      timeless: true,
      immersive: true,
      subtitle: 'Constellations',
    })
    expect(detail?.meta).toMatchObject({
      timeless: true,
      immersive: true,
      subtitle: 'Constellations',
    })
  })
})
