/**
 * Keplerian elements and rates vs the mean ecliptic and equinox of J2000.
 * Source: JPL SSD Approximate Positions of the Planets, Table 1
 * (valid 1800–2050). Angles in degrees; rates per Julian century (T).
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Spin axis directions: IAU WGCCRE 2015 pole right ascension/declination,
 * rotated into ecliptic-of-J2000 coordinates. Poles for retrograde rotators
 * (Venus, Uranus) are flipped so the stored vector is the angular velocity
 * itself, i.e. right-handed about the direction of spin. |ω| is taken from
 * the IAU prime-meridian rate so the table cannot drift from the default clock.
 *
 * Pole and prime meridian (`iau`): IAU WGCCRE 2015, as tabulated in NAIF
 * pck00011.tpc (BODY199_POLE_RA … BODY899_PM). Unlike `rotation`, these are
 * verbatim IAU values: the pole is always the north pole, so retrograde
 * rotators simply have a negative wDot. Periodic nutation and libration terms
 * are omitted; the largest error that introduces is Neptune's ±0.7° pole
 * wobble, then Mercury's ~0.03° librations.
 * https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/
 *
 * Extra meridians (`magnetic`, `cloud`, `otherMeridians`) share that pole and
 * only override W. Missing extras fall back to `iau`. See `frameFor`.
 */

/** Inclusive local-calendar window of Table 1 linear Keplerian elements (1800–2050). */
export const ELEMENTS_VALID_FROM_MS = new Date(1800, 0, 1).getTime()
export const ELEMENTS_VALID_TO_MS = new Date(2050, 11, 31, 23, 59, 59, 999).getTime()

export type PlanetId =
  'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export const ROTATION_FRAME_CHOICES = ['iau', 'magnetic', 'cloud'] as const
export type RotationFrameChoice = (typeof ROTATION_FRAME_CHOICES)[number]

export type KeplerianElements = {
  a0: number
  aDot: number
  e0: number
  eDot: number
  i0: number
  iDot: number
  L0: number
  LDot: number
  varpi0: number
  varpiDot: number
  Omega0: number
  OmegaDot: number
}

/**
 * Angular velocity ω in ecliptic-of-J2000 spherical coordinates. The direction
 * carries the sense of spin, so the magnitude is always positive.
 */
export type RotationAxis = {
  /** |ω| in radians per day. */
  r: number
  /** Polar angle from ecliptic north, degrees. Over 90° means retrograde. */
  theta: number
  /** Azimuth from the J2000 vernal equinox, degrees. */
  phi: number
}

/**
 * IAU pole direction and prime meridian angle W = w0 + wDot·d, where d is days
 * from J2000 and T is Julian centuries from J2000. W is measured easterly along
 * the body equator from its ascending node on the ICRF equator.
 */
export type IauFrame = {
  /** Pole right ascension in the ICRF, degrees, and its rate per century. */
  ra0: number
  raDot: number
  /** Pole declination in the ICRF, degrees, and its rate per century. */
  dec0: number
  decDot: number
  /** Prime meridian angle at J2000, degrees. */
  w0: number
  /** Prime meridian rate, degrees per day. Negative means retrograde. */
  wDot: number
}

/** Prime-meridian override; the pole is always copied from `iau`. */
export type PrimeMeridian = Pick<IauFrame, 'w0' | 'wDot'>

export type NamedMeridian = PrimeMeridian & {
  id: string
  label: string
}

/** The spin of anything with a pole and a prime meridian: the planets, and the Sun. */
export type BodyFrames = {
  rotation: RotationAxis
  iau: IauFrame
  /** System III / radio, when it is not the IAU cartographic W. */
  magnetic?: PrimeMeridian
  /** Optically tracked atmosphere, when it is not the IAU cartographic W. */
  cloud?: PrimeMeridian
  /** Extra published rates that the UI does not select (e.g. Jupiter System II). */
  otherMeridians?: NamedMeridian[]
}

export type Planet = BodyFrames & {
  id: PlanetId
  name: string
  color: string
  elements: KeplerianElements
  /* Unicode/Astrological symbol */
  symbol?: string
}

/** |ω| in rad/day from an IAU prime-meridian rate in deg/day. */
export function omegaFromWDot(wDot: number): number {
  return (2 * Math.PI * Math.abs(wDot)) / 360
}

/** Resolved body frame for a UI choice; missing extras use the IAU W. */
export function frameFor(body: BodyFrames, choice: RotationFrameChoice): IauFrame {
  const override =
    choice === 'magnetic' ? body.magnetic : choice === 'cloud' ? body.cloud : undefined
  return override ? { ...body.iau, ...override } : body.iau
}

/**
 * The Sun's own spin, from the same IAU WGCCRE 2015 tables as the planets. W is
 * the Carrington rate: a sidereal 25.38 d, chosen in the 1850s to match sunspots
 * at about 16° latitude. The photosphere shears with latitude — roughly 24 d at
 * the equator to 34 d near the poles — so this is one convention rather than a
 * rigid-body period, and the Sun has no separate magnetic or cloud W.
 */
export const SUN: BodyFrames & { name: string; symbol: string } = {
  name: 'Sun',
  symbol: '☉', // Gold
  rotation: { r: omegaFromWDot(14.1844), theta: 7.2517, phi: 345.7657 },
  iau: {
    ra0: 286.13,
    raDot: 0,
    dec0: 63.87,
    decDot: 0,
    w0: 84.176,
    wDot: 14.1844,
  },
}

export const PLANETS: Planet[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    color: '#b0b4bc',
    symbol: '☿', // Mercury
    rotation: { r: omegaFromWDot(6.1385108), theta: 7.0369, phi: 318.2353 },
    iau: {
      ra0: 281.0103,
      raDot: -0.0328,
      dec0: 61.4155,
      decDot: -0.0049,
      w0: 329.5988,
      wDot: 6.1385108,
    },
    elements: {
      a0: 0.38709927,
      aDot: 0.00000037,
      e0: 0.20563593,
      eDot: 0.00001906,
      i0: 7.00497902,
      iDot: -0.00594749,
      L0: 252.2503235,
      LDot: 149472.67411175,
      varpi0: 77.45779628,
      varpiDot: 0.16047689,
      Omega0: 48.33076593,
      OmegaDot: -0.12534081,
    },
  },
  {
    id: 'venus',
    name: 'Venus',
    color: '#e8c87a',
    symbol: '♀', // Copper
    rotation: { r: omegaFromWDot(-1.4813688), theta: 178.761, phi: 210.1867 },
    iau: {
      ra0: 272.76,
      raDot: 0,
      dec0: 67.16,
      decDot: 0,
      w0: 160.2,
      wDot: -1.4813688,
    },
    elements: {
      a0: 0.72333566,
      aDot: 0.0000039,
      e0: 0.00677672,
      eDot: -0.00004107,
      i0: 3.39467605,
      iDot: -0.0007889,
      L0: 181.9790995,
      LDot: 58517.81538729,
      varpi0: 131.60246718,
      varpiDot: 0.00268329,
      Omega0: 76.67984255,
      OmegaDot: -0.27769418,
    },
  },
  {
    id: 'earth',
    name: 'Earth',
    color: '#237523',
    symbol: '⊕', // Antimony
    rotation: { r: omegaFromWDot(360.9856235), theta: 23.4393, phi: 90 },
    iau: {
      ra0: 0,
      raDot: -0.641,
      dec0: 90,
      decDot: -0.557,
      w0: 190.147,
      wDot: 360.9856235,
    },
    elements: {
      a0: 1.00000261,
      aDot: 0.00000562,
      e0: 0.01671123,
      eDot: -0.00004392,
      i0: -0.00001531,
      iDot: -0.01294668,
      L0: 100.46457166,
      LDot: 35999.37244981,
      varpi0: 102.93768193,
      varpiDot: 0.32327364,
      Omega0: 0,
      OmegaDot: 0,
    },
  },
  {
    id: 'mars',
    name: 'Mars',
    color: '#c1440e',
    symbol: '♂', // Iron
    rotation: { r: omegaFromWDot(350.891982443297), theta: 25.4038, phi: 354.8436 },
    iau: {
      ra0: 317.269202,
      raDot: -0.10927547,
      dec0: 54.432516,
      decDot: -0.05827105,
      w0: 176.049863,
      wDot: 350.891982443297,
    },
    elements: {
      a0: 1.52371034,
      aDot: 0.00001847,
      e0: 0.0933941,
      eDot: 0.00007882,
      i0: 1.84969142,
      iDot: -0.00813131,
      L0: -4.55343205,
      LDot: 19140.30268499,
      varpi0: -23.94362959,
      varpiDot: 0.44441088,
      Omega0: 49.55953891,
      OmegaDot: -0.29257343,
    },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    color: '#d4a574',
    symbol: '♃', // Tin
    rotation: { r: omegaFromWDot(870.536), theta: 2.2165, phi: 247.8177 },
    // System III (magnetic). Seidelmann et al. 2002 also lists Systems I and II.
    iau: {
      ra0: 268.056595,
      raDot: -0.006499,
      dec0: 64.495303,
      decDot: 0.002413,
      w0: 284.95,
      wDot: 870.536,
    },
    cloud: { w0: 67.1, wDot: 877.9 },
    otherMeridians: [{ id: 'systemII', label: 'System II', w0: 43.3, wDot: 870.27 }],
    elements: {
      a0: 5.202887,
      aDot: -0.00011607,
      e0: 0.04838624,
      eDot: -0.00013253,
      i0: 1.30439695,
      iDot: -0.00183714,
      L0: 34.39644051,
      LDot: 3034.74612775,
      varpi0: 14.72847983,
      varpiDot: 0.21252668,
      Omega0: 100.47390909,
      OmegaDot: 0.20469106,
    },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    color: '#e6d9a8',
    symbol: '♄', // Lead
    rotation: { r: omegaFromWDot(810.7939024), theta: 28.0522, phi: 79.5275 },
    // System III (Voyager radio). IAU no longer tabulates System I; observers
    // still use 10h 14m (844.3 °/d) for the equatorial zone. W0 is the
    // traditional Davies et al. 1980 value.
    iau: {
      ra0: 40.589,
      raDot: -0.036,
      dec0: 83.537,
      decDot: -0.004,
      w0: 38.9,
      wDot: 810.7939024,
    },
    cloud: { w0: 227.2037, wDot: 844.3 },
    elements: {
      a0: 9.53667594,
      aDot: -0.0012506,
      e0: 0.05386179,
      eDot: -0.00050991,
      i0: 2.48599187,
      iDot: 0.00193609,
      L0: 49.95424423,
      LDot: 1222.49362201,
      varpi0: 92.59887831,
      varpiDot: -0.41897216,
      Omega0: 113.66242448,
      OmegaDot: -0.28867794,
    },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    color: '#7de3e0',
    symbol: '♅', // Platinum
    rotation: { r: omegaFromWDot(-501.1600928), theta: 97.7218, phi: 77.6467 },
    // System III (magnetic). No IAU cloud W — cloud mode falls back to this.
    iau: {
      ra0: 257.311,
      raDot: 0,
      dec0: -15.175,
      decDot: 0,
      w0: 203.81,
      wDot: -501.1600928,
    },
    elements: {
      a0: 19.18916464,
      aDot: -0.00196176,
      e0: 0.04725744,
      eDot: -0.00004397,
      i0: 0.77263783,
      iDot: -0.00242939,
      L0: 313.23810451,
      LDot: 428.48202785,
      varpi0: 170.9542763,
      varpiDot: 0.40805281,
      Omega0: 74.01692501,
      OmegaDot: 0.04240589,
    },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    color: '#4166f5',
    symbol: '♆', // Bismuth
    rotation: { r: omegaFromWDot(541.1397757), theta: 28.0264, phi: 319.2351 },
    // IAU 2015: Karkoschka south-polar cloud features (~15.97 h). Magnetic
    // System III is the pre-2015 radio W (~16.11 h, Seidelmann et al. 2002).
    iau: {
      ra0: 299.36,
      raDot: 0,
      dec0: 43.46,
      decDot: 0,
      w0: 249.978,
      wDot: 541.1397757,
    },
    magnetic: { w0: 253.18, wDot: 536.3128492 },
    elements: {
      a0: 30.06992276,
      aDot: 0.00026291,
      e0: 0.00859048,
      eDot: 0.00005105,
      i0: 1.77004347,
      iDot: 0.00035372,
      L0: -55.12002969,
      LDot: 218.45945325,
      varpi0: 44.96476227,
      varpiDot: -0.32241464,
      Omega0: 131.78422574,
      OmegaDot: -0.00508664,
    },
  },
]
