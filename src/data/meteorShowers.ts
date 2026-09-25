/**
 * Notable annual meteor-shower parents. Orbital metadata are from JPL's
 * Small-Body Database (retrieved 2026-09-18). Time-dependent positions come
 * from Horizons vectors; these elements are reference values for labels and
 * layout.
 *
 * https://ssd-api.jpl.nasa.gov/doc/sbdb.html
 *
 * Ordered by semi-major axis so the flanking clocks and selection table read
 * inward to outward. Thatcher (C/1861 G1) has the longest reach and pins the
 * diagram’s outer scale.
 */

export type MeteorParentId =
  'phaethon' | 'eh1' | 'tempel-tuttle' | 'halley' | 'swift-tuttle' | 'thatcher'

export type MeteorShower = {
  /** Short display name for markers and labels. */
  name: string
  /** Rough northern-hemisphere peak window, for selection notes. */
  peak: string
}

export type MeteorParent = {
  id: MeteorParentId
  /** Horizons COMMAND string, including the trailing semicolon when required. */
  horizonsCommand: string
  /** Substring that must appear in Horizons’ “Target body name” line. */
  horizonsNameMatch: string
  name: string
  color: string
  showers: readonly MeteorShower[]
  /**
   * Radiant constellation stick-figure id(s) for rim-only PlanetClock glyphs.
   * IAU ids for modern figures; `quadrans-muralis` is an obsolete side-catalog
   * entry. Halley lists Orion then Aquarius for the dual glyph.
   */
  constellationIds: readonly string[]
  /** Reference semi-major axis, AU. */
  a: number
  e: number
  /** Inclination to the J2000 ecliptic, degrees. */
  inclinationDeg: number
  /** Reference sidereal orbital period, days. */
  periodDays: number
}

/**
 * Inward to outward by semi-major axis. Phaethon and 2003 EH1 are asteroids
 * that still shed the debris streams of the Geminids and Quadrantids.
 */
export const METEOR_PARENTS: readonly MeteorParent[] = [
  {
    id: 'phaethon',
    horizonsCommand: '3200;',
    horizonsNameMatch: 'Phaethon',
    name: 'Phaethon',
    color: '#c4a574',
    showers: [{ name: 'Geminids', peak: 'mid December' }],
    constellationIds: ['gemini'],
    a: 1.27,
    e: 0.89,
    inclinationDeg: 22.3,
    periodDays: 524,
  },
  {
    id: 'eh1',
    horizonsCommand: '196256;',
    horizonsNameMatch: '2003 EH1',
    name: '2003 EH1',
    color: '#8fa3a8',
    showers: [{ name: 'Quadrantids', peak: 'early January' }],
    constellationIds: ['quadrans-muralis'],
    a: 3.12,
    e: 0.619,
    inclinationDeg: 70.9,
    periodDays: 2020,
  },
  {
    id: 'tempel-tuttle',
    /** Most recent Tempel–Tuttle apparition in Horizons (1998). */
    horizonsCommand: '90000626;',
    horizonsNameMatch: 'Tempel-Tuttle',
    name: '55P/Tempel–Tuttle',
    color: '#9bb0c4',
    showers: [{ name: 'Leonids', peak: 'mid November' }],
    constellationIds: ['leo'],
    a: 10.3,
    e: 0.906,
    inclinationDeg: 162,
    periodDays: 12100,
  },
  {
    id: 'halley',
    /** Horizons multi-apparition solution matching SBDB JPL#75. */
    horizonsCommand: '90000030;',
    horizonsNameMatch: 'Halley',
    name: '1P/Halley',
    color: '#7eb6c9',
    showers: [
      { name: 'η Aquariids', peak: 'early May' },
      { name: 'Orionids', peak: 'late October' },
    ],
    constellationIds: ['orion', 'aquarius'],
    a: 17.9,
    e: 0.968,
    inclinationDeg: 162,
    periodDays: 27700,
  },
  {
    id: 'swift-tuttle',
    /** Most recent Swift–Tuttle apparition in Horizons (1995). */
    horizonsCommand: '90000985;',
    horizonsNameMatch: 'Swift-Tuttle',
    name: '109P/Swift–Tuttle',
    color: '#d4a0a8',
    showers: [{ name: 'Perseids', peak: 'mid August' }],
    constellationIds: ['perseus'],
    a: 26.1,
    e: 0.963,
    inclinationDeg: 113,
    periodDays: 48700,
  },
  {
    id: 'thatcher',
    horizonsCommand: 'DES=1861 G1;',
    horizonsNameMatch: 'Thatcher',
    name: 'C/1861 G1 (Thatcher)',
    color: '#b8a6c9',
    showers: [{ name: 'Lyrids', peak: 'late April' }],
    constellationIds: ['lyra'],
    a: 55.7,
    e: 0.983,
    inclinationDeg: 79.8,
    periodDays: 152000,
  },
]

export const METEOR_PARENT_BY_ID = Object.fromEntries(
  METEOR_PARENTS.map((parent) => [parent.id, parent]),
) as Record<MeteorParentId, MeteorParent>
