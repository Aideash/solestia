export type EpicyclePlanetId = 'moon' | 'mercury' | 'venus' | 'sun' | 'mars' | 'jupiter' | 'saturn'
export type EpicycleDepth = 1 | 2 | 3 | 4

export type EpicycleCircle = {
  radius: number
  phaseRad: number
  rateRadPerDay: number
}

export type EpicycleFit = {
  depth: EpicycleDepth
  fromMs: number
  toMs: number
  /** Offset of the deferent center from Earth, as a fraction of its radius. */
  eccentricity: number
  /** Fixed direction from Earth toward the deferent center. */
  apsisRad: number
  /** Daily rotation of the deferent's apsidal direction. */
  apsisRateRadPerDay: number
  circles: EpicycleCircle[]
  rmsErrorDeg: number
  maxErrorDeg: number
}

export type EpicycleFitCatalog = Record<EpicyclePlanetId, EpicycleFit[]>
