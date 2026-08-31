import { omegaFromWDot, type BodyFrames } from './planets.ts'

/**
 * The seven largest main-belt objects from Davida upward. Orbital and physical
 * metadata are from JPL's Small-Body Database, retrieved 2026-08-31. The
 * elements are reference values for labels and the deliberately expanded
 * mean-distance lanes; time-dependent positions come from Horizons vectors.
 *
 * https://ssd-api.jpl.nasa.gov/doc/sbdb.html
 *
 * Cartographic frames for Ceres, Pallas, Vesta, (52) Europa, and Davida are
 * from the latest applicable Dawn PCK or IAU WGCCRE model. Hygiea's pole and
 * period are from Vernazza et al. (2020); Interamnia's are from Hanuš et al.
 * (2020). Those last two have no defined prime meridian, so, like Nereid, W0
 * is set arbitrarily to zero at J2000 while retaining the measured pole and
 * period.
 */

export type AsteroidId =
  'vesta' | 'ceres' | 'pallas' | 'interamnia' | 'europa-52' | 'hygiea' | 'davida'

export type Asteroid = BodyFrames & {
  id: AsteroidId
  symbol?: string
  number: number
  name: string
  color: string
  /** Whether W0 is tied to a published cartographic meridian. */
  primeMeridianDefined: boolean
  /** Effective diameter, km. */
  diameterKm: number
  /** Reference semi-major axis, AU. */
  a: number
  e: number
  /** Inclination to the J2000 ecliptic, degrees. */
  inclinationDeg: number
  /** Reference sidereal orbital period, days. */
  periodDays: number
}

/**
 * Ordered by semi-major axis so screen radius remains monotonic. Ceres and
 * Pallas intentionally retain their very small physical separation.
 */
export const ASTEROIDS: readonly Asteroid[] = [
  {
    id: 'vesta',
    number: 4,
    symbol: '⚶',
    name: 'Vesta',
    color: '#d8c8ad',
    primeMeridianDefined: true,
    rotation: {
      r: omegaFromWDot(1617.3329428),
      theta: 32.2761,
      phi: 330.8257,
    },
    iau: {
      ra0: 309.031,
      raDot: 0,
      dec0: 42.235,
      decDot: 0,
      w0: 285.39,
      wDot: 1617.3329428,
    },
    diameterKm: 522.77,
    a: 2.361365965127599,
    e: 0.09020374382834395,
    inclinationDeg: 7.143925545058711,
    periodDays: 1325.389042911101,
  },
  {
    id: 'ceres',
    number: 1,
    symbol: '⚳',
    name: 'Ceres',
    color: '#aaa8a2',
    primeMeridianDefined: true,
    rotation: {
      r: omegaFromWDot(952.1532635),
      theta: 8.4454,
      phi: 11.2072,
    },
    iau: {
      ra0: 291.42763,
      raDot: 0,
      dec0: 66.76033,
      decDot: 0,
      w0: 170.309,
      wDot: 952.1532635,
    },
    diameterKm: 939.4,
    a: 2.765552595034094,
    e: 0.07969229514816586,
    inclinationDeg: 10.58802780183462,
    periodDays: 1679.853119758983,
  },
  {
    id: 'pallas',
    number: 2,
    symbol: '⚴',
    name: 'Pallas',
    color: '#b7afa3',
    primeMeridianDefined: true,
    rotation: {
      r: omegaFromWDot(1105.8036),
      theta: 105.3292,
      phi: 29.7248,
    },
    iau: {
      ra0: 33,
      raDot: 0,
      dec0: -3,
      decDot: 0,
      w0: 38,
      wDot: 1105.8036,
    },
    diameterKm: 513,
    a: 2.769559010737709,
    e: 0.2307000995648547,
    inclinationDeg: 34.93279321851542,
    periodDays: 1683.504809564834,
  },
  {
    id: 'interamnia',
    number: 704,
    name: 'Interamnia',
    color: '#8f9796',
    primeMeridianDefined: false,
    rotation: {
      r: omegaFromWDot(360 / (8.71234 / 24)),
      theta: 28,
      phi: 87,
    },
    iau: {
      ra0: 72.7081,
      raDot: 0,
      dec0: 85.2584,
      decDot: 0,
      w0: 0,
      wDot: 360 / (8.71234 / 24),
    },
    diameterKm: 306.313,
    a: 3.056811711282865,
    e: 0.1550586536072489,
    inclinationDeg: 17.31528178196839,
    periodDays: 1952.097295218148,
  },
  {
    id: 'europa-52',
    number: 52,
    name: 'Europa',
    color: '#9d9288',
    primeMeridianDefined: true,
    rotation: {
      r: omegaFromWDot(1534.6472187),
      theta: 55.259,
      phi: 254.4685,
    },
    iau: {
      ra0: 257,
      raDot: 0,
      dec0: 12,
      decDot: 0,
      w0: 55,
      wDot: 1534.6472187,
    },
    diameterKm: 303.918,
    a: 3.094135859941014,
    e: 0.1124826698655506,
    inclinationDeg: 7.481504555174181,
    periodDays: 1987.959331444464,
  },
  {
    id: 'hygiea',
    number: 10,
    name: 'Hygiea',
    color: '#7f8988',
    primeMeridianDefined: false,
    rotation: {
      r: omegaFromWDot(360 / (13.82559 / 24)),
      theta: 118.6005,
      phi: 306.6645,
    },
    iau: {
      ra0: 319,
      raDot: 0,
      dec0: -46,
      decDot: 0,
      w0: 0,
      wDot: 360 / (13.82559 / 24),
    },
    diameterKm: 407.12,
    a: 3.150974033963701,
    e: 0.1067092741240963,
    inclinationDeg: 3.829529946447122,
    periodDays: 2042.987283349627,
  },
  {
    id: 'davida',
    number: 511,
    name: 'Davida',
    color: '#877d75',
    primeMeridianDefined: true,
    rotation: {
      r: omegaFromWDot(1684.4193549),
      theta: 64.3395,
      phi: 300.1157,
    },
    iau: {
      ra0: 297,
      raDot: 0,
      dec0: 5,
      decDot: 0,
      w0: 268.1,
      wDot: 1684.4193549,
    },
    diameterKm: 270.327,
    a: 3.161792846903028,
    e: 0.1893732654213308,
    inclinationDeg: 15.94980163416854,
    periodDays: 2053.518150223722,
  },
]

export const ASTEROID_BY_ID = Object.fromEntries(
  ASTEROIDS.map((asteroid) => [asteroid.id, asteroid]),
) as Record<AsteroidId, Asteroid>
