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

/**
 * Solar orrery only: land the outermost apoapsis half a ring-step inside the
 * frame so a clipped Kuiper belt has a little width past Neptune. Planet
 * systems keep pinning that apoapsis to the frame. The step is the current
 * spacing of mean-orbit pins against `frameR`, not the span after the shrink.
 */
export function solarOrbitOuterR(innerR: number, frameR: number, bodyCount: number): number {
  if (bodyCount < 2) return frameR
  return frameR - 0.5 * ((frameR - innerR) / (bodyCount - 1))
}

/**
 * Gives a compressed orbital scale a physical inner anchor, such as a
 * planet's surface at the edge of its center disc. Distances beyond the join
 * retain the original scale; distances inside it interpolate to the anchor.
 */
export function extendRadialScaleInward(
  scale: (distance: number) => number,
  anchorDistance: number,
  anchorRadius: number,
  joinDistance: number,
): (distance: number) => number {
  const joinRadius = scale(joinDistance)
  const span = joinDistance - anchorDistance
  if (span <= 0) return scale

  return (distance) => {
    if (distance >= joinDistance) return scale(distance)
    const t = (Math.max(distance, anchorDistance) - anchorDistance) / span
    return anchorRadius + t * (joinRadius - anchorRadius)
  }
}

/**
 * Smooth log map through two anchors: `nearDistance` → `nearR`, `farDistance` →
 * `farR`. Distances outside that span keep the same log, so comet perihelia
 * inside 1 AU still dive toward the Sun without pinning the whole scale to
 * Phaethon’s perihelion.
 */
export function logRadialScale(
  nearDistance: number,
  farDistance: number,
  nearR: number,
  farR: number,
): (distance: number) => number {
  const lo = Math.max(nearDistance, Number.EPSILON)
  const hi = Math.max(farDistance, lo * (1 + Number.EPSILON))
  const logLo = Math.log(lo)
  const logSpan = Math.log(hi) - logLo
  const radiusSpan = farR - nearR
  if (!(logSpan > 0)) return () => farR

  return (distance: number) => {
    const d = Math.max(distance, Number.EPSILON)
    const t = (Math.log(d) - logLo) / logSpan
    return nearR + t * radiusSpan
  }
}

/**
 * Fits one smooth logarithmic map to the complete radial reach of a set of
 * orbits. Both perihelia and aphelia contribute, so eccentric comet orbits set
 * the scale alongside planets instead of being squeezed around planetary pins.
 */
export function extentRadialScale(
  orbits: readonly OrbitExtent[],
  innerR: number,
  outerR: number,
): (distance: number) => number {
  const extents = orbits.flatMap(({ a, e }) => [a * (1 - e), a * (1 + e)])
  const valid = extents.filter((distance) => distance > 0 && Number.isFinite(distance))
  if (valid.length === 0) return () => outerR
  return logRadialScale(Math.min(...valid), Math.max(...valid), innerR, outerR)
}

/**
 * Smooth power map through two anchors: `nearDistance` → `nearR`, `farDistance` →
 * `farR`. Gentler than a log for the decades past Neptune, so comet aphelia that
 * only modestly exceed 30 AU still read past Neptune’s ring instead of stacking
 * on it. `power` of 1 is linear; values in (0, 1) compress.
 */
export function powerRadialScale(
  nearDistance: number,
  farDistance: number,
  nearR: number,
  farR: number,
  power = 0.5,
): (distance: number) => number {
  const lo = Math.max(nearDistance, Number.EPSILON)
  const hi = Math.max(farDistance, lo * (1 + Number.EPSILON))
  const loP = Math.pow(lo, power)
  const spanP = Math.pow(hi, power) - loP
  const radiusSpan = farR - nearR
  if (!(spanP > 0)) return () => farR

  return (distance: number) => {
    const d = Math.max(distance, Number.EPSILON)
    const t = (Math.pow(d, power) - loP) / spanP
    return nearR + t * radiusSpan
  }
}
