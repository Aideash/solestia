import type { SatelliteId } from './moons.ts'
import type { PlanetId } from './planets.ts'

export type PlanetSystemId = 'earth' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export const VIEW_PLANE_CHOICES = ['ecliptic', 'equator', 'edge'] as const
export type ViewPlane = (typeof VIEW_PLANE_CHOICES)[number]

/** Solar-system and asteroid orreries have no parent equator to look down. */
export const HELIOCENTRIC_VIEW_PLANE_CHOICES: readonly ViewPlane[] = ['ecliptic', 'edge']

export function cycleViewPlane(current: ViewPlane, choices: readonly ViewPlane[]): ViewPlane {
  const i = choices.indexOf(current)
  return choices[(i < 0 ? 0 : i + 1) % choices.length]
}

export type PlanetSystem = {
  id: PlanetSystemId
  name: string
  symbol: string
  routeName: `${PlanetSystemId}-system`
  path: `/orrery/${PlanetSystemId}`
  radiusKm: number
  radiusSymbol: string
  satelliteIds: readonly SatelliteId[]
  innerSatelliteCount: number
  orbitGroupName: string
  orbitPlaneName: string
  periapsisName: string
  apoapsisName: string
  /** Orrery plane when the system page opens. */
  defaultViewPlane: ViewPlane
}

export const PLANET_SYSTEMS: Record<PlanetSystemId, PlanetSystem> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    symbol: '♁',
    routeName: 'earth-system',
    path: '/orrery/earth',
    radiusKm: 6378.137,
    radiusSymbol: 'R_E',
    satelliteIds: ['moon'],
    innerSatelliteCount: 1,
    orbitGroupName: 'the Moon',
    orbitPlaneName: 'the J2000 ecliptic',
    periapsisName: 'perigee',
    apoapsisName: 'apogee',
    defaultViewPlane: 'ecliptic',
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter',
    symbol: '♃',
    routeName: 'jupiter-system',
    path: '/orrery/jupiter',
    radiusKm: 71492,
    radiusSymbol: 'R_J',
    satelliteIds: ['io', 'europa', 'ganymede', 'callisto'],
    innerSatelliteCount: 2,
    orbitGroupName: 'the Galilean moons',
    orbitPlaneName: 'each moon’s local Laplace plane',
    periapsisName: 'perijove',
    apoapsisName: 'apojove',
    defaultViewPlane: 'ecliptic',
  },
  saturn: {
    id: 'saturn',
    name: 'Saturn',
    symbol: '♄',
    routeName: 'saturn-system',
    path: '/orrery/saturn',
    radiusKm: 60268,
    radiusSymbol: 'R_S',
    satelliteIds: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
    innerSatelliteCount: 3,
    orbitGroupName: 'the seven largest Saturnian moons',
    orbitPlaneName: 'each moon’s local Laplace plane',
    periapsisName: 'perisaturnium',
    apoapsisName: 'aposaturnium',
    defaultViewPlane: 'equator',
  },
  uranus: {
    id: 'uranus',
    name: 'Uranus',
    symbol: '♅',
    routeName: 'uranus-system',
    path: '/orrery/uranus',
    radiusKm: 25559,
    radiusSymbol: 'R_U',
    satelliteIds: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
    innerSatelliteCount: 2,
    orbitGroupName: 'the five major moons',
    orbitPlaneName: 'Uranus’s equator',
    periapsisName: 'periuranion',
    apoapsisName: 'apouranion',
    defaultViewPlane: 'equator',
  },
  neptune: {
    id: 'neptune',
    name: 'Neptune',
    symbol: '♆',
    routeName: 'neptune-system',
    path: '/orrery/neptune',
    radiusKm: 24764,
    radiusSymbol: 'R_N',
    satelliteIds: ['proteus', 'triton', 'nereid'],
    innerSatelliteCount: 1,
    orbitGroupName: 'Proteus, Triton, and Nereid',
    orbitPlaneName: 'each moon’s local Laplace plane',
    periapsisName: 'perineptune',
    apoapsisName: 'aponeptune',
    defaultViewPlane: 'equator',
  },
}

export function isPlanetSystemId(id: string): id is PlanetSystemId {
  return id in PLANET_SYSTEMS
}

export function planetSystemFor(id: PlanetId): PlanetSystem | undefined {
  return isPlanetSystemId(id) ? PLANET_SYSTEMS[id] : undefined
}
