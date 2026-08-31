/**
 * Screen radius for an orbital distance in the orrery.
 *
 * A true-to-scale radius is unusable here: Nereid's semi-major axis is 47 times
 * Proteus's, so a linear scale buries the inner moons in Neptune's disc. The
 * old fix was to give every orbit its own ring, but that severs the link
 * between screen radius and distance, and an eccentric orbit drawn to fill its
 * own ring then dives through the rings inside it — Nereid appeared to cross
 * Triton, whose orbit it clears by a factor of 3.9.
 *
 * So the scale keeps each mean distance on the evenly spaced ring it would have
 * had, and compresses distance between those pins. Being monotonic in true
 * distance, it cannot draw a crossing that the orbits do not have, and radii
 * stay comparable across bodies. The cost is that a radial swing reads smaller
 * than it is: Nereid's 7:1 excursion draws as roughly 1.5:1.
 */

/** Just the orbit size and shape, satisfied by `PlanetState` and `SatelliteState`. */
export type OrbitExtent = {
  /** Semi-major axis, in any unit shared by every orbit in the system. */
  a: number
  e: number
}

/**
 * Distance compression between pins. Gentler than a logarithm, which flattens
 * Nereid's swing to 1.35:1, and still leaves it about 6 units clear of Triton's
 * ring. Near-circular systems are unaffected either way.
 */
const COMPRESSION = 0.35

/**
 * Maps orbital distance to screen radius for one system. `orbits` must run
 * inward to outward, as the data tables and the ring order already do. The
 * outermost apoapsis lands on `outerR`, so the whole system fits the frame.
 */
export function radialScale(
  orbits: readonly OrbitExtent[],
  innerR: number,
  outerR: number,
): (distance: number) => number {
  if (orbits.length === 0) return () => outerR

  // One orbit needs no compression, and staying linear keeps it a true ellipse.
  if (orbits.length === 1) {
    const { a, e } = orbits[0]
    const perDistance = outerR / (a * (1 + e))
    return (distance) => distance * perDistance
  }

  const pins = orbits.map((orbit) => Math.pow(orbit.a, COMPRESSION))
  const rings = orbits.map((_, i) => innerR + (i / (orbits.length - 1)) * (outerR - innerR))

  // Beyond either end the nearest segment carries on, so periapsis inside the
  // first pin and apoapsis outside the last still land somewhere sensible.
  const interpolate = (distance: number): number => {
    const x = Math.pow(distance, COMPRESSION)
    let segment = 0
    while (segment < pins.length - 2 && x > pins[segment + 1]) segment++
    const span = pins[segment + 1] - pins[segment]
    const t = span === 0 ? 0 : (x - pins[segment]) / span
    return rings[segment] + t * (rings[segment + 1] - rings[segment])
  }

  const widest = Math.max(...orbits.map((orbit) => interpolate(orbit.a * (1 + orbit.e))))
  const fit = widest > 0 ? outerR / widest : 1
  return (distance) => interpolate(distance) * fit
}
