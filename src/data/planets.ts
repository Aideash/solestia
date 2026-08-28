/**
 * Keplerian elements and rates vs the mean ecliptic and equinox of J2000.
 * Source: JPL SSD Approximate Positions of the Planets, Table 1
 * (valid 1800–2050). Angles in degrees; rates per Julian century (T).
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */

export type PlanetId =
  'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

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

export type Planet = {
  id: PlanetId
  name: string
  color: string
  elements: KeplerianElements
}

export const PLANETS: Planet[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    color: '#b0b4bc',
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
    color: '#4b9cd3',
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
