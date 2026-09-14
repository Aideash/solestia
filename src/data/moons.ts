/**
 * Natural satellites: mean elements at 2000-01-01.5 TDB from JPL SSD
 * Planetary Satellite Mean Elements (DE405/LE405 for the Moon, JUP365 for the
 * Galileans, SAT441 local-Laplace-plane elements for Saturn's seven moons over
 * 160 km in radius, MAR099 Laplace-plane elements for Phobos and Deimos,
 * URA182 equatorial elements for the five major Uranian moons, and NEP081
 * local-Laplace-plane elements for Proteus and Nereid; Triton is the one
 * exception, taken from the NEP097 row).
 * The Moon is referred to the J2000 ecliptic; the Galileans and Martian moons
 * use their local Laplace planes; the Uranian majors use Uranus's equator.
 * https://ssd.jpl.nasa.gov/sats/elem/sep.html
 *
 * Unlike the planet table, these are epoch elements plus periapsis/node
 * precession periods, not linear rates per century. Independent Kepler
 * ellipses will slowly drift from the Laplace 4:2:1 resonance.
 *
 * Poles and prime meridians: IAU WGCCRE 2015 / NAIF pck00011.tpc for
 * BODY501 … BODY504, BODY601 … BODY606, BODY608, BODY701 … BODY705, BODY801,
 * and BODY808; IAU 2009's periodic series for the Moon. Nereid's documented
 * approximation is the exception because the IAU provides no orientation
 * model for BODY802.
 */

import type { PlanetSystemId } from './planetSystems.ts'
import { omegaFromWDot, type BodyFrames } from './planets.ts'

export type SatelliteId =
  | 'moon'
  | 'phobos'
  | 'deimos'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'mimas'
  | 'enceladus'
  | 'tethys'
  | 'dione'
  | 'rhea'
  | 'titan'
  | 'iapetus'
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
      // Unrounded J2000 mean arguments and rates from the compact lunar
      // theory used for the principal inequalities in lib/kepler.ts.
      omega0: 318.3085034,
      M0: 134.9633964,
      i0: 5.16,
      Omega0: 125.0445479,
      // Match the IAU lunar sidereal rate used by the orientation model.
      // Rounding this to 27.322 d leaves the mean Moon about 1.5° late by 2024.
      periodDays: 27.32166155,
      periodIsSidereal: true,
      periapsisPeriodYears: 5.99685127,
      nodePeriodYears: 18.61295774,
      apsisDirection: 1,
      nodeDirection: -1,
      // The lunar elements are referred directly to the J2000 ecliptic.
      // Its north pole in ICRF coordinates supplies that plane to the shared transform.
      laplaceRa: 270,
      laplaceDec: 66.56072,
    },
  },
  {
    id: 'phobos',
    name: 'Phobos',
    color: '#c4a882',
    symbol: 'I',
    parent: 'mars',
    // IAU WGCCRE / Archinal et al.; synchronous lock matched via periodIsSidereal.
    rotation: { r: omegaFromWDot(1128.844585), theta: 26.69945076947391, phi: 352.9229488651205 },
    iau: {
      ra0: 317.67,
      raDot: -0.108,
      dec0: 52.905,
      decDot: -0.061,
      w0: 35.06,
      wDot: 1128.844585,
    },
    elements: {
      // MAR099 mean elements at 2000-01-01.5 TDB.
      aKm: 9375,
      e: 0.015,
      omega0: 216.3,
      M0: 189.7,
      i0: 1.1,
      Omega0: 169.2,
      // Match the IAU sidereal spin used by the orientation model.
      periodDays: 360 / 1128.844585,
      periodIsSidereal: true,
      periapsisPeriodYears: 1.1,
      nodePeriodYears: 2.3,
      apsisDirection: -1,
      nodeDirection: -1,
      laplaceRa: 317.7,
      laplaceDec: 52.9,
    },
  },
  {
    id: 'deimos',
    name: 'Deimos',
    color: '#9a9088',
    symbol: 'II',
    parent: 'mars',
    rotation: { r: omegaFromWDot(285.161897), theta: 25.834355492319922, phi: 352.8009501569794 },
    iau: {
      ra0: 316.65,
      raDot: -0.108,
      dec0: 53.52,
      decDot: -0.061,
      w0: 79.41,
      wDot: 285.161897,
    },
    elements: {
      aKm: 23457,
      e: 0.0001,
      omega0: 0,
      M0: 205,
      i0: 1.8,
      Omega0: 54.3,
      periodDays: 360 / 285.161897,
      periodIsSidereal: true,
      periapsisPeriodYears: 0,
      nodePeriodYears: 56.2,
      apsisDirection: -1,
      nodeDirection: -1,
      laplaceRa: 316.6,
      laplaceDec: 53.5,
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
  // SAT441 mean elements in local Laplace planes. Its period column already
  // matches the IAU synchronous spin rates, so these periods are sidereal.
  //
  // Every M0 here is solved from a Horizons state vector at the epoch rather
  // than copied from the table. Unlike the Jovian rows, which reproduce
  // Horizons to 0.1°, the tabulated Saturnian angles put these moons 5° to
  // 157° along their orbits — a least-squares precessing ellipse cannot hold
  // the phase of bodies this deep in resonance, which is what JPL means by
  // warning that the table describes orbit shape and orientation only. The
  // remaining elements are the table's; only the epoch phase is replaced, and
  // without it the synchronous moons face the wrong way.
  {
    id: 'mimas',
    name: 'Mimas',
    color: '#c8c3b8',
    symbol: 'Ⅰ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(381.994555), theta: 28.0703, phi: 79.5174 },
    iau: {
      ra0: 40.66,
      raDot: -0.036,
      dec0: 83.52,
      decDot: -0.004,
      w0: 333.46,
      wDot: 381.994555,
    },
    elements: {
      aKm: 186000,
      e: 0.02,
      omega0: 160.4,
      // Mimas alone is anchored to its mean longitude rather than its J2000
      // position. The 44.85° sin S5 term in its IAU prime meridian is not a spin
      // wobble but the Mimas–Tethys resonance swinging its orbital longitude
      // ±43° over 71 years, which a uniform mean motion cannot follow: matching
      // the J2000 position instead imports that excursion and leaves the moon
      // facing 36° off Saturn forever. Sitting at the midpoint of the libration
      // keeps the lock exact and splits the longitude error either way.
      M0: 289.103,
      i0: 1.6,
      Omega0: 66.2,
      periodDays: 0.942422,
      periodIsSidereal: true,
      periapsisPeriodYears: 0.493,
      nodePeriodYears: 0.986,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 40.6,
      laplaceDec: 83.5,
    },
  },
  {
    id: 'enceladus',
    name: 'Enceladus',
    color: '#eef2ef',
    symbol: 'Ⅱ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(262.7318996), theta: 28.0703, phi: 79.5174 },
    iau: {
      ra0: 40.66,
      raDot: -0.036,
      dec0: 83.52,
      decDot: -0.004,
      w0: 6.32,
      wDot: 262.7318996,
    },
    elements: {
      aKm: 238400,
      e: 0.005,
      omega0: 119.5,
      M0: 62.452,
      i0: 0,
      Omega0: 0,
      periodDays: 1.370218,
      periodIsSidereal: true,
      periapsisPeriodYears: 2.916,
      nodePeriodYears: 0,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 40.6,
      laplaceDec: 83.5,
    },
  },
  {
    id: 'tethys',
    name: 'Tethys',
    color: '#d9d8d2',
    symbol: 'Ⅲ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(190.6979085), theta: 28.0703, phi: 79.5174 },
    iau: {
      ra0: 40.66,
      raDot: -0.036,
      dec0: 83.52,
      decDot: -0.004,
      w0: 8.95,
      wDot: 190.6979085,
    },
    elements: {
      aKm: 295000,
      e: 0.001,
      omega0: 335.3,
      M0: 298.824,
      i0: 1.1,
      Omega0: 273,
      periodDays: 1.887802,
      periodIsSidereal: true,
      periapsisPeriodYears: 0.005,
      nodePeriodYears: 4.982,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 40.6,
      laplaceDec: 83.5,
    },
  },
  {
    id: 'dione',
    name: 'Dione',
    color: '#d2d0c9',
    symbol: 'Ⅳ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(131.5349316), theta: 28.0703, phi: 79.5174 },
    iau: {
      ra0: 40.66,
      raDot: -0.036,
      dec0: 83.52,
      decDot: -0.004,
      w0: 357.6,
      wDot: 131.5349316,
    },
    elements: {
      aKm: 377700,
      e: 0.002,
      omega0: 116,
      M0: 60.538,
      i0: 0,
      Omega0: 0,
      periodDays: 2.736916,
      periodIsSidereal: true,
      periapsisPeriodYears: 11.698,
      nodePeriodYears: 0,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 40.6,
      laplaceDec: 83.5,
    },
  },
  {
    id: 'rhea',
    name: 'Rhea',
    color: '#aaa9a5',
    symbol: 'Ⅴ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(79.6900478), theta: 28.0271, phi: 79.507 },
    iau: {
      ra0: 40.38,
      raDot: -0.036,
      dec0: 83.55,
      decDot: -0.004,
      w0: 235.16,
      wDot: 79.6900478,
    },
    elements: {
      aKm: 527200,
      e: 0.001,
      omega0: 44.3,
      M0: 234.211,
      i0: 0.3,
      Omega0: 133.7,
      periodDays: 4.517503,
      periodIsSidereal: true,
      periapsisPeriodYears: 33.939,
      nodePeriodYears: 35.775,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 40.6,
      laplaceDec: 83.5,
    },
  },
  {
    id: 'titan',
    name: 'Titan',
    color: '#d8a34a',
    symbol: 'Ⅵ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(22.5769768), theta: 28.054, phi: 79.1738 },
    iau: {
      ra0: 39.4827,
      raDot: 0,
      dec0: 83.4279,
      decDot: 0,
      w0: 186.5855,
      wDot: 22.5769768,
    },
    elements: {
      aKm: 1221900,
      e: 0.029,
      omega0: 78.3,
      M0: 217.698,
      i0: 0.3,
      Omega0: 78.6,
      periodDays: 15.945448,
      periodIsSidereal: true,
      periapsisPeriodYears: 346.68,
      nodePeriodYears: 687.37,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 36.4,
      laplaceDec: 84,
    },
  },
  {
    id: 'iapetus',
    name: 'Iapetus',
    color: '#8f806c',
    symbol: 'Ⅷ',
    parent: 'saturn',
    rotation: { r: omegaFromWDot(4.5379572), theta: 17.2762, phi: 49.6079 },
    iau: {
      ra0: 318.16,
      raDot: -3.949,
      dec0: 75.03,
      decDot: -1.143,
      w0: 355.2,
      wDot: 4.5379572,
    },
    elements: {
      aKm: 3561700,
      e: 0.028,
      omega0: 254.5,
      M0: 219.835,
      i0: 7.6,
      Omega0: 86.5,
      periodDays: 79.331002,
      periodIsSidereal: true,
      periapsisPeriodYears: 1662.9,
      nodePeriodYears: 3130.302,
      apsisDirection: 1,
      nodeDirection: -1,
      laplaceRa: 288.7,
      laplaceDec: 78.9,
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
      // NEP097 row, read with the same plain convention as every other moon: an
      // earlier NEP081 reading of these angles put Triton 122° along its orbit
      // from the ephemeris, which swung the prime meridian off Neptune.
      aKm: 354800,
      e: 0.00001,
      omega0: 0,
      M0: 63,
      i0: 157.3,
      Omega0: 178.1,
      periodDays: 360 / 61.2572638,
      periodIsSidereal: true,
      orbitDirection: -1,
      periapsisPeriodYears: 360 / (0.5237 - 0.4081),
      nodePeriodYears: 360 / 0.5237,
      apsisDirection: 1,
      nodeDirection: 1,
      laplaceRa: 299.8,
      laplaceDec: 43.1,
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
