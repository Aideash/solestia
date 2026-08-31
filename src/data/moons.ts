/**
 * Natural satellites: mean elements at 2000-01-01.5 TDB from JPL SSD
 * Planetary Satellite Mean Elements (DE405/LE405 for the Moon, JUP365 for the
 * Galileans, URA182 equatorial elements for the five major Uranian moons).
 * The Moon is referred to the J2000 ecliptic; the Galileans use their local
 * Laplace planes; the Uranian majors use Uranus's equator.
 * https://ssd.jpl.nasa.gov/sats/elem/sep.html
 *
 * Unlike the planet table, these are epoch elements plus periapsis/node
 * precession periods, not linear rates per century. Independent Kepler
 * ellipses will slowly drift from the Laplace 4:2:1 resonance.
 *
 * Poles and prime meridians: IAU WGCCRE 2015 / NAIF pck00011.tpc for
 * BODY501 … BODY504 and BODY701 … BODY705; IAU 2009's periodic series for
 * the Moon. IAU longitude 0 faces the parent planet for these synchronous
 * satellites.
 */

import type { PlanetSystemId } from './planetSystems.ts'
import { omegaFromWDot, type BodyFrames } from './planets.ts'

export type SatelliteId =
  | 'moon'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'miranda'
  | 'ariel'
  | 'umbriel'
  | 'titania'
  | 'oberon'

/**
 * Mean Keplerian elements referred to the local Laplace plane.
 * ω and Ω are the argument of periapsis and the longitude of the ascending
 * node in that plane, not ecliptic ϖ / Ω.
 *
 * JPL labels the period column "sidereal", but in a precessing-ellipse fit it
 * is the period of the mean anomaly: adding the signed precession rates to
 * 360/periodDays is what recovers the sidereal mean motion. Do that and every
 * moon lands on its own IAU spin rate, which is the 1:1 lock the Galileans are
 * actually in — and on the familiar periods (Io 1.7691 d, not 1.7627 d).
 */
export type SatelliteElements = {
  /** Semi-major axis, km. */
  aKm: number
  e: number
  /** Argument of periapsis at epoch, degrees. */
  omega0: number
  /** Mean anomaly at epoch, degrees. */
  M0: number
  /** Inclination to the local Laplace plane, degrees. */
  i0: number
  /** Longitude of ascending node in the Laplace plane, degrees. */
  Omega0: number
  /** Sidereal orbital period, days. */
  periodDays: number
  /** Whether periodDays already includes apsidal and nodal motion. */
  periodIsSidereal?: boolean
  /** Periapsis precession period, years. */
  periapsisPeriodYears: number
  /** Nodal precession period, years; 0 when the node is undefined (i ≈ 0). */
  nodePeriodYears: number
  /**
   * Sense of the apsidal and nodal precession, +1 prograde and −1 retrograde.
   * JPL tabulates both periods unsigned, so the sense here comes from the one
   * constraint the table cannot express: these moons are synchronous, so the
   * sidereal mean motion has to equal the tabulated IAU spin rate. Exactly one
   * sign pair does that per moon, each landing within 2e-4 deg/day. Nodes
   * regress throughout; the resonance-dominated inner pair have regressing
   * apsides while the oblateness-dominated outer pair advance.
   */
  apsisDirection: 1 | -1
  nodeDirection: 1 | -1
  /** Laplace-plane pole right ascension in the ICRF, degrees. */
  laplaceRa: number
  /** Laplace-plane pole declination in the ICRF, degrees. */
  laplaceDec: number
}

export type Satellite = BodyFrames & {
  id: SatelliteId
  name: string
  color: string
  symbol: string
  parent: PlanetSystemId
  elements: SatelliteElements
}

export const MOONS: Satellite[] = [
  {
    id: 'moon',
    name: 'Moon',
    color: '#c9c9c4',
    symbol: '☾',
    parent: 'earth',
    rotation: { r: omegaFromWDot(13.17635815), theta: 1.57015, phi: 214.4004 },
    iau: {
      ra0: 269.9949,
      raDot: 0.0031,
      dec0: 66.5392,
      decDot: 0.013,
      w0: 38.3213,
      wDot: 13.17635815,
    },
    elements: {
      aKm: 384400,
      e: 0.0554,
      omega0: 318.15,
      M0: 135.27,
      i0: 5.16,
      Omega0: 125.08,
      periodDays: 27.322,
      periodIsSidereal: true,
      periapsisPeriodYears: 5.997,
      nodePeriodYears: 18.6,
      apsisDirection: 1,
      nodeDirection: -1,
      // The lunar elements are referred directly to the J2000 ecliptic.
      // Its north pole in ICRF coordinates supplies that plane to the shared transform.
      laplaceRa: 270,
      laplaceDec: 66.56072,
    },
  },
  {
    id: 'io',
    name: 'Io',
    color: '#e4a04a',
    symbol: 'Ⅰ',
    parent: 'jupiter',
    rotation: { r: omegaFromWDot(203.4889538), theta: 2.2131, phi: 247.7065 },
    iau: {
      ra0: 268.05,
      raDot: -0.009,
      dec0: 64.5,
      decDot: 0.003,
      w0: 200.39,
      wDot: 203.4889538,
    },
    elements: {
      aKm: 421800,
      e: 0.004,
      omega0: 49.1,
      M0: 330.9,
      i0: 0,
      Omega0: 0,
      periodDays: 1.762732,
      periapsisPeriodYears: 1.333,
      nodePeriodYears: 0,
      apsisDirection: -1,
      nodeDirection: -1,
      laplaceRa: 268.1,
      laplaceDec: 64.5,
    },
  },
  {
    id: 'europa',
    name: 'Europa',
    color: '#cfc8bc',
    symbol: 'Ⅱ',
    parent: 'jupiter',
    rotation: { r: omegaFromWDot(101.3747235), theta: 2.1992, phi: 247.9302 },
    iau: {
      ra0: 268.08,
      raDot: -0.009,
      dec0: 64.51,
      decDot: 0.003,
      w0: 36.022,
      wDot: 101.3747235,
    },
    elements: {
      aKm: 671100,
      e: 0.009,
      omega0: 45.0,
      M0: 345.4,
      i0: 0.5,
      Omega0: 184.0,
      periodDays: 3.525463,
      periapsisPeriodYears: 1.394,
      nodePeriodYears: 30.202,
      apsisDirection: -1,
      nodeDirection: -1,
      laplaceRa: 268.1,
      laplaceDec: 64.5,
    },
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    color: '#9a8b74',
    symbol: 'Ⅲ',
    parent: 'jupiter',
    rotation: { r: omegaFromWDot(50.3176081), theta: 2.1252, phi: 248.6709 },
    iau: {
      ra0: 268.2,
      raDot: -0.009,
      dec0: 64.57,
      decDot: 0.003,
      w0: 44.064,
      wDot: 50.3176081,
    },
    elements: {
      aKm: 1070400,
      e: 0.001,
      omega0: 198.3,
      M0: 324.8,
      i0: 0.2,
      Omega0: 58.5,
      periodDays: 7.155588,
      periapsisPeriodYears: 68.301,
      nodePeriodYears: 137.812,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 268.2,
      laplaceDec: 64.6,
    },
  },
  {
    id: 'callisto',
    name: 'Callisto',
    color: '#6b5c4e',
    symbol: 'Ⅳ',
    parent: 'jupiter',
    rotation: { r: omegaFromWDot(21.5710715), theta: 1.809, phi: 252.4851 },
    iau: {
      ra0: 268.72,
      raDot: -0.009,
      dec0: 64.83,
      decDot: 0.003,
      w0: 259.51,
      wDot: 21.5710715,
    },
    elements: {
      aKm: 1882700,
      e: 0.007,
      omega0: 43.8,
      M0: 87.4,
      i0: 0.3,
      Omega0: 309.1,
      periodDays: 16.69044,
      periapsisPeriodYears: 277.921,
      nodePeriodYears: 577.264,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 268.7,
      laplaceDec: 64.8,
    },
  },
  // URA182 mean equatorial elements. The reference-plane pole is Uranus's IAU
  // south pole so mean motion is prograde in that frame, matching the negative
  // IAU W of these synchronous, equatorially orbiting moons.
  {
    id: 'miranda',
    name: 'Miranda',
    color: '#c8bba8',
    symbol: 'Ⅴ',
    parent: 'uranus',
    rotation: { r: omegaFromWDot(-254.6906892), theta: 97.8265, phi: 77.7538 },
    iau: {
      ra0: 257.43,
      raDot: 0,
      dec0: -15.08,
      decDot: 0,
      w0: 30.7,
      wDot: -254.6906892,
    },
    elements: {
      aKm: 129846,
      e: 0.001,
      omega0: 154.8,
      M0: 73.0,
      i0: 4.4,
      Omega0: 100.9,
      periodDays: 1.413479,
      periodIsSidereal: true,
      periapsisPeriodYears: 8.939,
      nodePeriodYears: 17.787,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 77.311,
      laplaceDec: 15.175,
    },
  },
  {
    id: 'ariel',
    name: 'Ariel',
    color: '#e8e4dc',
    symbol: 'Ⅰ',
    parent: 'uranus',
    rotation: { r: omegaFromWDot(-142.8356681), theta: 97.8066, phi: 77.7555 },
    iau: {
      ra0: 257.43,
      raDot: 0,
      dec0: -15.1,
      decDot: 0,
      w0: 156.22,
      wDot: -142.8356681,
    },
    elements: {
      aKm: 190929,
      e: 0.001,
      omega0: 9.6,
      M0: 193.5,
      i0: 0,
      Omega0: 0,
      periodDays: 2.520379,
      periodIsSidereal: true,
      periapsisPeriodYears: 28.901,
      nodePeriodYears: 0,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 77.311,
      laplaceDec: 15.175,
    },
  },
  {
    id: 'umbriel',
    name: 'Umbriel',
    color: '#5c5854',
    symbol: 'Ⅱ',
    parent: 'uranus',
    rotation: { r: omegaFromWDot(-86.8688923), theta: 97.8066, phi: 77.7555 },
    iau: {
      ra0: 257.43,
      raDot: 0,
      dec0: -15.1,
      decDot: 0,
      w0: 108.05,
      wDot: -86.8688923,
    },
    elements: {
      aKm: 265986,
      e: 0.004,
      omega0: 183.4,
      M0: 253.0,
      i0: 0.1,
      Omega0: 174.8,
      periodDays: 4.144177,
      periodIsSidereal: true,
      periapsisPeriodYears: 64.126,
      nodePeriodYears: 129.745,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 77.311,
      laplaceDec: 15.175,
    },
  },
  {
    id: 'titania',
    name: 'Titania',
    color: '#a89b8c',
    symbol: 'Ⅲ',
    parent: 'uranus',
    rotation: { r: omegaFromWDot(-41.3514316), theta: 97.8066, phi: 77.7555 },
    iau: {
      ra0: 257.43,
      raDot: 0,
      dec0: -15.1,
      decDot: 0,
      w0: 77.74,
      wDot: -41.3514316,
    },
    elements: {
      aKm: 436298,
      e: 0.002,
      omega0: 184.0,
      M0: 68.1,
      i0: 0.1,
      Omega0: 29.5,
      periodDays: 8.705869,
      periodIsSidereal: true,
      periapsisPeriodYears: 579.928,
      nodePeriodYears: 1644.649,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 77.311,
      laplaceDec: 15.175,
    },
  },
  {
    id: 'oberon',
    name: 'Oberon',
    color: '#8b7d6e',
    symbol: 'Ⅳ',
    parent: 'uranus',
    rotation: { r: omegaFromWDot(-26.7394932), theta: 97.8066, phi: 77.7555 },
    iau: {
      ra0: 257.43,
      raDot: 0,
      dec0: -15.1,
      decDot: 0,
      w0: 6.77,
      wDot: -26.7394932,
    },
    elements: {
      aKm: 583511,
      e: 0.002,
      omega0: 132.2,
      M0: 143.6,
      i0: 0.1,
      Omega0: 76.8,
      periodDays: 13.463237,
      periodIsSidereal: true,
      periapsisPeriodYears: 158.604,
      nodePeriodYears: 192.798,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 77.311,
      laplaceDec: 15.175,
    },
  },
]
