import {
  keplerOrbitPositions,
  keplerPositionAtTrueAnomaly,
  splitClosedByDepth,
  type EdgeOnPoint,
  type Vec3,
} from './kepler.ts'

export type OrbitElements = {
  a: number
  e: number
  i: number
  Omega: number
  varpi: number
}

type ProjectFn = (position: Vec3) => EdgeOnPoint

/**
 * Screen path for a Kepler ellipse under an arbitrary radial projection.
 *
 * A nonlinear screen radius (log, √-power, …) maps an ellipse to a curve that
 * is not a low-degree Bézier, so the stroke is a dense polyline. Perihelion and
 * aphelion stay analytical (ν = 0, π). Far/near uses the usual depth split.
 */
export function projectedKeplerOrbitPaths(
  orbit: OrbitElements,
  project: ProjectFn,
  farSide: 'positive' | 'negative' = 'negative',
  samples = 128,
): { far: string[]; near: string[]; peri: EdgeOnPoint; apo: EdgeOnPoint } {
  const positions = keplerOrbitPositions(
    orbit.a,
    orbit.e,
    orbit.i,
    orbit.Omega,
    orbit.varpi,
    samples,
  )
  const points = positions.map(project)
  const { far, near } = splitClosedByDepth(points, farSide)
  const peri = project(
    keplerPositionAtTrueAnomaly(orbit.a, orbit.e, orbit.i, orbit.Omega, orbit.varpi, 0),
  )
  const apo = project(
    keplerPositionAtTrueAnomaly(orbit.a, orbit.e, orbit.i, orbit.Omega, orbit.varpi, Math.PI),
  )
  return { far, near, peri, apo }
}
