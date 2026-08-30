/**
 * Galilean satellites: mean elements vs the local Laplace plane at
 * 2000-01-01.5 TDB, from JPL SSD Planetary Satellite Mean Elements (JUP365).
 * https://ssd.jpl.nasa.gov/sats/elem/sep.html
 *
 * Unlike the planet table, these are epoch elements plus periapsis/node
 * precession periods, not linear rates per century. Independent Kepler
 * ellipses will slowly drift from the Laplace 4:2:1 resonance.
 *
 * Poles and prime meridians: IAU WGCCRE 2015 / NAIF pck00011.tpc
 * (BODY501 … BODY504). Nutation terms omitted, same as the planets.
 * IAU longitude 0 faces Jupiter (synchronous default).
 */

import { omegaFromWDot, type BodyFrames } from './planets.ts'

export type MoonId = 'io' | 'europa' | 'ganymede' | 'callisto'

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

export type Moon = BodyFrames & {
  id: MoonId
  name: string
  color: string
  symbol: string
  parent: 'jupiter'
  elements: SatelliteElements
}

export const MOONS: Moon[] = [
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
]
