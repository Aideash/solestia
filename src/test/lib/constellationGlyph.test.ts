import { describe, expect, it } from 'vitest'
import { CONSTELLATION_STARS } from '../../data/constellations.ts'
import { METEOR_PARENTS } from '../../data/meteorShowers.ts'
import { obsoleteConstellationById } from '../../data/obsoleteConstellations.ts'
import {
  buildConstellationGlyph,
  buildConstellationGlyphPositions,
  buildDualConstellationGlyph,
} from '../../lib/constellationGlyph.ts'

describe('meteor parent constellation mapping', () => {
  it('maps each parent to its radiant constellation id(s)', () => {
    const byId = Object.fromEntries(METEOR_PARENTS.map((parent) => [parent.id, parent]))
    expect(byId.phaethon.constellationIds).toEqual(['gemini'])
    expect(byId.eh1.constellationIds).toEqual(['quadrans-muralis'])
    expect(byId['tempel-tuttle'].constellationIds).toEqual(['leo'])
    expect(byId.halley.constellationIds).toEqual(['orion', 'aquarius'])
    expect(byId['swift-tuttle'].constellationIds).toEqual(['perseus'])
    expect(byId.thatcher.constellationIds).toEqual(['lyra'])
  })
})

describe('obsolete Quadrans Muralis', () => {
  it('resolves a stick figure with edges and star coordinates', () => {
    const qum = obsoleteConstellationById('quadrans-muralis')
    expect(qum).toBeDefined()
    expect(qum!.edges.length).toBeGreaterThan(0)
    expect(qum!.stars.length).toBeGreaterThanOrEqual(4)
    for (const [fromId, toId] of qum!.edges) {
      expect(qum!.stars.some((star) => star.id === fromId)).toBe(true)
      expect(qum!.stars.some((star) => star.id === toId)).toBe(true)
    }
  })
})

describe('buildConstellationGlyph', () => {
  it('projects Gemini into a centered box with finite line segments', () => {
    const glyph = buildConstellationGlyph('gemini', { x: 50, y: 50, width: 60, height: 60 })
    expect(glyph).not.toBeNull()
    expect(glyph!.segments.length).toBeGreaterThan(0)
    for (const segment of glyph!.segments) {
      for (const value of [segment.x1, segment.y1, segment.x2, segment.y2]) {
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(segment.x1).toBeGreaterThanOrEqual(20)
      expect(segment.x1).toBeLessThanOrEqual(80)
      expect(segment.y1).toBeGreaterThanOrEqual(20)
      expect(segment.y1).toBeLessThanOrEqual(80)
    }
  })

  it('places eastern stars to the left when north is up (sky-chart view)', () => {
    // Bellatrix (hip-25336) — Betelgeuse (hip-27989) is a direct Orion edge; Betelgeuse is east.
    const bellatrix = CONSTELLATION_STARS.find((star) => star.id === 'hip-25336')
    const betelgeuse = CONSTELLATION_STARS.find((star) => star.id === 'hip-27989')
    expect(bellatrix).toBeDefined()
    expect(betelgeuse).toBeDefined()
    expect(betelgeuse!.raDeg).toBeGreaterThan(bellatrix!.raDeg)

    const positions = buildConstellationGlyphPositions('orion', {
      x: 50,
      y: 50,
      width: 60,
      height: 60,
    })
    expect(positions).not.toBeNull()
    const west = positions!.get('hip-25336')
    const east = positions!.get('hip-27989')
    expect(west).toBeDefined()
    expect(east).toBeDefined()
    expect(east!.x).toBeLessThan(west!.x)
  })

  it('projects Quadrans Muralis from the obsolete catalog', () => {
    const glyph = buildConstellationGlyph('quadrans-muralis', {
      x: 50,
      y: 50,
      width: 56,
      height: 56,
    })
    expect(glyph).not.toBeNull()
    expect(glyph!.segments.length).toBe(7)
  })

  it('returns null for an unknown id', () => {
    expect(
      buildConstellationGlyph('not-a-constellation', { x: 50, y: 50, width: 40, height: 40 }),
    ).toBeNull()
  })
})

describe('buildDualConstellationGlyph', () => {
  it('fits Orion and Aquarius side-by-side with a vertical divider', () => {
    const glyph = buildDualConstellationGlyph(['orion', 'aquarius'], {
      x: 50,
      y: 50,
      width: 64,
      height: 56,
    })
    expect(glyph).not.toBeNull()
    expect(glyph!.left.segments.length).toBeGreaterThan(0)
    expect(glyph!.right.segments.length).toBeGreaterThan(0)
    expect(glyph!.divider).toEqual({
      x1: 50,
      y1: expect.any(Number),
      x2: 50,
      y2: expect.any(Number),
    })
    expect(glyph!.divider.y1).toBeLessThan(glyph!.divider.y2)

    for (const segment of glyph!.left.segments) {
      expect(segment.x1).toBeLessThan(50)
      expect(segment.x2).toBeLessThan(50)
    }
    for (const segment of glyph!.right.segments) {
      expect(segment.x1).toBeGreaterThan(50)
      expect(segment.x2).toBeGreaterThan(50)
    }
  })
})
