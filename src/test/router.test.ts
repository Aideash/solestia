import { describe, expect, it } from 'vitest'
import { router } from '../router.ts'

describe('home and orrery routes', () => {
  it('puts the immersive home at / and the solar orrery at /orrery', () => {
    const home = router.getRoutes().find(({ name }) => name === 'home')
    const solar = router.getRoutes().find(({ name }) => name === 'solar')

    expect(home?.path).toBe('/')
    expect(home?.meta).toMatchObject({ timeless: true, immersive: true })
    expect(solar?.path).toBe('/orrery')
  })

  it('prefixes planet and belt routes under /orrery', () => {
    expect(router.getRoutes().find(({ name }) => name === 'earth-system')?.path).toBe(
      '/orrery/earth',
    )
    expect(router.getRoutes().find(({ name }) => name === 'earth-time')?.path).toBe(
      '/orrery/earth/time',
    )
    expect(router.getRoutes().find(({ name }) => name === 'mars-time')?.path).toBe(
      '/orrery/mars/time',
    )
    expect(router.getRoutes().find(({ name }) => name === 'asteroid-belt')?.path).toBe(
      '/orrery/asteroid-belt',
    )
    expect(router.getRoutes().find(({ name }) => name === 'kuiper-belt')?.path).toBe(
      '/orrery/kuiper-belt',
    )
    expect(router.getRoutes().find(({ name }) => name === 'meteor-showers')?.path).toBe(
      '/orrery/meteor-showers',
    )
  })
})

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
