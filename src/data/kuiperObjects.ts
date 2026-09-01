import { omegaFromWDot, type BodyFrames } from './planets.ts'

/**
 * Large trans-Neptunian bodies commonly treated as dwarf planets or strong
 * dwarf-planet candidates. Orbital elements and rotation periods are from
 * JPL's Small-Body Database, retrieved 2026-09-01. Diameters use spacecraft,
 * occultation, or radiometric results in the cited literature summarized by
 * the JPL/Wikipedia source trail.
 *
 * Pluto has an IAU WGCCRE cartographic frame. No standard prime meridian is
 * defined for the other bodies, and their spin poles are not uniformly known,
 * so the visualization adopts each osculating orbit normal as an explicitly
 * assumed prograde pole and W0 = 0 at J2000. That keeps the clocks usable
 * without presenting an invented orientation as measured.
 */

export type KuiperObjectId =
  'orcus' | 'pluto' | 'salacia' | 'haumea' | 'quaoar' | 'makemake' | 'gonggong' | 'eris' | 'sedna'

export type KuiperPoleSource = 'iau' | 'orbit-normal'

export type KuiperObject = BodyFrames & {
  id: KuiperObjectId
  number: number
  /** Horizons major-body ID when it differs from the minor-planet number. */
  horizonsId?: number
  name: string
  color: string
  symbol?: string
  primeMeridianDefined: boolean
  poleSource: KuiperPoleSource
  diameterKm: number
  a: number
  e: number
  inclinationDeg: number
  ascendingNodeDeg: number
  periodDays: number
}

const OBLIQUITY_DEG = 23.4392911

function assumedOrbitNormal(
  inclinationDeg: number,
  ascendingNodeDeg: number,
  rotationPeriodHours: number,
): BodyFrames {
  const toRad = Math.PI / 180
  const i = inclinationDeg * toRad
  const node = ascendingNodeDeg * toRad
  const ecliptic = {
    x: Math.sin(i) * Math.sin(node),
    y: -Math.sin(i) * Math.cos(node),
    z: Math.cos(i),
  }
  const obliquity = OBLIQUITY_DEG * toRad
  const equatorial = {
    x: ecliptic.x,
    y: ecliptic.y * Math.cos(obliquity) - ecliptic.z * Math.sin(obliquity),
    z: ecliptic.y * Math.sin(obliquity) + ecliptic.z * Math.cos(obliquity),
  }
  const ra0 = (((Math.atan2(equatorial.y, equatorial.x) / toRad) % 360) + 360) % 360
  const dec0 = Math.asin(equatorial.z) / toRad
  const wDot = 360 / (rotationPeriodHours / 24)
  return {
    rotation: {
      r: omegaFromWDot(wDot),
      theta: inclinationDeg,
      phi: (ascendingNodeDeg + 270) % 360,
    },
    iau: { ra0, raDot: 0, dec0, decDot: 0, w0: 0, wDot },
  }
}

export const KUIPER_OBJECTS: readonly KuiperObject[] = [
  {
    id: 'orcus',
    number: 90482,
    name: 'Orcus',
    color: '#a9adb2',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 910,
    a: 39.37686537914865,
    e: 0.2205240628250881,
    inclinationDeg: 20.55681019612,
    ascendingNodeDeg: 268.4053519455824,
    periodDays: 90252.68650688507,
    ...assumedOrbitNormal(20.55681019612, 268.4053519455824, 13.188),
  },
  {
    id: 'pluto',
    number: 134340,
    // The system barycenter (9) covers the full 1800–2050 app epoch; Pluto's
    // body-center solution (999) starts two days after the epoch boundary.
    horizonsId: 9,
    name: 'Pluto',
    symbol: '♇',
    color: '#c6aa8b',
    primeMeridianDefined: true,
    poleSource: 'iau',
    diameterKm: 2376.6,
    a: 39.58862938517124,
    e: 0.2518378778576892,
    inclinationDeg: 17.14771140999114,
    ascendingNodeDeg: 110.2923840543057,
    periodDays: 90981.71647718345,
    rotation: {
      r: omegaFromWDot(56.3625225),
      theta: 112.81555403149629,
      phi: 137.3508549043438,
    },
    iau: {
      ra0: 132.993,
      raDot: 0,
      dec0: -6.163,
      decDot: 0,
      w0: 302.695,
      wDot: 56.3625225,
    },
  },
  {
    id: 'salacia',
    number: 120347,
    name: 'Salacia',
    color: '#7e8791',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 846,
    a: 42.05521225409177,
    e: 0.1046039838127425,
    inclinationDeg: 23.92719899399624,
    ascendingNodeDeg: 280.254342318715,
    periodDays: 99615.78707039855,
    ...assumedOrbitNormal(23.92719899399624, 280.254342318715, 6.09),
  },
  {
    id: 'haumea',
    number: 136108,
    name: 'Haumea',
    color: '#d5d6d2',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 1595,
    a: 43.06029023650952,
    e: 0.1944430148898797,
    inclinationDeg: 28.20847393040364,
    ascendingNodeDeg: 121.7860561329425,
    periodDays: 103208.1173403618,
    ...assumedOrbitNormal(28.20847393040364, 121.7860561329425, 3.9154),
  },
  {
    id: 'quaoar',
    number: 50000,
    name: 'Quaoar',
    color: '#a98275',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 1110,
    a: 43.15617648834794,
    e: 0.03520023677935285,
    inclinationDeg: 7.991575801906905,
    ascendingNodeDeg: 188.9191248447958,
    periodDays: 103553.0434885775,
    ...assumedOrbitNormal(7.991575801906905, 188.9191248447958, 8.84),
  },
  {
    id: 'makemake',
    number: 136472,
    name: 'Makemake',
    color: '#b47d62',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 1430,
    a: 45.57093317300052,
    e: 0.1588889953992523,
    inclinationDeg: 29.02785603743067,
    ascendingNodeDeg: 79.2948338209406,
    periodDays: 112364.8068762869,
    ...assumedOrbitNormal(29.02785603743067, 79.2948338209406, 22.8266),
  },
  {
    id: 'gonggong',
    number: 225088,
    name: 'Gonggong',
    color: '#9e5e52',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 1230,
    a: 66.86666567773766,
    e: 0.5042510000302973,
    inclinationDeg: 30.89906721170288,
    ascendingNodeDeg: 336.8383156185827,
    periodDays: 199716.0317096358,
    ...assumedOrbitNormal(30.89906721170288, 336.8383156185827, 22.4),
  },
  {
    id: 'eris',
    number: 136199,
    name: 'Eris',
    symbol: '⯰',
    color: '#d8dce1',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 2326,
    a: 67.93394687853566,
    e: 0.4382385347971672,
    inclinationDeg: 43.9258279471791,
    ascendingNodeDeg: 36.00477044417249,
    periodDays: 204516.6629430732,
    ...assumedOrbitNormal(43.9258279471791, 36.00477044417249, 25.9),
  },
  {
    id: 'sedna',
    number: 90377,
    name: 'Sedna',
    color: '#a84d3e',
    primeMeridianDefined: false,
    poleSource: 'orbit-normal',
    diameterKm: 995,
    a: 543.7195289104732,
    e: 0.8598824585187618,
    inclinationDeg: 11.92527582847476,
    ascendingNodeDeg: 144.5061662673739,
    periodDays: 4630851.183590915,
    ...assumedOrbitNormal(11.92527582847476, 144.5061662673739, 10.273),
  },
]

export const KUIPER_OBJECT_BY_ID = Object.fromEntries(
  KUIPER_OBJECTS.map((object) => [object.id, object]),
) as Record<KuiperObjectId, KuiperObject>
