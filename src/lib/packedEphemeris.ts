import { wrapRad, type Vec3 } from './kepler.ts'

const VALUES_PER_SAMPLE = 6

/** Gaussian gravitational constant squared: GM of the Sun alone, AU³/day². */
export const SOLAR_MU = 0.0002959122082855911

/**
 * Sum of the eight planet-system masses in solar masses, from the DE440 mass
 * ratios. Small, but it is the difference between an orbit referred to the Sun
 * and one referred to the solar-system barycenter.
 */
const PLANETARY_MASS_FRACTION = 1.341831e-3

/**
 * GM of the Sun plus all eight planets, AU³/day². This is the right central
 * mass for a body outside every planet's orbit referred to the barycenter:
 * the interior mass acts as a monopole. Using the Sun's GM alone in that frame
 * leaves the derived semi-major axis drifting by an order of magnitude more.
 */
export const SOLAR_SYSTEM_MU = SOLAR_MU * (1 + PLANETARY_MASS_FRACTION)

export type StateVector = { position: Vec3; velocity: Vec3 }

export type OsculatingOrbit = {
  a: number
  e: number
  i: number
  Omega: number
  varpi: number
  meanAnomaly: number
  perihelionLongitude: number
}

export type PackedEphemerisOptions<Id extends string> = {
  /** Base64 little-endian Float32 tuples: x, y, z, vx, vy, vz. */
  encoded: Record<Id, string>
  startJd: number
  stepDays: number
  sampleCount: number
  /** Central GM, AU³/day². Must match the frame the stored vectors are in. */
  mu: number
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/** Two-body acceleration toward the origin, which the knots imply but do not store. */
function centralAcceleration(position: Vec3, mu: number): Vec3 {
  const r = Math.hypot(position.x, position.y, position.z)
  const pull = -mu / (r * r * r)
  return { x: pull * position.x, y: pull * position.y, z: pull * position.z }
}

export function osculatingOrbit(position: Vec3, velocity: Vec3, mu: number): OsculatingOrbit {
  const radius = Math.hypot(position.x, position.y, position.z)
  const angularMomentum = cross(position, velocity)
  const h = Math.hypot(angularMomentum.x, angularMomentum.y, angularMomentum.z)
  const speedSq = dot(velocity, velocity)
  const a = 1 / (2 / radius - speedSq / mu)
  const velocityCrossH = cross(velocity, angularMomentum)
  const eccentricityVector = {
    x: velocityCrossH.x / mu - position.x / radius,
    y: velocityCrossH.y / mu - position.y / radius,
    z: velocityCrossH.z / mu - position.z / radius,
  }
  const e = Math.hypot(eccentricityVector.x, eccentricityVector.y, eccentricityVector.z)
  const node = { x: -angularMomentum.y, y: angularMomentum.x, z: 0 }
  const nodeLength = Math.hypot(node.x, node.y)
  const Omega = nodeLength > 0 ? Math.atan2(node.y, node.x) : 0
  const i = h > 0 ? Math.acos(Math.min(1, Math.max(-1, angularMomentum.z / h))) : 0
  const eRadius = e * radius
  const cosNu =
    eRadius > 0 ? Math.max(-1, Math.min(1, dot(eccentricityVector, position) / eRadius)) : 1
  const sinNu =
    eRadius > 0 && h > 0
      ? dot(cross(eccentricityVector, position), angularMomentum) / (eRadius * h)
      : 0
  const trueAnomaly = Math.atan2(sinNu, cosNu)
  const eccentricAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(Math.max(0, 1 - e)) * Math.sin(trueAnomaly / 2),
      Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2),
    )
  const nodeCrossE = cross(node, eccentricityVector)
  const sinArg =
    h > 0 && nodeLength > 0 && e > 0 ? dot(nodeCrossE, angularMomentum) / (nodeLength * e * h) : 0
  const cosArg = nodeLength > 0 && e > 0 ? dot(node, eccentricityVector) / (nodeLength * e) : 1
  const varpi = wrapRad(Omega + Math.atan2(sinArg, cosArg))
  return {
    a,
    e,
    i,
    Omega: wrapRad(Omega),
    varpi,
    meanAnomaly: wrapRad(eccentricAnomaly - e * Math.sin(eccentricAnomaly)),
    perihelionLongitude: wrapRad(Math.atan2(eccentricityVector.y, eccentricityVector.x)),
  }
}

/**
 * Half-year knots of Horizons states, reconstructed with a quintic Hermite.
 *
 * The knots are a tenth of a belt orbit apart, so the curve between them has to
 * carry the shape a cubic cannot. A cubic Hermite matches position and velocity
 * at each end and lets curvature drift in between; differentiating it for the
 * velocity then loses another order, and the orbit derived from that velocity
 * is what the diagram draws. That put a few percent of spurious swing into
 * every sampled orbit, with the perihelion direction sweeping degrees and
 * snapping back at each knot — motion far larger and far faster than real
 * precession.
 *
 * Matching acceleration as well pins the curvature. It costs nothing to store,
 * because gravity gives it: the central mass holds well over 99% of the total,
 * so −μr/|r|³ is the acceleration to within the planetary perturbations. That
 * took the worst main-belt holdout error from 6.7e-3 AU to 2.4e-4 AU and left
 * the drawn orbits steady.
 */
export class PackedEphemeris<Id extends string> {
  private readonly decoded = new Map<Id, Float32Array>()
  private readonly options: PackedEphemerisOptions<Id>

  constructor(options: PackedEphemerisOptions<Id>) {
    this.options = options
  }

  get mu(): number {
    return this.options.mu
  }

  private decode(id: Id): Float32Array {
    const existing = this.decoded.get(id)
    if (existing) return existing
    const { encoded, sampleCount } = this.options
    const binary = atob(encoded[id])
    const view = new DataView(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index++) {
      view.setUint8(index, binary.charCodeAt(index))
    }
    const values = new Float32Array(sampleCount * VALUES_PER_SAMPLE)
    for (let index = 0; index < values.length; index++) {
      values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
    }
    this.decoded.set(id, values)
    return values
  }

  /** Dates outside the generated range pin to its nearest edge. */
  stateAt(id: Id, jd: number): StateVector {
    const { startJd, stepDays, sampleCount, mu } = this.options
    const values = this.decode(id)
    const component = (sample: number, field: number) => values[sample * VALUES_PER_SAMPLE + field]
    const knot = (sample: number): StateVector => ({
      position: { x: component(sample, 0), y: component(sample, 1), z: component(sample, 2) },
      velocity: { x: component(sample, 3), y: component(sample, 4), z: component(sample, 5) },
    })
    const last = sampleCount - 1
    const samplePosition = (jd - startJd) / stepDays
    const lower = Math.min(last - 1, Math.max(0, Math.floor(samplePosition)))
    const t = Math.min(1, Math.max(0, samplePosition - lower))
    const start = knot(lower)
    const end = knot(lower + 1)
    const startAcceleration = centralAcceleration(start.position, mu)
    const endAcceleration = centralAcceleration(end.position, mu)

    const t2 = t * t
    const t3 = t2 * t
    const t4 = t3 * t
    const t5 = t4 * t
    const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5
    const h1 = t - 6 * t3 + 8 * t4 - 3 * t5
    const h2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5
    const h3 = 10 * t3 - 15 * t4 + 6 * t5
    const h4 = -4 * t3 + 7 * t4 - 3 * t5
    const h5 = 0.5 * t3 - t4 + 0.5 * t5

    const d0 = (-30 * t2 + 60 * t3 - 30 * t4) / stepDays
    const d1 = 1 - 18 * t2 + 32 * t3 - 15 * t4
    const d2 = (t - 4.5 * t2 + 6 * t3 - 2.5 * t4) * stepDays
    const d3 = (30 * t2 - 60 * t3 + 30 * t4) / stepDays
    const d4 = -12 * t2 + 28 * t3 - 15 * t4
    const d5 = (1.5 * t2 - 4 * t3 + 2.5 * t4) * stepDays

    const axis = (key: keyof Vec3) => ({
      position:
        h0 * start.position[key] +
        h1 * stepDays * start.velocity[key] +
        h2 * stepDays * stepDays * startAcceleration[key] +
        h3 * end.position[key] +
        h4 * stepDays * end.velocity[key] +
        h5 * stepDays * stepDays * endAcceleration[key],
      velocity:
        d0 * start.position[key] +
        d1 * start.velocity[key] +
        d2 * startAcceleration[key] +
        d3 * end.position[key] +
        d4 * end.velocity[key] +
        d5 * endAcceleration[key],
    })

    const x = axis('x')
    const y = axis('y')
    const z = axis('z')
    return {
      position: { x: x.position, y: y.position, z: z.position },
      velocity: { x: x.velocity, y: y.velocity, z: z.velocity },
    }
  }

  orbitAt(id: Id, jd: number): OsculatingOrbit {
    const { position, velocity } = this.stateAt(id, jd)
    return osculatingOrbit(position, velocity, this.options.mu)
  }
}
