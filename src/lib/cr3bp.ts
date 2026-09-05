import { vecAdd, vecCross, vecDot, vecNormalize, vecScale, vecSub } from './camera.ts'
import { EARTH_MOON_MASS_RATIO, type Vec3 } from './kepler.ts'

/** IAU Earth GM, km³/s². */
export const GM_EARTH_KM3_S2 = 398_600.4418

/** IAU Sun GM, km³/s². */
export const GM_SUN_KM3_S2 = 132_712_440_018

export type SynodicBasis = {
  x: Vec3
  y: Vec3
  z: Vec3
}

export type Cr3bpSystem = {
  mu: number
  massRatio: number
  separationKm: number
  n2: number
  /** Characteristic acceleration n² R, km/s². */
  n2R: number
  gm1: number
  gm2: number
  basis: SynodicBasis
  /** Barycenter relative to Earth, km. */
  barycenterFromEarthKm: Vec3
  moonFromEarthKm: Vec3
  /**
   * Sun relative to Earth, km. When set, U_eff gains the solar tidal term and
   * the model becomes a quasi-static bicircular four-body problem. Omit for the
   * plain CR3BP, where L1–L5 are exact equilibria.
   */
  sunFromEarthKm?: Vec3
}

export type LagrangePoints = {
  l1: Vec3
  l2: Vec3
  l3: Vec3
  l4: Vec3
  l5: Vec3
}

export type PerturbedTriangularPoints = {
  l4: Vec3 | null
  l5: Vec3 | null
}

export function earthMoonMassParameter(massRatio = EARTH_MOON_MASS_RATIO): number {
  return 1 / (massRatio + 1)
}

function hypot3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

/**
 * Right-handed synodic axes: x along Earth→Moon, z along the supplied orbit
 * normal (Gram-Schmidt so it stays perpendicular to x).
 */
export function synodicBasis(moonFromEarthKm: Vec3, orbitNormal: Vec3): SynodicBasis {
  const x = vecNormalize(moonFromEarthKm)
  const z0 = vecNormalize(orbitNormal)
  const y = vecNormalize(vecCross(z0, x))
  const z = vecNormalize(vecCross(x, y))
  if (hypot3(y) < 1e-12 || hypot3(z) < 1e-12) {
    const fallback = Math.abs(x.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }
    return synodicBasis(moonFromEarthKm, fallback)
  }
  return { x, y, z }
}

export function toSynodic(v: Vec3, basis: SynodicBasis): Vec3 {
  return { x: vecDot(v, basis.x), y: vecDot(v, basis.y), z: vecDot(v, basis.z) }
}

export function fromSynodic(v: Vec3, basis: SynodicBasis): Vec3 {
  return vecAdd(vecAdd(vecScale(basis.x, v.x), vecScale(basis.y, v.y)), vecScale(basis.z, v.z))
}

/**
 * Collinear Lagrange x-coordinates in barycentric units of the separation,
 * primary at −μ, secondary at 1−μ.
 */
export function collinearLagrangeX(mu: number): { l1: number; l2: number; l3: number } {
  const force = (x: number) => {
    const r1 = x + mu
    const r2 = x - 1 + mu
    return x - ((1 - mu) * r1) / Math.abs(r1) ** 3 - (mu * r2) / Math.abs(r2) ** 3
  }
  const deriv = (x: number) => {
    const r1 = Math.abs(x + mu)
    const r2 = Math.abs(x - 1 + mu)
    return 1 + (2 * (1 - mu)) / r1 ** 3 + (2 * mu) / r2 ** 3
  }
  const newton = (guess: number, lo: number, hi: number) => {
    let x = guess
    for (let i = 0; i < 40; i++) {
      const f = force(x)
      const d = deriv(x)
      const next = x - f / d
      x = Math.min(hi, Math.max(lo, next))
      if (Math.abs(f) < 1e-14) break
    }
    return x
  }
  const gamma = (mu / 3) ** (1 / 3)
  return {
    l1: newton(1 - mu - gamma, -mu + 1e-8, 1 - mu - 1e-8),
    l2: newton(1 - mu + gamma, 1 - mu + 1e-8, 2),
    l3: newton(-1 - (5 * mu) / 12, -2, -mu - 1e-8),
  }
}

export function cr3bpFromEarthMoon(input: {
  moonFromEarthKm: Vec3
  orbitNormal: Vec3
  massRatio?: number
  sunFromEarthKm?: Vec3
}): Cr3bpSystem {
  const massRatio = input.massRatio ?? EARTH_MOON_MASS_RATIO
  const mu = earthMoonMassParameter(massRatio)
  const gm1 = GM_EARTH_KM3_S2
  const gm2 = gm1 / massRatio
  const separationKm = hypot3(input.moonFromEarthKm)
  const n2 = (gm1 + gm2) / separationKm ** 3
  const basis = synodicBasis(input.moonFromEarthKm, input.orbitNormal)
  return {
    mu,
    massRatio,
    separationKm,
    n2,
    n2R: n2 * separationKm,
    gm1,
    gm2,
    basis,
    barycenterFromEarthKm: vecScale(input.moonFromEarthKm, mu),
    moonFromEarthKm: input.moonFromEarthKm,
    sunFromEarthKm: input.sunFromEarthKm,
  }
}

export function lagrangePoints(system: Cr3bpSystem): LagrangePoints {
  const { mu, separationKm: r, basis } = system
  const col = collinearLagrangeX(mu)
  const bary = (x: number, y: number): Vec3 =>
    fromSynodic({ x: (x + mu) * r, y: y * r, z: 0 }, basis)
  return {
    l1: bary(col.l1, 0),
    l2: bary(col.l2, 0),
    l3: bary(col.l3, 0),
    l4: bary(0.5 - mu, Math.sqrt(3) / 2),
    l5: bary(0.5 - mu, -Math.sqrt(3) / 2),
  }
}

/**
 * Finds the full solar-tide stationary points nearest the triangular CR3BP
 * references. These are instantaneous critical points of the displayed
 * synodic plane, not equilibria of the time-varying four-body system.
 */
export function perturbedTriangularPoints(system: Cr3bpSystem): PerturbedTriangularPoints {
  if (!system.sunFromEarthKm) return { l4: null, l5: null }

  const classical = lagrangePoints(system)
  return {
    l4: findPerturbedTriangularPoint(system, classical.l4),
    l5: findPerturbedTriangularPoint(system, classical.l5),
  }
}

function findPerturbedTriangularPoint(system: Cr3bpSystem, start: Vec3): Vec3 | null {
  const point = solveStationaryPointInPlane(system, toSynodic(start, system.basis))
  return point ? fromSynodic({ x: point.x, y: point.y, z: 0 }, system.basis) : null
}

function solveStationaryPointInPlane(system: Cr3bpSystem, start: Vec3): Vec3 | null {
  let point = { x: start.x, y: start.y, z: 0 }
  const h = Math.max(1, system.separationKm * 1e-5)
  const tolerance = system.n2R * 1e-10

  const gradient = (synodic: Vec3): Vec3 => {
    const earthCentered = fromSynodic({ x: synodic.x, y: synodic.y, z: 0 }, system.basis)
    return toSynodic(effectivePotentialGradient(system, earthCentered), system.basis)
  }

  for (let iteration = 0; iteration < 32; iteration++) {
    const g = gradient(point)
    const magnitude = Math.hypot(g.x, g.y)
    if (magnitude < tolerance) return point

    const gxPlus = gradient({ x: point.x + h, y: point.y, z: 0 })
    const gxMinus = gradient({ x: point.x - h, y: point.y, z: 0 })
    const gyPlus = gradient({ x: point.x, y: point.y + h, z: 0 })
    const gyMinus = gradient({ x: point.x, y: point.y - h, z: 0 })
    const jxx = (gxPlus.x - gxMinus.x) / (2 * h)
    const jyy = (gyPlus.y - gyMinus.y) / (2 * h)
    const cross = ((gxPlus.y - gxMinus.y) / (2 * h) + (gyPlus.x - gyMinus.x) / (2 * h)) / 2
    const determinant = jxx * jyy - cross * cross
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-30) return null

    let dx = (-g.x * jyy + cross * g.y) / determinant
    let dy = (cross * g.x - jxx * g.y) / determinant
    const stepLength = Math.hypot(dx, dy)
    const maximumStep = 0.1 * system.separationKm
    if (stepLength > maximumStep) {
      dx *= maximumStep / stepLength
      dy *= maximumStep / stepLength
    }

    let accepted = false
    for (let damping = 1; damping >= 1 / 128; damping /= 2) {
      const candidate = {
        x: point.x + damping * dx,
        y: point.y + damping * dy,
        z: 0,
      }
      const candidateGradient = gradient(candidate)
      if (Math.hypot(candidateGradient.x, candidateGradient.y) < magnitude) {
        point = candidate
        accepted = true
        break
      }
    }
    if (!accepted) return null
  }

  const residual = gradient(point)
  return Math.hypot(residual.x, residual.y) < tolerance ? point : null
}

/**
 * Solar third-body potential in an Earth-centered frame, km²/s², gauged to zero
 * at Earth. The direct term −GM/|r−d| is paired with the indirect term
 * +GM (r·d)/d³ that accounts for the frame itself falling toward the Sun.
 * Without that pairing the Sun would contribute its full monopole — some
 * 890 km²/s², four orders of magnitude past the 0.1 km²/s² that separates L1
 * from L4 — instead of the tide that actually survives. What is left grows as
 * r², running a few thousandths of a km²/s² at the Moon's orbit: small, but
 * several percent of that L1–L4 spread, and it swings with the Sun's angle.
 */
export function solarTidalPotential(sunFromEarthKm: Vec3, earthCenteredKm: Vec3): number {
  const d = hypot3(sunFromEarthKm)
  if (d < 1e-6) return 0
  const separation = hypot3(vecSub(earthCenteredKm, sunFromEarthKm))
  if (separation < 1e-6) return 0
  const direct = -GM_SUN_KM3_S2 * (1 / separation - 1 / d)
  const indirect = (GM_SUN_KM3_S2 * vecDot(earthCenteredKm, sunFromEarthKm)) / d ** 3
  return direct + indirect
}

/** ∇ of {@link solarTidalPotential}, km/s². Vanishes at Earth by construction. */
export function solarTidalGradient(sunFromEarthKm: Vec3, earthCenteredKm: Vec3): Vec3 {
  const d = hypot3(sunFromEarthKm)
  if (d < 1e-6) return { x: 0, y: 0, z: 0 }
  const offset = vecSub(earthCenteredKm, sunFromEarthKm)
  const separation = hypot3(offset)
  if (separation < 1e-6) return { x: 0, y: 0, z: 0 }
  return vecAdd(
    vecScale(offset, GM_SUN_KM3_S2 / separation ** 3),
    vecScale(sunFromEarthKm, GM_SUN_KM3_S2 / d ** 3),
  )
}

/**
 * ∇U_eff in km/s², Earth-centered. U_eff includes Newtonian gravity and the
 * centrifugal term in the synodic frame; equilibria are where this vanishes.
 * With a Sun on the system the solar tide is included, and the classical
 * Lagrange points no longer null the gradient exactly.
 */
export function effectivePotentialGradient(system: Cr3bpSystem, earthCenteredKm: Vec3): Vec3 {
  const barycentric = vecSub(earthCenteredKm, system.barycenterFromEarthKm)
  const syn = toSynodic(barycentric, system.basis)
  const r2 = vecSub(earthCenteredKm, system.moonFromEarthKm)
  const d1 = hypot3(earthCenteredKm)
  const d2 = hypot3(r2)
  const g1 = d1 > 1e-12 ? vecScale(earthCenteredKm, system.gm1 / d1 ** 3) : { x: 0, y: 0, z: 0 }
  const g2 = d2 > 1e-12 ? vecScale(r2, system.gm2 / d2 ** 3) : { x: 0, y: 0, z: 0 }
  const centrifugal = fromSynodic(
    { x: -system.n2 * syn.x, y: -system.n2 * syn.y, z: 0 },
    system.basis,
  )
  const total = vecAdd(vecAdd(g1, g2), centrifugal)
  if (!system.sunFromEarthKm) return total
  return vecAdd(total, solarTidalGradient(system.sunFromEarthKm, earthCenteredKm))
}

/**
 * Effective potential U such that acceleration = −∇U, km²/s². Includes the
 * solar tide when the system carries a Sun.
 */
export function effectivePotential(system: Cr3bpSystem, earthCenteredKm: Vec3): number {
  const barycentric = vecSub(earthCenteredKm, system.barycenterFromEarthKm)
  const syn = toSynodic(barycentric, system.basis)
  const d1 = hypot3(earthCenteredKm)
  const d2 = hypot3(vecSub(earthCenteredKm, system.moonFromEarthKm))
  const grav = (d1 > 1e-12 ? -system.gm1 / d1 : 0) + (d2 > 1e-12 ? -system.gm2 / d2 : 0)
  const solar = system.sunFromEarthKm
    ? solarTidalPotential(system.sunFromEarthKm, earthCenteredKm)
    : 0
  return grav + solar - 0.5 * system.n2 * (syn.x * syn.x + syn.y * syn.y)
}

export type ContourPolyline = Vec3[]

/**
 * Marching-squares iso-polylines of U_eff in the synodic orbital plane,
 * returned as Earth-centered km.
 */
export function effectivePotentialContours(
  system: Cr3bpSystem,
  levels: readonly number[],
  options?: { extent?: number; samples?: number },
): ContourPolyline[] {
  const extent = options?.extent ?? 1.45
  const samples = options?.samples ?? 72
  const r = system.separationKm
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < samples; i++) {
    xs.push(((i / (samples - 1)) * 2 - 1) * extent * r)
    ys.push(((i / (samples - 1)) * 2 - 1) * extent * r)
  }
  const grid: number[][] = ys.map((y) =>
    xs.map((x) => effectivePotential(system, fromSynodic({ x, y, z: 0 }, system.basis))),
  )
  const lines: ContourPolyline[] = []
  for (const level of levels) {
    lines.push(...marchingSquares(xs, ys, grid, level, system.basis))
  }
  return lines
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function marchingSquares(
  xs: number[],
  ys: number[],
  grid: number[][],
  level: number,
  basis: SynodicBasis,
): ContourPolyline[] {
  const polylines: ContourPolyline[] = []
  const edge = (
    x0: number,
    y0: number,
    v0: number,
    x1: number,
    y1: number,
    v1: number,
  ): Vec3 | null => {
    if ((v0 - level) * (v1 - level) > 0) return null
    const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0)
    return fromSynodic({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), z: 0 }, basis)
  }
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i]
      const x1 = xs[i + 1]
      const y0 = ys[j]
      const y1 = ys[j + 1]
      const v00 = grid[j][i]
      const v10 = grid[j][i + 1]
      const v01 = grid[j + 1][i]
      const v11 = grid[j + 1][i + 1]
      const bottom = edge(x0, y0, v00, x1, y0, v10)
      const right = edge(x1, y0, v10, x1, y1, v11)
      const top = edge(x0, y1, v01, x1, y1, v11)
      const left = edge(x0, y0, v00, x0, y1, v01)
      const pts = [bottom, right, top, left].filter((p): p is Vec3 => p !== null)
      if (pts.length >= 2) polylines.push(pts.slice(0, 2))
    }
  }
  return polylines
}

/** Orbit-normal estimate from a short finite difference of the Moon’s path. */
export function orbitNormalFromPositions(fromKm: Vec3, toKm: Vec3): Vec3 {
  const n = vecCross(fromKm, toKm)
  if (hypot3(n) < 1e-18) return { x: 0, y: 0, z: 1 }
  return vecNormalize(n)
}
