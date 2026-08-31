/**
 * Natural satellites: mean elements at 2000-01-01.5 TDB from JPL SSD
 * Planetary Satellite Mean Elements (DE405/LE405 for the Moon, JUP365 for the
 * Galileans, URA182 equatorial elements for the five major Uranian moons, and
 * NEP081 local-Laplace-plane elements for Proteus, Triton, and Nereid).
 * The Moon is referred to the J2000 ecliptic; the Galileans use their local
 * Laplace planes; the Uranian majors use Uranus's equator.
 * https://ssd.jpl.nasa.gov/sats/elem/sep.html
 *
 * Unlike the planet table, these are epoch elements plus periapsis/node
 * precession periods, not linear rates per century. Independent Kepler
 * ellipses will slowly drift from the Laplace 4:2:1 resonance.
 *
 * Poles and prime meridians: IAU WGCCRE 2015 / NAIF pck00011.tpc for
 * BODY501 … BODY504, BODY701 … BODY705, BODY801, and BODY808; IAU 2009's
 * periodic series for the Moon. Nereid's documented approximation is the
 * exception because the IAU provides no orientation model for BODY802.
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
  | 'proteus'
  | 'triton'
  | 'nereid'

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
  /** Orbital sense relative to the parent IAU north pole; defaults to prograde. */
  orbitDirection?: 1 | -1
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
  // NEP081 mean elements. Triton's high inclination makes its orbit retrograde
  // relative to Neptune's IAU north pole. Nereid has no IAU orientation model:
  // its measured 11.594 h prograde rotation is modeled about the orbit-normal
  // Laplace pole, with an arbitrary prime meridian at J2000.
  {
    id: 'proteus',
    name: 'Proteus',
    color: '#8d8b86',
    symbol: 'Ⅷ',
    parent: 'neptune',
    rotation: { r: omegaFromWDot(320.7654228), theta: 28.5007, phi: 318.631 },
    iau: {
      ra0: 299.27,
      raDot: 0,
      dec0: 42.91,
      decDot: 0,
      w0: 93.38,
      wDot: 320.7654228,
    },
    elements: {
      aKm: 117646,
      e: 0.00051,
      omega0: 67.968,
      M0: 250.9377,
      i0: 0.0749,
      Omega0: 315.1314,
      periodDays: 360 / 320.7656245,
      periodIsSidereal: true,
      periapsisPeriodYears: 360 / (28.1362 - -28.2873),
      nodePeriodYears: 360 / 28.2873,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 299.4058,
      laplaceDec: 42.4317,
    },
  },
  {
    id: 'triton',
    name: 'Triton',
    color: '#d7b6a5',
    symbol: 'Ⅰ',
    parent: 'neptune',
    rotation: { r: omegaFromWDot(-61.2572637), theta: 130.267, phi: 125.8429 },
    iau: {
      ra0: 299.36,
      raDot: 0,
      dec0: 41.17,
      decDot: 0,
      w0: 296.53,
      wDot: -61.2572637,
    },
    elements: {
      aKm: 354759,
      e: 0.00001,
      // NEP081 uses ϖ = Ω − ω and λ = ϖ − M for retrograde Triton.
      omega0: 289.0733,
      M0: 7.7433,
      i0: 156.865,
      Omega0: 177.6075,
      periodDays: 360 / 61.2572638,
      periodIsSidereal: true,
      orbitDirection: -1,
      periapsisPeriodYears: 360 / (0.5237 - 0.4081),
      nodePeriodYears: 360 / 0.5237,
      apsisDirection: 1,
      nodeDirection: 1,
      laplaceRa: 299.456,
      laplaceDec: 43.4141,
    },
  },
  {
    id: 'nereid',
    name: 'Nereid',
    color: '#b8c6ca',
    symbol: 'Ⅱ',
    parent: 'neptune',
    rotation: {
      r: omegaFromWDot(360 / (11.594 / 24)),
      theta: 2.5694,
      phi: 95.5565,
    },
    iau: {
      ra0: 269.3023,
      raDot: 0,
      dec0: 69.1166,
      decDot: 0,
      w0: 0,
      wDot: 360 / (11.594 / 24),
    },
    elements: {
      aKm: 5513818,
      e: 0.75074,
      omega0: 281.1173,
      M0: 216.6923,
      i0: 7.0903,
      Omega0: 335.5701,
      periodDays: 360 / 0.9996276,
      periodIsSidereal: true,
      periapsisPeriodYears: 360 / (0.0064 - -0.0381),
      nodePeriodYears: 360 / 0.0381,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 269.3023,
      laplaceDec: 69.1166,
    },
  },
]
